import assert from 'node:assert/strict';
import { load } from '../packages/research/node/strict-eval.mjs';
import { runPublishedRatings } from '../packages/core/src/state-space/build.js';
import { teammateGraphExam } from '../packages/core/src/teammate-graph-exam.js';
import { temperedHybridCandidate } from '../research/simplification/candidates-ranking.mjs';
import { mixGraph } from '../research/stable-ratings/tempered-candidates.mjs';

const env = await load(2026, true);
const weekends = env.prep.weekends.slice(0, env.timeline.length);
const production = runPublishedRatings(weekends, env.prep.ctx.tmBoost);
const baseline = temperedHybridCandidate(env, 0.25, false);
const graph = teammateGraphExam(weekends, { halfLifeYears: 3 });
let compared = 0;
const close = (actual, expected, label) => {
  assert(
    Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) < 1e-8,
    `${label}: ${actual} versus ${expected}`,
  );
  compared++;
};
for (const session of ['race', 'qual']) {
  const expected = mixGraph(env.timeline, baseline[session], graph, 0.05);
  const actual = production[session];
  for (const [i] of weekends.entries()) {
    for (const kind of ['rated', 'drivers', 'cars']) {
      assert.deepEqual([...actual.pre[i][kind].keys()], [...expected.pre[i][kind].keys()]);
      for (const [id, value] of actual.pre[i][kind]) close(value, expected.pre[i][kind].get(id), `${session} ${i} pre ${kind} ${id}`);
    }
    for (const kind of ['drivers', 'cars']) {
      assert.deepEqual([...actual.ratings[i][kind].keys()], [...expected.post[i][kind].keys()]);
      for (const [id, value] of actual.ratings[i][kind])
        close(value.m, expected.post[i][kind].get(id).m, `${session} ${i} post ${kind} ${id}`);
    }
    assert.equal(actual.predictions[i].mean.length, expected.raw.predictions[i].mean.length);
    actual.predictions[i].mean.forEach((value, j) => close(value, expected.raw.predictions[i].mean[j], `${session} ${i} prediction ${j}`));
  }
  actual.latest.mean.forEach((value, i) => close(value, expected.raw.latest.mean[i], `${session} latest ${i}`));
}
console.log(`PASS selected research and production ratings: ${compared} means and predictions`);
