import { writeFile } from 'node:fs/promises';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { indexTimeline } from '../../packages/eval/src/events.js';
import { situationMetrics } from '../../packages/eval/src/situations.js';
import { structuralDiagnostics } from '../../packages/eval/src/structural-diagnostics.js';
import { moverReport, forecastReport, stabilityReport } from '../stable-ratings/metrics.mjs';
import { combinedRatings, experimentRuns, validateRatings } from './comparison.mjs';
import { experimentFingerprint } from './fingerprint.mjs';

const initialFingerprint = await experimentFingerprint();
const env = await load(2026, true);
const weekends = env.prep.weekends.slice(0, env.timeline.length);
console.log('Building published, graph and fixed midpoint models');
const runs = experimentRuns(env.timeline, weekends, env.prep.ctx);
const evaluations = Object.fromEntries(Object.entries(runs).map(([name, model]) => [name, validateRatings(env.idx, model, env.moves)]));
for (const result of Object.values(evaluations)) {
  if (JSON.stringify(result.omissions) !== JSON.stringify(evaluations.published.omissions)) throw Error('Mover coverage differs');
}
// A shared car cancels in teammate duels, and the graph driver ratings are identical in both arms.
const referenceRows = evaluations.graphPublishedCars.validation.movers;
const candidateRows = evaluations.graphNewCars.validation.movers;
if (referenceRows.length !== candidateRows.length) throw Error('Graph mover observations differ');
referenceRows.forEach((row, index) => {
  if (row.kind === 'tm' && Math.abs(row.logit - candidateRows[index].logit) > 1e-9) throw Error('Cars changed a teammate forecast');
});

const idx = indexTimeline(
  env.timeline.filter((weekend) => weekend.year <= 2025),
  env.prep.ctx,
);
function latestRatings(model, combined) {
  const result = {};
  for (const [kind, idField, names] of [
    ['cars', 'constructorId', env.prep.model.cname],
    ['drivers', 'driverId', env.prep.model.dname],
  ]) {
    const race = model.race.post.at(-1)[kind],
      qual = model.qual.post.at(-1)[kind],
      blended = combined.post.at(-1)[kind];
    result[kind] = [...race]
      .map(([id, rating]) => ({
        [idField]: id,
        name: names.get(id) ?? id,
        race: 1000 + rating.m,
        qualifying: qual.get(id)?.seen ? 1000 + qual.get(id).m : null,
        combined: 1000 + blended.get(id).m,
      }))
      .sort((a, b) => b.combined - a.combined);
  }
  return { raceId: env.timeline.at(-1).raceId, year: env.timeline.at(-1).year, round: env.timeline.at(-1).round, ...result };
}
const models = {};
for (const [name, model] of Object.entries(runs)) {
  console.log(`Evaluating ${name}`);
  const combined = combinedRatings(model),
    result = evaluations[name];
  models[name] = {
    folds: result.validation.folds,
    monitoring: result.monitoring.folds,
    situations: situationMetrics(env.idx, result.validation.forecasts),
    monitoringSituations: situationMetrics(env.idx, result.monitoring.forecasts),
    latestRatings: latestRatings(model, combined),
    stability: stabilityReport(idx, combined, { bootstrap: { B: 300 } }),
    structural: Object.fromEntries(
      Object.entries({ ...model, combined }).map(([session, run]) => [session, structuralDiagnostics(idx, run, { boot: { B: 300 } })]),
    ),
    monitoringStructural: Object.fromEntries(
      Object.entries({ ...model, combined }).map(([session, run]) => [
        session,
        structuralDiagnostics(env.idx, run, { fromYear: 2026, toYear: 2026, boot: { B: 0 } }),
      ]),
    ),
  };
}
const comparisons = {};
for (const candidate of ['graphNewCars', 'midpointNewCars']) {
  comparisons[candidate] = {};
  const references =
    candidate === 'graphNewCars' ? ['published', 'graphPublishedCars'] : ['published', 'graphPublishedCars', 'graphNewCars'];
  for (const reference of references)
    comparisons[candidate][reference] = {
      forecasts: forecastReport(evaluations[reference].validation, evaluations[candidate].validation, { bootstrapRepetitions: 300 }),
      movers: moverReport(evaluations[reference].validation, evaluations[candidate].validation, { bootstrap: { B: 300 } }),
    };
}
if ((await experimentFingerprint()) !== initialFingerprint) throw Error('Sources changed during evaluation');
const result = {
  fingerprint: initialFingerprint,
  modelSource: await modelSourceHash(),
  protocol: 'research/graph-car-ratings/README.md',
  note: 'Exploratory retrospective chronological evaluation; 2026 monitoring only. Fixed 50% published/50% graph portable driver levels with conditional cars; no weight search. Experimental arms use point predictions. Full forecast heads and uncertainty coverage are not evaluated.',
  models,
  comparisons,
};
await writeFile('research/graph-car-ratings/midpoint-results.json', `${JSON.stringify(result, null, 2)}\n`);
console.log('Wrote research/graph-car-ratings/midpoint-results.json');
