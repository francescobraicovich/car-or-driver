// Fixed research candidate: qualifying history informs race driver/car levels;
// an independent online ranking model adds portable teammate evidence.
import { writeFileSync } from 'node:fs';
import { fitSlope, observationRows } from '../packages/eval/src/index.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { discriminativeRanking } from './alternative_rating_models.mjs';
import { buildHybridRatings, HYBRID_OPTIONS } from './hybrid_rating_model.mjs';

const OPTIONS = { ...HYBRID_OPTIONS, rankingDriverShare: Number(process.argv[3] ?? HYBRID_OPTIONS.rankingDriverShare) };
const lastYear = Number(process.argv[2] ?? 2025);
if (![2025, 2026].includes(lastYear)) throw Error('Choose 2025 or 2026');
if (![0.2, 0.3].includes(OPTIONS.rankingDriverShare)) throw Error('Choose ranking share 0.2 or 0.3');
const env = await load(lastYear, true);
const { timeline, prep, base, idx, moves } = env;
const { qualifying, baseline: race, ranking, hybrid, exposure } = buildHybridRatings(timeline, prep, base, OPTIONS);
const originalRanking = discriminativeRanking(timeline, 'race', prep.ctx.carOf, exposure, { includeComponent: false });
const windows = [['2002-11', 2002, 2011], ['2008-11', 2008, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025], ...(lastYear === 2026 ? [['2026', 2026, 2026]] : [])];
const loss = (rows, slope, firstYear, lastYear) => {
  let sum = 0;
  let weight = 0;
  let count = 0;
  for (const row of rows) {
    if (row.year < firstYear || row.year > lastYear) continue;
    const x = slope * row.z * (row.o ? -1 : 1);
    sum += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    weight += row.w;
    count++;
  }
  return { loss: sum / weight, sum, weight, count };
};
const score = (run) => {
  const rows = observationRows(idx, run);
  const qualRows = observationRows(idx, qualifying);
  const slope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007));
  const qualSlope = fitSlope(qualRows.filter((row) => row.year >= 2002 && row.year <= 2007));
  const fieldSlope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
  const strict = strictScores(idx, run, fieldSlope, { moves, windows });
  const items = strictItems(idx, run, moves, 5).filter((item) => item.kind === 'tm');
  return {
    slope, qualSlope,
    allPair: Object.fromEntries(windows.filter(([name]) => name !== '2002-11').map(([name, from, to]) => {
      const r = loss(rows, slope, from, to);
      const q = loss(qualRows, qualSlope, from, to);
      return [name, { loss: (r.sum + q.sum) / (r.weight + q.weight), race: r.loss,
        qualifying: q.loss, pairs: r.count + q.count, weight: r.weight + q.weight }];
    })),
    movers: Object.fromEntries(windows.filter(([name]) => name !== '2008-11').map(([name, from, to]) => {
      const duels = items.filter((item) => item.year >= from && item.year <= to);
      const weight = duels.reduce((sum, item) => sum + item.w, 0);
      const accuracy = weight ? duels.reduce((sum, item) => sum + item.w *
        (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight : null;
      return [name, { loss: strict[`${name}.k5`].tmLoss,
        fieldLoss: strict[`${name}.k5`].fdLoss,
        duels: strict[`${name}.k5`].nTm, accuracy }];
    })),
  };
};
const baseScore = score(race);
const rankingScore = score(ranking);
const originalRankingScore = score(originalRanking);
const hybridScore = score(hybrid);
const idToDriver = new Map(prep.data.raw.drivers.map((row) => [String(row.driverId), `${row.forename} ${row.surname}`]));
const idToCar = new Map(prep.data.raw.constructors.map((row) => [String(row.constructorId), row.name]));
const latest = hybrid.post.at(-1);
const rank = (map, names) => [...map].sort((a, b) => b[1].m - a[1].m).map(([id, value], i) =>
  ({ rank: i + 1, id, name: names.get(id) ?? id, rating: +value.m.toFixed(1) }));
const result = {
  model: 'hybrid-qualifying-ranking-v1', options: OPTIONS,
  weekends: timeline.length, completed2026: timeline.filter((weekend) => weekend.year === 2026).length,
  baseline: baseScore, directRanking: originalRankingScore,
  tunedRanking: rankingScore, hybrid: hybridScore,
  latest: { drivers: rank(latest.drivers, idToDriver), cars: rank(latest.cars, idToCar) },
};
const target = new URL(`./alternative-rating-results/hybrid-qualifying-ranking-${lastYear}-share-${OPTIONS.rankingDriverShare}.json`, import.meta.url);
writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ target: target.pathname, ...result }, null, 2));
