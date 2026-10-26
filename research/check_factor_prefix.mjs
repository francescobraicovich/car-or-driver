import { load } from '../packages/research/node/strict-eval.mjs';
import { batchFieldFactorModel } from './batch_field_factor_model.mjs';
import { jointDuelFactorModel } from './joint_duel_factor_model.mjs';
import { neuralFactorRating } from './neural_factor_rating.mjs';

const old = await load(2025, true);
const full = await load(2026, true);
const methods = [
  ['joint-duel-factor', (env) => jointDuelFactorModel(env.timeline, env.prep.ctx.carOf).race],
  ['batch-field-factor', (env) => batchFieldFactorModel(env.timeline, env.prep.ctx.carOf)],
  ['neural-driver-car-factor', (env) => neuralFactorRating(env.timeline, 'race', env.prep.ctx.carOf)],
];
for (const [name, build] of methods.filter(([name]) => !process.argv[2] || name === process.argv[2])) {
  const first = build(old);
  const extended = build(full);
  for (let i = 0; i < old.timeline.length; i++) {
    if (old.timeline[i].raceId !== full.timeline[i].raceId) throw Error(`Timeline mismatch at ${i}`);
    for (const key of ['rated', 'cars']) {
      const a = first.pre[i][key];
      const b = extended.pre[i][key];
      if (a.size !== b.size || [...a].some(([id, value]) => !b.has(id) || Math.abs(value - b.get(id)) > 1e-9))
        throw Error(`${name}: pre-${key} changes at ${i}`);
    }
    for (const key of ['plain', 'adj']) {
      const a = first.z[i][key];
      const b = extended.z[i][key];
      if (a.length !== b.length || a.some((value, j) => Math.abs(value - b[j]) > 1e-9))
        throw Error(`${name}: prediction changes at ${i}`);
    }
  }
  console.log(JSON.stringify({ model: name, checkedWeekends: old.timeline.length,
    laterWeekends: full.timeline.length - old.timeline.length, prefixInvariant: true }));
}
