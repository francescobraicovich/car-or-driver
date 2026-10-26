import { readFileSync, writeFileSync } from 'node:fs';
import { clusterBootstrap, fitSlope, logisticCalibration, nll, observationRows } from '../packages/eval/src/index.js';
import { strictItems, strictScores, strictStayers } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { buildHybridRatings } from './hybrid_rating_model.mjs';

const predictionPath = process.argv[2] ?? '/tmp/driver-car-neural-predictions.json';
const outputPath = process.argv[3] ?? null;
const predictions = JSON.parse(readFileSync(predictionPath, 'utf8'));
const lastYear = Number(process.argv[4] ?? 2025);
const correctionShare = Number(process.argv[5] ?? 1);
const { timeline, prep, base, idx, moves } = await load(lastYear, true);
const { hybrid, qualifying } = buildHybridRatings(timeline, prep, base);
if (predictions.predictions.length !== timeline.length) throw Error('Prediction count differs from timeline');
const pre = [];
const post = [];
const z = [];
for (const [i, weekend] of timeline.entries()) {
  const prediction = predictions.predictions[i];
  if (prediction.raceId !== weekend.raceId) throw Error(`Race mismatch at ${i}`);
  const centered = (ids, values) => {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return new Map(ids.map((id, j) => [id, correctionShare * (values[j] - average)]));
  };
  const driverCorrection = centered(prediction.driverIds, prediction.driverCorrection);
  const carCorrection = centered(prediction.constructorIds, prediction.carCorrection);
  const driverPostCorrection = centered(prediction.driverIds, prediction.driverPostCorrection);
  const carPostCorrection = centered(prediction.constructorIds, prediction.carPostCorrection);
  const old = hybrid.pre[i];
  const rated = new Map([...old.rated].map(([id, value]) => [id, value + driverCorrection.get(id)]));
  const cars = new Map([...old.cars].map(([id, value]) => [id, value + carCorrection.get(id)]));
  pre.push({ ...old, rated, drivers: rated, cars });
  const oldPost = hybrid.post[i];
  post.push({ ...oldPost,
    drivers: new Map([...oldPost.drivers].map(([id, value]) => [id, {
      ...value, m: value.m + (driverPostCorrection.get(id) ?? 0),
    }])),
    cars: new Map([...oldPost.cars].map(([id, value]) => [id, {
      ...value, m: value.m + (carPostCorrection.get(id) ?? 0),
    }])),
  });
  const original = hybrid.z[i];
  const plain = new Float64Array(original.plain.length);
  const adj = new Float64Array(original.adj.length);
  for (const [j, ob] of weekend.obs.race.entries()) {
    const change = hybrid.k * (driverCorrection.get(ob.x) - driverCorrection.get(ob.y) +
      carCorrection.get(ob.cx) - carCorrection.get(ob.cy));
    plain[j] = original.plain[j] + change;
    adj[j] = original.adj[j] + change;
  }
  z.push({ plain, adj, vari: null });
}
const run = { ...hybrid, name: 'neural-lap-sequence', pre, post, z };
const raceRows = observationRows(idx, run);
const qualRows = observationRows(idx, qualifying);
const raceSlope = fitSlope(raceRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const qualSlope = fitSlope(qualRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const fieldSlope = fitSlope(raceRows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
const moverWindows = [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const predictiveWindows = [['2008-11', 2008, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
if (lastYear >= 2026) {
  moverWindows.push(['2026', 2026, 2026]);
  predictiveWindows.push(['2026', 2026, 2026]);
}
const strict = strictScores(idx, run, fieldSlope, { moves, windows: moverWindows });
const items = strictItems(idx, run, moves, 5).filter((row) => row.kind === 'tm');
const hybridRows = observationRows(idx, hybrid);
const hybridSlope = fitSlope(hybridRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const loss = (rows, slope, from, to) => {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.year < from || row.year > to) continue;
    const x = slope * row.z * (row.o ? -1 : 1);
    sum += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    weight += row.w;
  }
  return { sum, weight };
};
const idToDriver = new Map(prep.data.raw.drivers.map((row) =>
  [String(row.driverId), `${row.forename} ${row.surname}`]));
const idToCar = new Map(prep.data.raw.constructors.map((row) => [String(row.constructorId), row.name]));
const rank = (map, names) => [...map].sort((a, b) => b[1].m - a[1].m).map(([id, value], j) =>
  ({ rank: j + 1, id, name: names.get(id) ?? id, rating: +value.m.toFixed(1) }));
const drift = (snapshots, key) => {
  const changes = [];
  const fieldMean = (map) => [...map.values()].reduce((sum, value) => sum + value, 0) / map.size;
  for (let i = 1; i < snapshots.length; i++) {
    if (timeline[i].year !== timeline[i - 1].year) continue;
    const previous = snapshots[i - 1][key];
    const current = snapshots[i][key];
    const previousMean = fieldMean(previous);
    const currentMean = fieldMean(current);
    for (const [id, rating] of current) {
      if (!previous.has(id)) continue;
      changes.push(Math.abs((rating - currentMean) - (previous.get(id) - previousMean)));
    }
  }
  changes.sort((a, b) => a - b);
  return { mean: changes.reduce((sum, value) => sum + value, 0) / changes.length,
    p95: changes[Math.floor(0.95 * changes.length)], count: changes.length };
};
const pairedInterval = (rows, cluster) => clusterBootstrap(rows, (row) => row[cluster],
  (sample) => sample.reduce((sum, row) => sum + row.delta, 0) /
    sample.reduce((sum, row) => sum + row.w, 0), { B: 1000, seed: 17 });
const allPairComparison = raceRows.map((row, j) => ({ year: row.year, w: row.w,
  delta: row.w * (nll(hybridSlope * hybridRows[j].z, row.o) - nll(raceSlope * row.z, row.o)) }));
allPairComparison.push(...qualRows.map((row) => ({ year: row.year, w: row.w, delta: 0 })));
const stayerSlope = (ratingRun) => {
  const stayer = strictStayers(idx, ratingRun, 5);
  return logisticCalibration(stayer.map((row) => row.z), stayer.map((row) => row.o),
    stayer.map((row) => row.w), { intercept: false }).b;
};
const hybridMover = strictItems(idx, hybrid, moves, 5).filter((row) => row.kind === 'tm');
if (hybridMover.length !== items.length) throw Error('Mover item counts differ');
for (const [j, row] of items.entries()) {
  const prior = hybridMover[j];
  if (row.driverId !== prior.driverId || row.t0 !== prior.t0 || row.o !== prior.o || row.w !== prior.w)
    throw Error(`Mover items differ at ${j}`);
}
const oldStayerSlope = stayerSlope(hybrid);
const newStayerSlope = stayerSlope(run);
const moverComparison = items.map((row, j) => ({ year: row.year,
  move: `${row.driverId}:${row.t0}`, w: row.w,
  delta: row.w * (nll(oldStayerSlope * hybridMover[j].z, row.o) -
    nll(newStayerSlope * row.z, row.o)) }));
const result = {
  model: 'dated-neural-lap-sequence',
  options: predictions.options,
  correctionShare,
  weekends: timeline.length,
  allPair: Object.fromEntries(predictiveWindows.map(([name, from, to]) => {
    const race = loss(raceRows, raceSlope, from, to);
    const qual = loss(qualRows, qualSlope, from, to);
    return [name, { combined: (race.sum + qual.sum) / (race.weight + qual.weight),
      race: race.sum / race.weight, qualifying: qual.sum / qual.weight }];
  })),
  movers: Object.fromEntries(moverWindows.map(([name, from, to]) => {
    const selected = items.filter((row) => row.year >= from && row.year <= to);
    const weight = selected.reduce((sum, row) => sum + row.w, 0);
    const accuracy = selected.reduce((sum, row) => sum + row.w *
      (Math.abs(row.z) < 1e-10 ? 0.5 : Number((row.z > 0) === !!row.o)), 0) / weight;
    return [name, { teammateLoss: strict[`${name}.k5`].tmLoss,
      fieldLoss: strict[`${name}.k5`].fdLoss, accuracy, duels: selected.length }];
  })),
  calibration: { race: raceSlope, qualifying: qualSlope, field: fieldSlope },
  stability: { driver: { hybrid: drift(hybrid.pre, 'rated'), neural: drift(pre, 'rated') },
    car: { hybrid: drift(hybrid.pre, 'cars'), neural: drift(pre, 'cars') } },
  pairedReductionVersusHybrid: {
    allPair2008to2025: pairedInterval(allPairComparison.filter((row) => row.year >= 2008 && row.year <= 2025), 'year'),
    frozenMover2002to2025: pairedInterval(moverComparison.filter((row) => row.year >= 2002 && row.year <= 2025), 'move'),
  },
  latest: { drivers: rank(post.at(-1).drivers, idToDriver), cars: rank(post.at(-1).cars, idToCar) },
};
if (outputPath) writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
