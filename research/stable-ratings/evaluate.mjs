// Mover-first comparison on the shared chronological exam. No chart smoothing.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { strictItems, strictStayers } from '../../packages/research/node/mover-strict.mjs';
import { chronologicalValidation } from '../../packages/eval/src/chronological-validation.js';
import { runPublishedRatings } from '../../packages/core/src/state-space/build.js';
import { rankingCandidates, temperedHybridCandidate } from '../simplification/candidates-ranking.mjs';
import { buildStableCandidates } from './candidates.mjs';
import { buildPersistentCandidates, withRaw } from './persistent-candidates.mjs';
import { buildRobustCandidates } from './robust-candidates.mjs';
import { buildTemperedCandidates } from './tempered-candidates.mjs';
import { buildTemporalCandidates } from '../temporal-graph/candidates.mjs';
import { staticGraphExam } from '../temporal-graph/static-graph-exam.mjs';
import { mixGraph } from './tempered-candidates.mjs';
import { forecastReport, moverReport, stabilityReport } from './metrics.mjs';
import { indexTimeline } from '../../packages/eval/src/events.js';
import { structuralDiagnostics } from '../../packages/eval/src/structural-diagnostics.js';
import { situationMetrics } from '../../packages/eval/src/situations.js';
import { MODEL_SETTINGS } from '../../packages/core/src/presets/model-settings.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const requested = process.argv.find((argument) => argument.startsWith('--models='))?.slice(9).split(',');
const family = process.argv.find((argument) => argument.startsWith('--family='))?.slice(9) ?? 'published';
const factories = { initial: buildStableCandidates, persistent: buildPersistentCandidates, robust: buildRobustCandidates, tempered: buildTemperedCandidates, temporal: buildTemporalCandidates };
if (family !== 'published' && !factories[family]) throw Error('Unknown stable-rating family');
const repetitions = Number(process.argv.find((argument) => argument.startsWith('--bootstrap='))?.slice(12) ?? (output ? 300 : 0));
if (!Number.isSafeInteger(repetitions) || repetitions < 0) throw Error('Bootstrap repetitions must be a nonnegative integer');
const stabilityRepetitions = Number(process.argv.find((argument) => argument.startsWith('--stability-bootstrap='))?.slice(22) ?? 0);
if (!Number.isSafeInteger(stabilityRepetitions) || stabilityRepetitions < 0) throw Error('Stability bootstrap repetitions must be a nonnegative integer');

