import { stateSpaceRun } from '../packages/eval/src/index.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { FINAL, load } from '../packages/research/node/strict-eval.mjs';
import { jointRatingBlend } from './joint_rating_blend.mjs';
import { teammatePaceGraph } from './teammate_pace_graph.mjs';

const build = async (lastYear) => {
  const { timeline, prep, base } = await load(lastYear, true);
  const q = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
  const r = stateSpaceRun(timeline, 'race',
    { ...prep.ctx, ...qualLink(q.raw, FINAL.beta, FINAL.gamma) },
    { ...base.race, ...FINAL.race });
  const car = jointRatingBlend(timeline, r, q, 0, 0.25);
  return { timeline, run: teammatePaceGraph(timeline, prep.data, car, prep.ctx.carOf) };
};
const old = await build(2025);
const full = await build(2026);
if (old.timeline.length >= full.timeline.length) throw Error('No later weekends');
for (let i = 0; i < old.timeline.length; i++) {
  if (old.timeline[i].raceId !== full.timeline[i].raceId) throw Error(`Timeline mismatch at ${i}`);
  for (const key of ['rated', 'cars']) {
    const a = old.run.pre[i][key];
    const b = full.run.pre[i][key];
    if (a.size !== b.size || [...a].some(([id, value]) => !b.has(id) || Math.abs(value - b.get(id)) > 1e-9))
      throw Error(`Pre-${key} changes at ${i}`);
  }
  for (const key of ['plain', 'adj']) {
    const a = old.run.z[i][key];
    const b = full.run.z[i][key];
    if (a.length !== b.length || a.some((value, j) => Math.abs(value - b[j]) > 1e-9))
      throw Error(`Prediction changes at ${i}`);
  }
}
console.log(JSON.stringify({ checkedWeekends: old.timeline.length,
  laterWeekends: full.timeline.length - old.timeline.length, prefixInvariant: true }));
