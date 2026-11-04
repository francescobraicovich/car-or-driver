// Dated production inputs and predictions for the fixed forecast simplifications.
import { mkdir, writeFile } from 'node:fs/promises';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { runSession, carLineage } from '../../packages/core/src/state-space/build.js';
import { hybridRatings } from '../../packages/core/src/hybrid/ratings.js';
import { replayForecastLayer } from '../../packages/core/src/state-space/replay.js';
import { rankingCandidates } from './candidates-ranking.mjs';
import { referenceHeads } from './reference-heads.mjs';
import { withoutForm } from '../../packages/core/src/forecast/form.js';
import { scoreHead, selectHeads } from '../../packages/core/src/forecast/inference.js';

const destination = process.argv[2] ?? 'tmp/simplification/forecast-rows.jsonl';
const candidateName = process.argv[3] ?? 'published';
// Pin the comparison to the published forecast before simplification. The
// current rating learners are verified separately against this reference.
const originalHeads = await referenceHeads();
const env = await load(2026, true);
const weekends = env.prep.weekends.slice(0, env.timeline.length);
let qual;
let hybrid;
if (candidateName === 'published') {
  qual = runSession(weekends, 'qual', env.prep.ctx.tmBoost);
  const race = runSession(weekends, 'race', env.prep.ctx.tmBoost, qual);
  hybrid = hybridRatings(weekends, race, qual, carLineage);
} else {
  if (!rankingCandidates[candidateName]) throw Error(`Unknown rating candidate: ${candidateName}`);
  const runs = rankingCandidates[candidateName](env);
  qual = runs.qual;
  hybrid = runs.race;
}
const reference = rankingCandidates.control(env);
const referenceRows = [];
replayForecastLayer(weekends, { race: reference.race.pre, qual: reference.qual.pre }, {
  lapPace: env.prep.data.lapPace,
  params: env.prep.model.params,
  heads: originalHeads,
  onRow: ({ predicted, ob, session, weight }) => referenceRows.push({ predicted, a: ob.x.driverId, b: ob.y.driverId, session, weight }),
});
const rows = [];
const signals = [
  'baseline_pre', 'race_driver', 'race_car', 'qual_driver', 'qual_car',
  'grid', 'qual_team_now', 'qual_driver_now', 'qual_gap', 'qual_rank',
  'current_q1', 'current_q2', 'current_q3', 'grid_log', 'same_team',
];
for (const channel of ['qual', 'lap', 'order']) {
  for (const speed of ['fast', 'slow']) {
    signals.push(`${channel}_${speed}`, `${channel}_${speed}_driver`);
  }
}
let sequence = 0;
replayForecastLayer(weekends, { race: hybrid.pre, qual: qual.pre }, {
  lapPace: env.prep.data.lapPace,
  params: env.prep.model.params,
  heads: originalHeads,
  onRow: ({ info, weekend, session, ob, weight, features, predicted }) => {
    const original = referenceRows[sequence++];
    if (original.a !== ob.x.driverId || original.b !== ob.y.driverId || original.session !== session || original.weight !== weight)
      throw Error('Reference and candidate observation streams differ');
    if (weekend < 20) return;
    const heads = selectHeads(originalHeads, info.year);
    rows.push({
      raceId: info.raceId, year: info.year, session, a: ob.x.driverId, b: ob.y.driverId,
      y: ob.obs, w: weight, source: ob.source ?? 'qual',
      ...Object.fromEntries(signals.map((name) => [name, features[name]])),
      published: original.predicted,
      noForm: !heads ? predicted : session === 'qual'
        ? { qual: scoreHead(heads.qual, withoutForm(features)) }
        : { pre: scoreHead(heads.pre, withoutForm(features)), post: scoreHead(heads.post, withoutForm(features)) },
    });
  },
});
await mkdir(new URL('.', new URL(destination, `file://${process.cwd()}/`)), { recursive: true });
await writeFile(destination, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
console.log(`Exported ${rows.length} dated production rows to ${destination}`);