async function fingerprint() {
  const files = [];
  async function collect(directory, extensions) {
    for (const item of await readdir(join(root, directory), { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) await collect(path, extensions);
      else if (extensions.some((extension) => item.name.endsWith(extension))) files.push(path);
    }
  }
  await Promise.all([
    collect('packages/core/src', ['.js']),
    collect('packages/eval/src', ['.js']),
    collect('packages/research/node', ['.mjs']),
    collect('research/stable-ratings', ['.mjs', '.md']),
    collect('research/temporal-graph', ['.mjs', '.md']),
    collect('research/current-form', ['.mjs', '.py', '.md', '.json']),
    collect('data', ['.csv']),
  ]);
  files.push('research/simplification/candidates-ranking.mjs');
  try {
    await readFile(join(root, 'research/stable-ratings/selected-forecast-report.json'));
    files.push('research/stable-ratings/selected-forecast-report.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file).update('\0').update(await readFile(join(root, file))).update('\0');
  return hash.digest('hex');
}

const initialFingerprint = await fingerprint();
let forecastEvidence = null;
try {
  forecastEvidence = JSON.parse(await readFile(join(root, 'research/stable-ratings/selected-forecast-report.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const currentModelSource = (await modelSourceHash()).sourceHash;
const env = await load(2026, true);
const candidates = family === 'published' ? null : factories[family](env);
const available = family === 'published' ? ['baseline', 'tempered-t0.25-g0', 'previous-static', 'neutral-g0', 'published'] : Object.keys(candidates);
if (requested?.some((name) => !available.includes(name))) throw Error('Unknown stable-rating candidate');
const included = new Set(requested ?? available);
const controlOf = (name) => ['previous-static', 'current-temporal'].includes(name) ? 'tempered-t0.25' :
  ['neutral-static', 'neutral-temporal', 'published'].includes(name) ? 'neutral' : /^(persistent-a[\d.]+|robust-c[\d.]+|tempered-t[\d.]+)-g[\d.]+-h/.exec(name)?.[1];
for (const name of [...included]) if (controlOf(name)) included.add(`${controlOf(name)}-g0`);
const names = ['baseline', ...available.filter((name) => name !== 'baseline' && included.has(name))];
const cacheDirectory = join(root, 'tmp/stable-ratings/evaluation-cache');
await mkdir(cacheDirectory, { recursive: true });

let frozenRuns;
let matchedControlRuns;
let neutralControlRuns;
function modelRuns(name) {
  if (family !== 'published') return candidates[name];
  if (name === 'published') {
    const runs = runPublishedRatings(env.prep.weekends.slice(0, env.timeline.length), env.prep.ctx.tmBoost);
    return Object.fromEntries(['race', 'qual'].map((session) => {
      const raw = runs[session], k = Math.LN10 / raw.hyper.s;
      return [session, { session, k, pre: raw.pre, post: raw.ratings, raw,
        z: raw.predictions.map((prediction) => {
          const plain = Float64Array.from(prediction.mean, (value) => k * value);
          return { plain, vari: prediction.vari, adj: Float64Array.from(plain, (value, index) =>
            value / Math.sqrt(1 + Math.PI / 8 * k * k * prediction.vari[index])) };
        }) }];
    }));
  }
  frozenRuns ??= rankingCandidates['without-qualifying-car-link'](env);
  if (name === 'baseline') return frozenRuns;
  if (name === 'neutral-g0') {
    neutralControlRuns ??= temperedHybridCandidate(env, 0.25, false);
    return { race: withRaw(neutralControlRuns.race), qual: withRaw(neutralControlRuns.qual) };
  }
  matchedControlRuns ??= temperedHybridCandidate(env, 0.25);
  if (name === 'previous-static') {
    const graph = staticGraphExam(env.prep.weekends.slice(0, env.timeline.length), { halfLifeYears: 3 });
    return Object.fromEntries(['race', 'qual'].map((session) => [session, mixGraph(env.timeline, matchedControlRuns[session], graph, 0.05)]));
  }
  return { race: withRaw(matchedControlRuns.race), qual: withRaw(matchedControlRuns.qual) };
}

function combined(runs) {
  const weight = MODEL_SETTINGS.qualOn ? MODEL_SETTINGS.qualWeight : 0;
  return {
    k: runs.race.k,
    performanceSession: 'race',
    pre: runs.race.pre.map((snapshot, index) => {
      const rated = new Map([...snapshot.rated].map(([id, value]) => [id,
        (1 - weight) * value + weight * (runs.qual.pre[index].rated.get(id) ?? value)]));
      return { rated, drivers: rated };
    }),
    post: runs.race.post.map((snapshot, index) => ({
      ...Object.fromEntries(['drivers', 'cars'].map((kind) => [kind, new Map([...snapshot[kind]].map(([id, value]) => {
        const qual = runs.qual.post[index][kind].get(id);
        return [id, { ...value, m: qual && qual.seen !== false ? (1 - weight) * value.m + weight * qual.m : value.m }];
      }))])),
    })),
  };
}

async function evaluate(name) {
  const path = join(cacheDirectory, `${initialFingerprint}-${name}-stability${stabilityRepetitions}.json`);
  try {
    const result = JSON.parse(await readFile(path, 'utf8'));
    if (result.fingerprint !== initialFingerprint || result.name !== name) throw Error('Mismatched evaluation checkpoint');
    console.error(`Reusing ${name}`);
    return result;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  console.error(`Evaluating ${name}`);
  const runs = modelRuns(name);
  const movers = Object.fromEntries(['race', 'qual'].map((session) => [session, Object.fromEntries([5, 10].map((horizon) => [horizon, {
    items: strictItems(env.idx, runs[session], env.moves, horizon),
    stayers: strictStayers(env.idx, runs[session], horizon),
  }]))]));
  const validation = chronologicalValidation(env.idx, runs, movers);
  const omissions = Object.fromEntries(['race', 'qual'].map((session) => [session, Object.fromEntries([5, 10].map((horizon) => [horizon, movers[session][horizon].items.omitted]))]));
  const monitoring = chronologicalValidation(env.idx, runs, movers, [{ from: 2026, to: 2026 }], { allowUnavailable: true });
  let diagnostics = null;
  if (name === 'published') {
    const timeline = env.timeline.filter((weekend) => weekend.year <= 2025);
    const idx = indexTimeline(timeline, env.prep.ctx);
    const views = { race: runs.race, qual: runs.qual, combined: combined(runs) };
    diagnostics = {
      period: '2008-2025',
      structural: Object.fromEntries(Object.entries(views)
        .map(([session, run]) => [session, structuralDiagnostics(idx, { ...run, session }, { boot: { B: repetitions } })])),
      monitoringStructural: Object.fromEntries(Object.entries(views)
        .map(([session, run]) => [session, structuralDiagnostics(env.idx, { ...run, session },
          { fromYear: 2026, toYear: 2026, boot: { B: 0 } })])),
      situations: situationMetrics(env.idx, validation.forecasts),
      monitoringSituations: situationMetrics(env.idx, monitoring.forecasts),
    };
  }
  const stability = Object.fromEntries(Object.entries({ race: runs.race, qual: runs.qual, combined: combined(runs) }).map(([session, run]) => [session,
    stabilityReport(env.idx, run, { bootstrap: { B: stabilityRepetitions } }),
  ]));
  const examples = Object.fromEntries(['847', '1', '863'].map((id) => [id, env.timeline.flatMap((weekend, index) => {
    if (weekend.year < 2021 || weekend.year > 2022) return [];
    const race = runs.race.post[index].drivers.get(id), qual = runs.qual.post[index].drivers.get(id);
    if (!race || !qual) return [];
    return [{ date: env.prep.weekends[index].info.date, race: race.m + 1000, qual: qual.m + 1000, combined: 1000 + 0.65 * race.m + 0.35 * qual.m }];
  })]));
  const driverLearningRules = Object.fromEntries(['race', 'qual'].map((session) => {
    const settings = runs[session].raw.hyper;
    return [session, { sdJ: settings.sdJ, shrinkM: settings.shrinkM, mMover: settings.mMover }];
  }));
  const result = { name, fingerprint: initialFingerprint, validation, monitoring, omissions, stability, diagnostics, examples, driverLearningRules };
  if (await fingerprint() !== initialFingerprint) throw Error('Source, data or protocol changed while evaluating');
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(result));
  await rename(temporary, path);
  return result;
}

const results = {};
for (const name of names) results[name] = await evaluate(name);
const reference = results.baseline;
const comparisons = {};
const noGreater = (value, limit) => Number.isFinite(value) && Number.isFinite(limit) && value <= limit;
if (!output) console.log('Frozen movers: equal weight per move; mean of race/qualifying at 5/10 weekends. Historical validation; 2026 monitoring is separate.');
for (const name of names) {
  const result = results[name];
  if (JSON.stringify(reference.omissions) !== JSON.stringify(result.omissions)) throw Error(`Mover coverage differs for ${name}`);
  const movers = moverReport(reference.validation, result.validation, { bootstrap: { B: repetitions } });
  const forecasts = forecastReport(reference.validation, result.validation, { bootstrapRepetitions: repetitions });
  const baselineStability = reference.stability.combined.postToPost.categories;
  const candidateStability = result.stability.combined.postToPost.categories;
  const checks = {
    movers: Number.isFinite(movers.pooled.primary.difference.est) && movers.pooled.primary.difference.est < 0,
    medianChange: noGreater(candidateStability.all.median, Number.isFinite(baselineStability.all.median) ? 0.8 * baselineStability.all.median : NaN),
    p90Change: noGreater(candidateStability.all.p90, Number.isFinite(baselineStability.all.p90) ? 0.65 * baselineStability.all.p90 : NaN),
    p99Change: noGreater(candidateStability.all.p99, Number.isFinite(baselineStability.all.p99) ? 0.65 * baselineStability.all.p99 : NaN),
    seasonBoundary: noGreater(candidateStability.seasonBoundary.p90, Number.isFinite(baselineStability.seasonBoundary.p90) ? 0.65 * baselineStability.seasonBoundary.p90 : NaN),
    teamChange: noGreater(candidateStability.teamChange.p90, Number.isFinite(baselineStability.teamChange.p90) ? 0.65 * baselineStability.teamChange.p90 : NaN),
    allPairs: noGreater(forecasts.pooled.all.est, 0.003),
    raceTeammate: noGreater(forecasts.pooled.raceTeammate.est, 0.005),
    qualTeammate: noGreater(forecasts.pooled.qualTeammate.est, 0.005),
  };
  for (const [cell, values] of Object.entries(movers.pooled.cells)) {
    const rowDifference = Number.isFinite(values.rowWeightedCandidate) && Number.isFinite(values.rowWeightedReference)
      ? values.rowWeightedCandidate - values.rowWeightedReference : NaN;
    checks[`${cell}.weighted`] = noGreater(rowDifference, cell.endsWith('.tm') ? 0.005 : 0.003);
    if (cell.endsWith('.tm')) checks[`${cell}.balanced`] = Number.isFinite(values.reference) && Number.isFinite(values.candidate)
      && noGreater(values.candidate - values.reference, 0.005);
  }
  let graphIncremental = null;
  if (family !== 'initial') {
    const matched = controlOf(name);
    checks.graphIncluded = !!matched;
    if (matched) {
      const controlName = `${matched}-g0`;
      const control = comparisons[controlName];
      if (!control) throw Error(`Missing matched graph-free control: ${controlName}`);
      const controlP99 = results[controlName].stability.combined.postToPost.categories.all.p99;
      const difference = movers.pooled.primary.candidate - control.movers.pooled.primary.candidate;
      graphIncremental = { control: controlName, primaryMoverDifference: difference,
        p99ChangeRatio: candidateStability.all.p99 / controlP99 };
      graphIncremental.primaryInterval = moverReport(results[controlName].validation, result.validation,
        { bootstrap: { B: repetitions } }).pooled.primary.difference;
      checks.graphIncremental = Number.isFinite(difference) && (difference < 0 ||
        (noGreater(candidateStability.all.p99, 0.95 * controlP99) && difference <= 0.001));
    }
  }
  const preferenceChecks = {
    smallMoverCost: noGreater(movers.pooled.primary.difference.est, 0.010),
    medianChange: checks.medianChange, p90Change: checks.p90Change, p99Change: checks.p99Change,
    seasonBoundary: checks.seasonBoundary, teamChange: checks.teamChange,
    graphIncluded: checks.graphIncluded === true,
  };
  const forecastPass = name === 'published' && forecastEvidence?.publishedSourceHash === currentModelSource
    ? forecastEvidence.acceptedPointGuards === true : null;
  const previousProduction = name === 'published' && results['previous-static'] ? {
    movers: moverReport(results['previous-static'].validation, result.validation, { bootstrap: { B: repetitions } }),
    forecasts: forecastReport(results['previous-static'].validation, result.validation, { bootstrapRepetitions: repetitions }),
  } : null;
  const identicalDriverLearning = ['race', 'qual'].every((session) => {
    const settings = result.driverLearningRules[session];
    return settings.sdJ === 0 && settings.shrinkM === 1 && settings.mMover === 1;
  });
  comparisons[name] = { movers, forecasts, checks, graphIncremental, previousProduction,
    userConstraint: { identicalDriverLearning, selectedUnderHardRequirement: identicalDriverLearning && ['published', 'neutral-temporal'].includes(name),
      note: 'The user explicitly required identical portable-driver learning across transfers after seeing the higher frozen mover loss. The earlier small-cost guard remains separately reported.' },
    ratingPass: Object.values(checks).every(Boolean), forecastPass,
    userTradeoff: { checks: preferenceChecks, accepted: Object.values(preferenceChecks).every(Boolean),
      note: 'User accepted a small mover cost for smoother ratings. Original raw-score failures remain visible; complete forecast limits are evaluated separately.' } };
  const s = candidateStability.all;
  const compact = { name, primaryMoverDelta: movers.pooled.primary.difference.est,
    allPairDelta: forecasts.pooled.all.est, medianChange: s.median, p90Change: s.p90, p99Change: s.p99,
    identicalDriverLearning, ratingPass: comparisons[name].ratingPass, userTradeoffAccepted: comparisons[name].userTradeoff.accepted,
    failures: Object.keys(checks).filter((key) => !checks[key]) };
  if (output) console.log(JSON.stringify(compact));
  else console.log(`${name}: mover loss ${movers.pooled.primary.candidate.toFixed(5)} (Δ ${compact.primaryMoverDelta.toFixed(5)}); ` +
    `rating |Δ| median/p90/p99 ${s.median.toFixed(2)}/${s.p90.toFixed(2)}/${s.p99.toFixed(2)}; ` +
    `earlier cost guard ${compact.userTradeoffAccepted ? 'passed' : 'failed'}; identical transfer learning ${identicalDriverLearning ? 'yes' : 'reference'}; full forecast validation ${forecastPass === true ? 'passed' : 'separate'}`);
  if (!output && result.diagnostics) {
    const fmt = (value) => Number.isFinite(value) ? value.toFixed(3) : 'n/a';
    for (const [session, diagnostic] of Object.entries(result.diagnostics.structural)) {
      const shock = diagnostic.shocks.groups['in-season windows'];
      const mate = diagnostic.teammateArrivals[5].all;
      console.log(`  ${session}: teammate change (5 weekends) n=${mate.n}, mean=${fmt(mate.mean.est)}, movement/control=${fmt(mate.rmsRatio.est)}; ` +
        `driver/car correlation=${fmt(shock.corr)}, slope=${fmt(shock.slope.est)}, performance slope=${fmt(shock.slopeFree.est)}; ` +
        `driver/car revision continuation=${fmt(diagnostic.revisions.driver.continuation.est)}/${fmt(diagnostic.revisions.car.continuation.est)}`);
    }
    for (const [session, situations] of Object.entries(result.diagnostics.situations)) for (const [label, scores] of Object.entries(situations)) {
      if (scores.unweighted) console.log(`  ${session} ${label}: n=${scores.unweighted.count}, weighted/unweighted loss=${fmt(scores.weighted.loss)}/${fmt(scores.unweighted.loss)}, ` +
        `unweighted calibration slope=${fmt(scores.unweighted.calibrationSlope)}`);
    }
  }
}
if (await fingerprint() !== initialFingerprint) throw Error('Source, data or protocol changed during comparison');
const report = {
  fingerprint: { algorithm: 'sha256', value: initialFingerprint, verifiedAfterRun: true },
  uncertainty: { moverBootstrap: repetitions, stabilityBootstrap: stabilityRepetitions },
  protocol: `${['temporal', 'published'].includes(family) ? 'research/temporal-graph' : 'research/stable-ratings'}/protocol.md; retrospective chronological validation, 2026 monitoring only.`,
  family,
  comparisons,
  models: Object.fromEntries(Object.entries(results).map(([name, result]) => [name, {
    folds: result.validation.folds, monitoring: result.monitoring.folds, stability: result.stability, diagnostics: result.diagnostics, driverLearningRules: result.driverLearningRules,
    examples: result.examples, omissions: Object.fromEntries(Object.entries(result.omissions).map(([session, horizons]) => [session,
      Object.fromEntries(Object.entries(horizons).map(([horizon, values]) => [horizon, values.length])),
    ])),
  }])),
};
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
