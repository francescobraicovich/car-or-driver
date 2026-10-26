// Dated inputs for an external sequence learner. All features in record i are
// available before race i; its pair outcomes are targets revealed afterwards.
import { writeFileSync } from 'node:fs';
import { compareWindows } from '../packages/core/src/lap-pace.js';
import { load } from '../packages/research/node/strict-eval.mjs';
import { componentExposure, discriminativeRanking } from './alternative_rating_models.mjs';
import { buildHybridRatings } from './hybrid_rating_model.mjs';

const lastYear = Number(process.argv[2] ?? 2025);
const target = process.argv[3] ?? '/tmp/driver-car-neural-sequences.json';
const { timeline, prep, base } = await load(lastYear, true);
const { hybrid, baseline, qualifying, ranking, exposure } = buildHybridRatings(timeline, prep, base);
const qualifyingRanking = discriminativeRanking(timeline, 'qual', prep.ctx.carOf, exposure,
  { includeComponent: false, learningRate: 180, teammateWeight: 2,
    levelPenalty: 0.001, carWinterRetention: 0.8 });
const qualifyingByRace = new Map();
for (const row of prep.data.raw.qualifying) {
  const raceId = String(row.raceId);
  if (!qualifyingByRace.has(raceId)) qualifyingByRace.set(raceId, new Map());
  const seconds = (value) => {
    if (!value || value === '\\N') return NaN;
    const parts = value.split(':');
    return parts.length === 2 ? 60 * +parts[0] + +parts[1] : +value;
  };
  qualifyingByRace.get(raceId).set(String(row.driverId), seconds(row.q1));
}
const median = (values) => {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  return ordered.length ? ordered[Math.floor(ordered.length / 2)] : NaN;
};
const clamp = (value, bound) => Math.max(-bound, Math.min(bound, value));
const eventCount = Number(process.argv[4] ?? 10);
const driverEventLength = 19;
const carEventLength = 16;
const driverHistory = new Map();
const carHistory = new Map();
const pad = (history, id, length) => {
  const events = history.get(id) ?? [];
  const output = [];
  for (let j = eventCount; j > 0; j--) output.push(...(events.at(-j) ?? Array(length).fill(0)));
  return output;
};
const add = (history, id, value) => {
  if (!history.has(id)) history.set(id, []);
  const events = history.get(id);
  events.push(value);
  if (events.length > eventCount) events.shift();
};
const records = [];
for (const [i, weekend] of timeline.entries()) {
  const driverIds = weekend.rows.map((row) => String(row.driverId));
  const constructorIds = [...new Set(weekend.rows.map((row) => String(row.constructorId)))];
  const driverIndex = new Map(driverIds.map((id, index) => [id, index]));
  const constructorIndex = new Map(constructorIds.map((id, index) => [id, index]));
  const team = new Map(weekend.rows.map((row) => [String(row.driverId), String(row.constructorId)]));
  const carId = (id) => prep.ctx.carOf(id);
  const driverFeatures = driverIds.map((id) => [
    (hybrid.pre[i].rated.get(id) ?? 0) / 50,
    (baseline.pre[i].rated.get(id) ?? 0) / 50,
    (qualifying.pre[i].rated.get(id) ?? 0) / 50,
    (ranking.pre[i].rated.get(id) ?? 0) / 50,
    (qualifyingRanking.pre[i].rated.get(id) ?? 0) / 50,
    Number(exposure[i].race.has(id)),
    ...pad(driverHistory, id, driverEventLength),
  ]);
  const carFeatures = constructorIds.map((id) => [
    (hybrid.pre[i].cars.get(id) ?? 0) / 50,
    (baseline.pre[i].cars.get(id) ?? 0) / 50,
    (qualifying.pre[i].cars.get(id) ?? 0) / 50,
    (ranking.pre[i].cars.get(id) ?? 0) / 50,
    ...pad(carHistory, carId(id), carEventLength),
  ]);
  const pairs = weekend.obs.race.map((ob, j) => [
    driverIndex.get(ob.x), driverIndex.get(ob.y),
    constructorIndex.get(ob.cx), constructorIndex.get(ob.cy),
    ob.o, ob.w, hybrid.z[i].adj[j],
  ]);
  records.push({ year: weekend.year, raceId: weekend.raceId, driverIds, constructorIds,
    driverCar: driverIds.map((id) => constructorIndex.get(team.get(id))),
    driverFeatures, carFeatures, pairs });

  // Update histories only after preserving the pre-weekend record.
  const lap = prep.data.lapPace.get(weekend.raceId) ?? new Map();
  const qualify = qualifyingByRace.get(weekend.raceId) ?? new Map();
  const fieldLap = median(driverIds.map((id) => lap.get(id)?.med));
  const fieldQual = median(driverIds.map((id) => qualify.get(id)));
  const maxLap = Math.max(1, ...[...lap.values()].flatMap((row) => row.win?.map((window) => window.s) ?? [1]));
  const fieldWindows = Array.from({ length: 6 }, () => []);
  const windowsOf = (id) => {
    const windows = Array.from({ length: 6 }, () => []);
    for (const entry of lap.get(id)?.win ?? []) {
      const bin = Math.min(5, Math.floor(6 * entry.s / maxLap));
      windows[bin].push(entry.med);
    }
    return windows.map((values) => median(values));
  };
  const driverWindows = new Map(driverIds.map((id) => [id, windowsOf(id)]));
  for (const values of driverWindows.values()) for (let j = 0; j < 6; j++)
    if (Number.isFinite(values[j])) fieldWindows[j].push(values[j]);
  const windowMedian = fieldWindows.map(median);
  const driverEvents = new Map();
  for (const id of driverIds) {
    const cid = team.get(id);
    const mate = driverIds.find((other) => other !== id && team.get(other) === cid);
    const lapRow = lap.get(id);
    const mateLap = lap.get(mate);
    const matched = lapRow?.win && mateLap?.win ? compareWindows(lapRow.win, mateLap.win) : null;
    const mateGap = matched ? matched.faster * matched.gapSec : 0;
    const qualGap = Number.isFinite(qualify.get(id)) && Number.isFinite(qualify.get(mate))
      ? qualify.get(mate) - qualify.get(id) : 0;
    const same = weekend.obs.race.filter((ob) => ob.same &&
      ((ob.x === id && ob.y === mate) || (ob.x === mate && ob.y === id)));
    const sameWeight = same.reduce((sum, ob) => sum + ob.w, 0);
    const win = sameWeight ? same.reduce((sum, ob) => sum + ob.w * (ob.x === id ? ob.o : 1 - ob.o), 0) / sameWeight : 0.5;
    const windowResidual = driverWindows.get(id).map((value, j) =>
      Number.isFinite(value) && Number.isFinite(windowMedian[j]) ? clamp((windowMedian[j] - value) / 2, 2) : 0);
    const event = [
      Number.isFinite(lapRow?.med) && Number.isFinite(fieldLap) ? clamp((fieldLap - lapRow.med) / 2, 2) : 0,
      clamp(mateGap / 2, 2),
      clamp(qualGap / 2, 2),
      2 * win - 1,
      Number(weekend.wet),
      Number(exposure[i].race.has(id)),
      ...windowResidual,
      Number.isFinite(lapRow?.med) ? 1 : 0,
      Number.isFinite(qualify.get(id)) ? 1 : 0,
      (hybrid.post[i].drivers.get(id)?.m ?? 0) / 50,
      (baseline.post[i].drivers.get(id)?.m ?? 0) / 50,
      (qualifying.post[i].drivers.get(id)?.m ?? 0) / 50,
      (ranking.post[i].drivers.get(id)?.m ?? 0) / 50,
      (qualifyingRanking.post[i].drivers.get(id)?.m ?? 0) / 50,
    ];
    if (event.length !== driverEventLength) throw Error('Driver event feature width changed');
    driverEvents.set(id, event);
    add(driverHistory, id, event);
  }
  for (const cid of constructorIds) {
    const ids = driverIds.filter((id) => team.get(id) === cid);
    const average = (position) => ids.reduce((sum, id) => sum + driverEvents.get(id)[position], 0) / ids.length;
    const event = [average(0),
      Number.isFinite(fieldQual) ? ids.reduce((sum, id) => sum +
        (Number.isFinite(qualify.get(id)) ? clamp((fieldQual - qualify.get(id)) / 2, 2) : 0), 0) / ids.length : 0,
      Number(weekend.wet),
      ids.reduce((sum, id) => sum + Number(exposure[i].race.has(id)), 0) / ids.length,
      ...Array.from({ length: 6 }, (_, j) => average(6 + j)),
      average(12), average(13),
      (hybrid.post[i].cars.get(cid)?.m ?? 0) / 50,
      (baseline.post[i].cars.get(cid)?.m ?? 0) / 50,
      (qualifying.post[i].cars.get(cid)?.m ?? 0) / 50,
      (ranking.post[i].cars.get(cid)?.m ?? 0) / 50,
    ];
    if (event.length !== carEventLength) throw Error('Car event feature width changed');
    add(carHistory, carId(cid), event);
  }
  records.at(-1).lapTargets = driverIds.map((id) => driverEvents.get(id)[0]);
  records.at(-1).lapMask = driverIds.map((id) => driverEvents.get(id)[12]);
  // These snapshots are evaluated after this weekend has been learned.
  records.at(-1).driverPostFeatures = driverIds.map((id) => [
    (hybrid.post[i].drivers.get(id)?.m ?? 0) / 50,
    (baseline.post[i].drivers.get(id)?.m ?? 0) / 50,
    (qualifying.post[i].drivers.get(id)?.m ?? 0) / 50,
    (ranking.post[i].drivers.get(id)?.m ?? 0) / 50,
    (qualifyingRanking.post[i].drivers.get(id)?.m ?? 0) / 50,
    0,
    ...pad(driverHistory, id, driverEventLength),
  ]);
  records.at(-1).carPostFeatures = constructorIds.map((id) => [
    (hybrid.post[i].cars.get(id)?.m ?? 0) / 50,
    (baseline.post[i].cars.get(id)?.m ?? 0) / 50,
    (qualifying.post[i].cars.get(id)?.m ?? 0) / 50,
    (ranking.post[i].cars.get(id)?.m ?? 0) / 50,
    ...pad(carHistory, carId(id), carEventLength),
  ]);
}
writeFileSync(target, JSON.stringify({ lastYear, weekends: records }));
console.log(JSON.stringify({ target, weekends: records.length,
  pairs: records.reduce((sum, record) => sum + record.pairs.length, 0),
  driverFeatureWidth: records[0].driverFeatures[0].length,
  carFeatureWidth: records[0].carFeatures[0].length }));
