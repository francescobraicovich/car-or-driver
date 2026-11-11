import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { runPublishedRatings } from '../../packages/core/src/state-space/build.js';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';
import { createFormFeatures } from '../../packages/core/src/forecast/form-method.js';
import { scoreHead, selectHeads } from '../../packages/core/src/forecast/inference.js';
import { STATE_SPACE_HEADS } from '../../packages/core/src/state-space/forecast-heads.js';
import { ssBaseline, ssGap, pairHazard } from '../../packages/core/src/state-space/inputs.js';
import { MODEL_SETTINGS } from '../../packages/core/src/presets/model-settings.js';
import { retainedLaps, measurementRows, outcomeRows, entrants } from './evidence.mjs';

await mkdir('tmp/unified-ratings', { recursive: true });
const hash = createHash('sha256');
for (const file of (await readdir('data')).filter((file) => file.endsWith('.csv') || file === 'manifest.json').sort())
  hash.update(file).update(await readFile(`data/${file}`));
const fingerprint = hash.digest('hex');
const env = await load(2026, true);
const { weekends } = env.prep;
const laps = await retainedLaps();
console.log('Fitting unchanged production reference');
const published = runPublishedRatings(weekends, MODEL_SETTINGS.tmBoost);
const method = Object.values(STATE_SPACE_HEADS)[0].pre.formMethod ?? 'legacy';
const form = createFormFeatures(env.prep.data.lapPace, method, { track: false });
const graph = JSON.parse(await readFile('tmp/graph-evidence/baseline-history.json', 'utf8'));
if (graph.inputFingerprint !== fingerprint) throw Error('Graph reference differs from current data; rerun graph export and baseline');
const graphHistory = graph.models.baseline.history;
const moves = env.moves
  .filter((move) => move.valid && move.ell >= 0)
  .map((move) => ({
    driver: move.driverId,
    start: move.t0,
    freeze: move.ell,
    year: env.timeline[move.t0].year,
    eligibilityYear: env.timeline[move.apps[2].i].year,
    targets: move.apps.slice(0, 10).map((appearance) => appearance.i),
  }));
const query = weekends.map(() => new Set());
for (const move of moves)
  for (const index of move.targets) for (const row of weekends[index]?.rows ?? []) query[move.freeze].add(String(row.driverId));
const payload = [];
for (const [index, weekend] of weekends.entries()) {
  const original = measurementRows(weekend, env.prep.data.lapPace, laps);
  const refinedQual = measurementRows(weekend, env.prep.data.lapPace, laps, { qualifyingFormat: true });
  const refinedPace = measurementRows(weekend, env.prep.data.lapPace, laps, { exactLaps: true });
  const noPartial = original.filter((row) => row.source !== 'partial');
  const allRefinements = measurementRows(weekend, env.prep.data.lapPace, laps, {
    qualifyingFormat: true,
    exactLaps: true,
    omitPartial: true,
  });
  const outcomes = outcomeRows(weekend);
  const race = published.race.pre[index],
    qual = published.qual.pre[index];
  const maps = { D: race.drivers, C: race.cars, QD: qual.drivers, QC: qual.cars };
  // Current-session values are deliberately absent even if a future head were
  // to acquire a grid/qualifying feature. Updates happen only after predictions.
  form.beforeWeekend({
    info: weekend.info,
    rows: weekend.rawRows.map((row) => ({ ...row, grid: 0 })),
    qrows: [],
    raceSeen: weekend.raceSeen,
    ...maps,
  });
  const heads = selectHeads(STATE_SPACE_HEADS, weekend.year);
  const raw = new Map([...weekend.rawRows, ...weekend.qrows].map((row) => [row.driverId, row]));
  const tests = [...original.filter((row) => row.channel < 2), ...outcomes];
  const reference = tests.map((row) => {
    const x = raw.get(row.a),
      y = raw.get(row.b);
    const run = row.channel === 0 ? qual : race;
    const mean =
      (run.rated.get(row.a) - run.rated.get(row.b) + run.cars.get(x.constructorId) - run.cars.get(y.constructorId)) / (75 / Math.LN10);
    let probability = null;
    if (row.channel === 2) {
      const baseline = ssBaseline(
        'race',
        ssGap('race', maps, x, y),
        pairHazard(weekend.preQ, x),
        pairHazard(weekend.preQ, y),
        MODEL_SETTINGS,
      );
      probability = heads ? scoreHead(heads.pre, form.features(x, y, 'race', baseline, baseline)) : baseline;
    }
    return { mean, variance: 0, probability };
  });
  // Additional fixed measurement exam; old and new models both predict it.
  const revisedTests = [...refinedQual.filter((row) => row.channel === 0), ...refinedPace.filter((row) => row.channel === 1), ...outcomes];
  const revisedReference = revisedTests.map((row) => {
    const x = raw.get(row.a),
      y = raw.get(row.b),
      run = row.channel === 0 ? qual : race;
    return {
      mean:
        (run.rated.get(row.a) - run.rated.get(row.b) + run.cars.get(x.constructorId) - run.cars.get(y.constructorId)) / (75 / Math.LN10),
      variance: 0,
    };
  });
  const graphSnapshot = graphHistory[index];
  payload.push({
    raceId: String(weekend.info.raceId),
    year: weekend.year,
    date: weekend.info.date,
    name: weekend.info.name,
    entries: entrants(weekend),
    queryDrivers: [...query[index]],
    observations: original,
    refinements: { qualifying: refinedQual, pace: refinedPace, retirement: noPartial, all: allRefinements },
    tests,
    revisedTests,
    reference,
    revisedReference,
    graph: {
      pre: Object.fromEntries(graphSnapshot.pre.ids.map((id, i) => [id, graphSnapshot.pre.levels.race[i]])),
      post: Object.fromEntries(graphSnapshot.post.ids.map((id, i) => [id, graphSnapshot.post.levels.race[i]])),
    },
    published: Object.fromEntries(
      ['pre', 'post'].map((phase) => [
        phase,
        Object.fromEntries(
          ['qual', 'race', 'overall'].map((channel) => {
            const source = channel === 'qual' ? published.qual : published.race;
            const snapshot = phase === 'pre' ? source.pre[index] : source.ratings[index];
            return [
              channel,
              {
                drivers: Object.fromEntries(phase === 'pre' ? snapshot.rated : [...snapshot.drivers].map(([id, value]) => [id, value.m])),
                cars: Object.fromEntries(phase === 'pre' ? snapshot.cars : [...snapshot.cars].map(([id, value]) => [id, value.m])),
              },
            ];
          }),
        ),
      ]),
    ),
  });
  form.afterWeekend({ info: weekend.info, rows: weekend.rawRows, replayObs: weekend.replayObs });
}
await writeFile(
  'tmp/unified-ratings/input.json',
  JSON.stringify({
    fingerprint,
    source: await modelSourceHash(),
    moves,
    weekends: payload,
    names: { drivers: Object.fromEntries(env.prep.model.dname), cars: Object.fromEntries(env.prep.model.cname) },
  }),
);
console.log(`Exported ${payload.length} weekends, ${payload.reduce((n, week) => n + week.tests.length, 0)} fixed targets`);
