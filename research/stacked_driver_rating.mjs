// Forward-only driver signals are combined with weights fitted solely to
// 2002-07 teammate observations. The same formula rates every driver.
import { fitSlope, observationRows } from '../packages/eval/src/index.js';
import { strictScores, strictItems } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { componentExposure, teammateNetwork } from './alternative_rating_models.mjs';
import { buildHybridRatings } from './hybrid_rating_model.mjs';

const { timeline, prep, base, idx, moves } = await load(2025, true);
const { hybrid, ranking } = buildHybridRatings(timeline, prep, base);
const exposure = componentExposure(timeline, prep.data.raw.races);
const network = teammateNetwork(timeline, 'race', prep.ctx.carOf, exposure);
const qualifyingNetwork = teammateNetwork(timeline, 'qual', prep.ctx.carOf, exposure);
const sources = [hybrid, ranking, network, qualifyingNetwork];
const sourceNames = ['hybrid', 'ranking', 'raceNetwork', 'qualifyingNetwork'];
const slopes = sources.map((source) => fitSlope(observationRows(idx, source)
  .filter((row) => row.same && row.year >= 2002 && row.year <= 2007)));
const training = [];
for (const [i, weekend] of timeline.entries()) {
  if (weekend.year < 2002 || weekend.year > 2007) continue;
  for (const ob of weekend.obs.race) {
    if (!ob.same) continue;
    const x = sources.map((source, j) => slopes[j] * source.k *
      (source.pre[i].rated.get(ob.x) - source.pre[i].rated.get(ob.y)));
    if (x.some((value) => !Number.isFinite(value))) continue;
    training.push({ x, o: ob.o, w: ob.w });
  }
}
const trainingLoss = (weights) => {
  let sum = 0;
  let mass = 0;
  for (const row of training) {
    const z = row.x.reduce((acc, value, j) => acc + weights[j] * value, 0);
    const x = z * (row.o ? -1 : 1);
    sum += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    mass += row.w;
  }
  return sum / mass;
};
const candidates = [];
for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10 - a; b++)
  for (let c = 0; c <= 10 - a - b; c++) {
    const weights = [a, b, c, 10 - a - b - c].map((value) => value / 10);
    candidates.push({ weights, fitLoss: trainingLoss(weights) });
  }
candidates.sort((a, b) => a.fitLoss - b.fitLoss);
const selected = candidates[0];
const rating = (source, i, id, phase) => phase === 'pre' ? source.pre[i].rated.get(id) : source.post[i].drivers.get(id)?.m;
const composed = {
  ...hybrid,
  name: 'stacked-portable-driver',
  pre: timeline.map((_, i) => {
    const old = hybrid.pre[i];
    const rated = new Map([...old.rated].map(([id]) => [id, sources.reduce((sum, source, j) =>
      sum + selected.weights[j] * slopes[j] * rating(source, i, id, 'pre'), 0)]));
    return { ...old, rated, drivers: rated };
  }),
  post: timeline.map((_, i) => ({ ...hybrid.post[i], drivers: new Map([...hybrid.post[i].drivers]
    .map(([id, value]) => [id, { ...value, m: sources.reduce((sum, source, j) =>
      sum + selected.weights[j] * slopes[j] * rating(source, i, id, 'post'), 0) }])) })),
};
composed.z = timeline.map((weekend, i) => {
  const old = hybrid.z[i];
  const plain = new Float64Array(old.plain.length);
  const adj = new Float64Array(old.adj.length);
  for (const [j, ob] of weekend.obs.race.entries()) {
    const change = hybrid.k * (composed.pre[i].rated.get(ob.x) - composed.pre[i].rated.get(ob.y) -
      hybrid.pre[i].rated.get(ob.x) + hybrid.pre[i].rated.get(ob.y));
    const attenuation = old.vari ? Math.sqrt(1 + (Math.PI / 8) * hybrid.k ** 2 * old.vari[j]) : 1;
    plain[j] = old.plain[j] + change;
    adj[j] = old.adj[j] + change / attenuation;
  }
  return { ...old, plain, adj };
});
const windows = [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const rows = observationRows(idx, composed);
const fieldSlope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
const allSlope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007));
const strict = strictScores(idx, composed, fieldSlope, { moves, windows });
const items = strictItems(idx, composed, moves, 5).filter((item) => item.kind === 'tm');
const loss = (selectedRows, slope, from, to) => {
  let sum = 0;
  let weight = 0;
  for (const row of selectedRows) {
    if (row.year < from || row.year > to) continue;
    const x = slope * row.z * (row.o ? -1 : 1);
    sum += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    weight += row.w;
  }
  return sum / weight;
};
console.log(JSON.stringify({ sourceNames, sourceSlopes: slopes, selected, topTraining: candidates.slice(0, 10),
  mover: windows.map(([name]) => strict[`${name}.k5`].tmLoss),
  field: windows.map(([name]) => strict[`${name}.k5`].fdLoss),
  raceLoss: windows.map(([, from, to]) => loss(rows, allSlope, from, to)),
  accuracy: windows.map(([, from, to]) => {
    const selectedItems = items.filter((item) => item.year >= from && item.year <= to);
    const weight = selectedItems.reduce((sum, item) => sum + item.w, 0);
    return selectedItems.reduce((sum, item) => sum + item.w *
      (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight;
  }),
}, null, 2));
