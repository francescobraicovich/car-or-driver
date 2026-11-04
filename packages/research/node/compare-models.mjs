// Fixed candidate comparison; all calibration is fitted before each validation block.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runPublishedRatings } from '../../core/src/state-space/build.js';
import { STATE_SPACE } from '../../core/src/presets/state-space.js';
import { chronologicalValidation, pairedDifference, VALIDATION_FOLDS } from '../../eval/src/chronological-validation.js';
import { strictItems, strictStayers } from './mover-strict.mjs';
import { makeControls } from '../../eval/src/events.js';
import { stepItems } from '../../eval/src/movers.js';
import { clusterBootstrap, ols } from '../../eval/src/stats.js';
import { load } from './strict-eval.mjs';
import { candidates } from '../../../research/simplification/candidates.mjs';
import { rankingCandidates } from '../../../research/simplification/candidates-ranking.mjs';

// Include production, evaluation, candidate, protocol and data inputs in the reproducibility record.
function sourceFingerprint() {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const paths = [];
  const collect = (path) => {
    for (const name of readdirSync(`${root}${path}`).sort()) {
      const file = `${path}/${name}`;
      if (
        [
          'packages/core/src/forecast',
          'packages/core/src/backtest.js',
          'packages/core/src/state-space/replay.js',
          'packages/core/src/state-space/forecast-heads.js',
          'packages/core/src/state-space/build.js',
        ].includes(file)
      )
        continue;
      if (statSync(`${root}${file}`).isDirectory()) collect(file);
      else if (/\.(js|mjs|csv|md)$/.test(file)) paths.push(file);
    }
  };
  for (const directory of ['packages/core/src', 'packages/eval/src', 'packages/research/node', 'data']) collect(directory);
  paths.push(
    'research/simplification/joint-duel-factor-model.mjs',
    'research/simplification/candidates.mjs',
    'research/simplification/candidates-joint.mjs',
    'research/simplification/candidates-ranking.mjs',
    'research/simplification/protocol.md',
  );
  // The build module also contains forecast-only code; hash only the identity and session-filter definitions used here.
  const build = readFileSync(`${root}packages/core/src/state-space/build.js`, 'utf8');
  const start = build.indexOf('const parent = new Map()');
  const end = build.indexOf('/**\n * Qualifying first', start);
  if (start < 0 || end < 0) throw Error('Cannot fingerprint rating session definitions');
  const digest = createHash('sha256');
  digest.update('rating session definitions\0').update(build.slice(start, end)).update('\0');
  for (const path of paths.sort())
    digest
      .update(path)
      .update('\0')
      .update(readFileSync(`${root}${path}`))
      .update('\0');
  return digest.digest('hex');
}
const initialFingerprint = sourceFingerprint();

function adapt(session, raw) {
  const k = Math.LN10 / STATE_SPACE[session].s;
  return {
    session,
    k,
    pre: raw.pre,
    post: raw.ratings,
    z: raw.predictions.map((prediction) => ({
      plain: Float64Array.from(prediction.mean, (value) => k * value),
      adj: Float64Array.from(prediction.mean, (value, i) => (k * value) / Math.sqrt(1 + (Math.PI / 8) * k * k * prediction.vari[i])),
      vari: prediction.vari,
    })),
  };
}

function published(env) {
  const weekends = env.prep.weekends.slice(0, env.timeline.length);
  const runs = runPublishedRatings(weekends, env.prep.ctx.tmBoost);
  return { race: adapt('race', runs.race), qual: adapt('qual', runs.qual) };
}

const env = await load(2026, true);
const availableCandidates = { ...candidates, ...rankingCandidates };
const requested = process.argv
  .find((argument) => argument.startsWith('--models='))
  ?.slice('--models='.length)
  .split(',');
if (requested?.some((name) => name !== 'published' && !availableCandidates[name])) throw Error('Unknown model requested');
const registry = {
  published,
  ...Object.fromEntries(Object.entries(availableCandidates).filter(([name]) => !requested || requested.includes(name))),
};
const results = {};
const cacheDirectory = fileURLToPath(new URL('../../../tmp/simplification/evaluation-cache/', import.meta.url));
mkdirSync(cacheDirectory, { recursive: true });
for (const [name, build] of Object.entries(registry)) {
  const cacheFile = `${cacheDirectory}${initialFingerprint}-${name}.json`;
  if (existsSync(cacheFile)) {
    results[name] = JSON.parse(readFileSync(cacheFile, 'utf8'));
    console.error(`Reusing ${name}`);
    continue;
  }
  console.error(`Evaluating ${name}`);
  const runs = build(env);
  const moverRows = Object.fromEntries(
    ['race', 'qual'].map((session) => [
      session,
      Object.fromEntries(
        [5, 10].map((horizon) => [
          horizon,
          {
            items: strictItems(env.idx, runs[session], env.moves, horizon),
            stayers: strictStayers(env.idx, runs[session], horizon),
          },
        ]),
      ),
    ]),
  );
  results[name] = chronologicalValidation(env.idx, runs, moverRows);
  results[name].omittedMoverObservations = Object.fromEntries(
    ['race', 'qual'].map((session) => [
      session,
      Object.fromEntries([5, 10].map((horizon) => [horizon, moverRows[session][horizon].items.omitted])),
    ]),
  );
  results[name].monitoring = env.timeline.some((weekend) => weekend.year === 2026)
    ? chronologicalValidation(env.idx, runs, moverRows, [{ from: 2026, to: 2026 }], { allowUnavailable: true }).folds[0]
    : null;
  const controls = makeControls(env.idx, runs.race);
  results[name].stability = Object.fromEntries(
    [5, 10].map((horizon) => {
      const items = stepItems(env.idx, runs.race, env.moves, horizon, controls).filter(
        (item) => item.year >= 2008 && item.year <= 2025 && Number.isFinite(item.carCtx),
      );
      if (!items.length) throw Error(`No stability observations for ${name} at ${horizon}`);
      const deviation = Math.sqrt(items.reduce((sum, item) => sum + item.delta ** 2, 0) / items.length);
      const controlDeviation = Math.sqrt(items.reduce((sum, item) => sum + item.ctlRms ** 2, 0) / items.length);
      return [
        horizon,
        {
          moves: items.length,
          deviation,
          controlDeviation,
          ratio: deviation / controlDeviation,
          carLeakage: clusterBootstrap(
            items,
            (item) => item.year,
            (sample) =>
              ols(
                sample.map((item) => item.carCtx),
                sample.map((item) => item.delta),
              ).b,
          ),
        },
      ];
    }),
  );
  if (sourceFingerprint() !== initialFingerprint) throw Error(`Source, data or protocol changed while evaluating ${name}`);
  const temporaryFile = `${cacheFile}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, JSON.stringify(results[name]));
  renameSync(temporaryFile, cacheFile);
}
const referenceName = process.argv.find((argument) => argument.startsWith('--reference='))?.slice('--reference='.length) ?? 'published';
const baseline = results[referenceName];
if (!baseline) throw Error(`Reference model ${referenceName} was not evaluated`);
const comparisons = {};
for (const [name, result] of Object.entries(results)) {
  if (name === referenceName) continue;
  for (const session of ['race', 'qual'])
    for (const horizon of [5, 10]) {
      const referenceOmissions = baseline.omittedMoverObservations[session][horizon];
      const candidateOmissions = result.omittedMoverObservations[session][horizon];
      if (JSON.stringify(referenceOmissions) !== JSON.stringify(candidateOmissions))
        throw Error(`Mover observation coverage differs for ${name} (${session}, ${horizon})`);
    }
  const forecast = (rows, filter) => rows.filter(filter);
  const pair = (filter) => pairedDifference(forecast(baseline.forecasts, filter), forecast(result.forecasts, filter), (row) => row.year);
  const safeMove = (filter) => {
    const reference = forecast(baseline.movers, filter);
    const candidate = forecast(result.movers, filter);
    if (!reference.length && !candidate.length) return { unavailable: 'No paired mover observations' };
    return pairedDifference(reference, candidate, (row) => `${row.year}:${row.driverId}:${row.t0}`);
  };
  comparisons[name] = {
    all: pair(() => true),
    teammate: pair((row) => row.same),
    raceTeammate: pair((row) => row.session === 'race' && row.same),
    qualifyingTeammate: pair((row) => row.session === 'qual' && row.same),
    movers: Object.fromEntries(
      ['race', 'qual'].flatMap((session) =>
        [5, 10].flatMap((horizon) =>
          ['tm', 'fd'].map((kind) => [
            `${session}.${horizon}.${kind}`,
            safeMove((row) => row.session === session && row.horizon === horizon && row.kind === kind),
          ]),
        ),
      ),
    ),
  };
}
// Select each residual variant only from previously completed validation blocks.
const variantNames = Object.keys(results).filter((name) => name.startsWith('joint-gaussian-driver'));
const nested = [];
for (let index = 1; index < VALIDATION_FOLDS.length && variantNames.length; index++) {
  const weightedLoss = (name) => {
    const cells = results[name].folds.slice(0, index).flatMap((fold) => [fold.sessions.race.all, fold.sessions.qual.all]);
    return cells.reduce((sum, cell) => sum + cell.loss * cell.weight, 0) / cells.reduce((sum, cell) => sum + cell.weight, 0);
  };
  const selected = variantNames.reduce((best, name) => (weightedLoss(name) < weightedLoss(best) ? name : best));
  const fold = VALIDATION_FOLDS[index];
  nested.push({
    ...fold,
    selected,
    selectedUsingThrough: fold.from - 1,
    priorLoss: weightedLoss(selected),
    published: baseline.folds[index],
    validation: results[selected].folds[index],
  });
}
const finalFingerprint = sourceFingerprint();
if (finalFingerprint !== initialFingerprint) throw Error('Source, data or protocol changed during evaluation');
const gates = Object.fromEntries(
  Object.entries(comparisons).map(([name, comparison]) => {
    const checks = {
      all: comparison.all.est <= 0.001,
      raceTeammate: comparison.raceTeammate.est <= 0.003,
      qualifyingTeammate: comparison.qualifyingTeammate.est <= 0.003,
    };
    for (const session of ['race', 'qual'])
      for (const horizon of [5, 10])
        for (const kind of ['tm', 'fd']) {
          const key = `${session}.${horizon}.${kind}`;
          const value = comparison.movers[key].est;
          checks[key] = Number.isFinite(value) ? value <= (kind === 'tm' ? 0.01 : 0.003) : null;
        }
    return [
      name,
      {
        checks,
        ratingsPass: Object.values(checks).every((value) => value === true),
        forecastPass: null,
        note: 'Forecast gates are evaluated separately; passing point estimates do not establish equivalence.',
      },
    ];
  }),
);
const output = {
  gates,
  fingerprint: { algorithm: 'sha256', value: initialFingerprint, verifiedAfterRun: true },
  nestedSelection: {
    note: 'Variants selected by pooled weighted all-pair loss on earlier completed validation blocks; the first block has no earlier selection evidence.',
    folds: nested,
  },
  protocol: {
    folds: VALIDATION_FOLDS,
    calibration: 'Expanding seasons from 2002 through the year preceding each validation block.',
    candidateSelection:
      'The initial ablations were fixed before scoring; unified candidates were added after observing those results. Historical seasons informed prior model development and are not untouched holdouts.',
    weighting: `Exam observation weights; pooled across race and qualifying observations. Differences are candidate minus ${referenceName}.`,
    uncertainty: 'Paired percentile bootstrap: seasons for pair forecasts, driver moves for frozen mover forecasts; 300 replicates.',
    frozen:
      'Driver rating before final old-team weekend; teammate rating at same time, field opponent and cars before each new-team weekend.',
  },
  models: Object.fromEntries(
    Object.entries(results).map(([name, result]) => [
      name,
      {
        folds: result.folds,
        monitoring2026: result.monitoring,
        stability: result.stability,
        omittedMoverObservations: Object.fromEntries(
          ['race', 'qual'].map((session) => [
            session,
            Object.fromEntries([5, 10].map((horizon) => [horizon, result.omittedMoverObservations[session][horizon].length])),
          ]),
        ),
      },
    ]),
  ),
  comparisons,
};
const destination = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
if (destination) {
  writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Saved comparison to ${destination}`);
} else {
  const number = (value) => (Number.isFinite(value) ? value.toFixed(5) : 'unavailable');
  const combined = (fold) => {
    const cells = [fold.sessions.race.all, fold.sessions.qual.all];
    return cells.reduce((sum, cell) => sum + cell.loss * cell.weight, 0) / cells.reduce((sum, cell) => sum + cell.weight, 0);
  };
  console.log('Historical folds were used in model development; these are retrospective, not untouched holdouts.');
  console.log('Weighted log-loss (lower is better; combined pools race and qualifying observation weights).');
  for (const [name, model] of Object.entries(output.models)) {
    console.log(`\n${name}`);
    console.log('Period       Combined     Race     Qual     Race teammates     Qual teammates');
    for (const fold of model.folds) {
      console.log(
        `${fold.from}–${fold.to}  ${number(combined(fold))}  ${number(fold.sessions.race.all.loss)}  ${number(fold.sessions.qual.all.loss)}  ${number(fold.sessions.race.teammate?.loss)}             ${number(fold.sessions.qual.teammate?.loss)}`,
      );
      for (const session of ['race', 'qual']) {
        const mover = fold.movers[session];
        console.log(
          `  ${session} frozen movers: k5 teammate ${number(mover[5].teammate?.loss)}, field ${number(mover[5].field?.loss)}; k10 teammate ${number(mover[10].teammate?.loss)}, field ${number(mover[10].field?.loss)}`,
        );
      }
    }
    const monitoring = model.monitoring2026;
    if (monitoring) {
      console.log(
        `2026 monitoring (descriptive): combined ${number(combined(monitoring))}, race ${number(monitoring.sessions.race.all.loss)}, qualifying ${number(monitoring.sessions.qual.all.loss)}`,
      );
      for (const session of ['race', 'qual']) {
        const mover = monitoring.movers[session];
        console.log(
          `  ${session} frozen movers: k5 teammate ${number(mover[5].teammate?.loss)}, field ${number(mover[5].field?.loss)}; k10 teammate ${number(mover[10].teammate?.loss)}, field ${number(mover[10].field?.loss)}`,
        );
      }
    } else console.log('2026 monitoring: unavailable');
    if (output.gates[name])
      console.log(
        `Ratings point-estimate gates: ${output.gates[name].ratingsPass ? 'pass' : 'fail or unavailable'}; forecast gates: unavailable.`,
      );
  }
}
