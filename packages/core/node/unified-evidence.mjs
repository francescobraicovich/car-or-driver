import { readFile } from 'node:fs/promises';
import { censoredQualifyingIds, censoredQualifyingSegments, qualifyingEvidenceTime } from '../src/qualifying.js';
import { isFinishStatusName, defaultClass } from '../src/status.js';
import { carLineage, canonicalTeam } from '../src/state-space/build.js';

export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n ? (sorted[Math.floor(n / 2)] + sorted[Math.floor((n - 1) / 2)]) / 2 : null;
};

/** Retain the established 105% filter; change only the matching operation. */
export async function retainedLaps(path = 'data/lap_times.csv') {
  const lines = (await readFile(path, 'utf8')).trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  const indices = ['raceId', 'driverId', 'lap', 'milliseconds'].map((name) => header.indexOf(name));
  const groups = new Map();
  for (const line of lines) {
    const columns = line.split(',');
    const [race, driver, lap, milliseconds] = indices.map((i) => columns[i]);
    if (!(+lap > 1 && +milliseconds > 0)) continue;
    const key = `${race}|${driver}`;
    const values = groups.get(key) ?? [];
    values.push([+lap, +milliseconds / 1000]);
    groups.set(key, values);
  }
  return new Map(
    [...groups].map(([key, values]) => {
      const limit = Math.min(...values.map(([, seconds]) => seconds)) * 1.05;
      return [key, new Map(values.filter(([, seconds]) => seconds <= limit))];
    }),
  );
}

export function matchedPace(first, second) {
  if (!first || !second) return null;
  const windows = new Map();
  let count = 0;
  for (const [lap, a] of first) {
    const b = second.get(lap);
    if (!(a > 0 && b > 0)) continue;
    const key = Math.floor((lap - 2) / 8);
    const values = windows.get(key) ?? [];
    values.push((2 * (b - a)) / (a + b));
    windows.set(key, values);
    count++;
  }
  if (count < 4) return null;
  // Each segment is one dependent cluster; long windows do not dominate.
  return { margin: median([...windows.values()].map(median)), coverage: Math.min(1, count / 16), laps: count };
}

function windowMargin(first, second) {
  if (!first || !second) return null;
  const other = new Map(second.win.map((segment) => [segment.s, segment]));
  let difference = 0,
    duration = 0,
    count = 0;
  for (const segment of first.win) {
    const paired = other.get(segment.s);
    if (!paired || segment.n < 2 || paired.n < 2) continue;
    const weight = Math.min(segment.n, paired.n);
    difference += weight * (paired.med - segment.med);
    duration += (weight * (paired.med + segment.med)) / 2;
    count += weight;
  }
  return count >= 4 && duration > 0 ? { margin: difference / duration, coverage: Math.min(1, count / 16) } : null;
}

function qualifying(rows, year, refined) {
  const excluded = censoredQualifyingIds(rows);
  const valid = rows.filter((row) => !excluded.has(row.driverId));
  const censored = censoredQualifyingSegments(valid);
  const observations = [];
  for (let i = 0; i < valid.length; i++)
    for (let j = i + 1; j < valid.length; j++) {
      for (const segment of refined && year >= 2006 && year <= 2009 ? ['q2', 'q1'] : ['q3', 'q2', 'q1']) {
        const tx = qualifyingEvidenceTime(valid[i], segment, censored);
        const ty = qualifyingEvidenceTime(valid[j], segment, censored);
        if (!(tx > 0 && ty > 0)) continue;
        observations.push({ x: valid[i], y: valid[j], tx, ty, seg: segment });
        break;
      }
    }
  return observations;
}

export function measurementRows(weekend, lapPace, laps, { qualifyingFormat = false, exactLaps = false, omitPartial = false } = {}) {
  const selected = new Map();
  function add(x, y, channel, target, coverage, source) {
    let a = String(x.driverId),
      b = String(y.driverId),
      ca = String(x.constructorId),
      cb = String(y.constructorId);
    if (a === b || !Number.isFinite(target) || !(coverage > 0)) return;
    if (a > b) {
      [a, b] = [b, a];
      [ca, cb] = [cb, ca];
      target = channel === 2 ? 1 - target : -target;
    }
    const key = `${a}|${b}|${channel}`;
    const item = { a, b, ca: carLineage(ca), cb: carLineage(cb), same: ca === cb, channel, target, coverage, source };
    const old = selected.get(key);
    if (!old || coverage > old.coverage) selected.set(key, item);
    else if (coverage === old.coverage && Math.abs(old.target - target) > 1e-12) old.conflict = true;
  }
  for (const ob of qualifying(weekend.qrows, weekend.year, qualifyingFormat))
    if (ob.tx > 0 && ob.ty > 0) add(ob.x, ob.y, 0, (2 * (ob.ty - ob.tx)) / (ob.tx + ob.ty), 1, 'qual');
  const paceMap = lapPace.get(String(weekend.info.raceId));
  for (const { ob, session } of weekend.replayObs) {
    if (session !== 'race') continue;
    if (ob.source === 'finish') add(ob.x, ob.y, 2, ob.obs, 1, 'finish');
    if (ob.source === 'paceW') {
      const value = exactLaps
        ? matchedPace(laps.get(`${weekend.info.raceId}|${ob.x.driverId}`), laps.get(`${weekend.info.raceId}|${ob.y.driverId}`))
        : windowMargin(paceMap?.get(String(ob.x.driverId)), paceMap?.get(String(ob.y.driverId)));
      if (value) add(ob.x, ob.y, 1, value.margin, value.coverage, 'pace');
    }
  }
  if (!omitPartial)
    for (const { ob, session } of weekend.replayObs) {
      if (session !== 'race' || ob.source !== 'partial') continue;
      const [a, b] = [String(ob.x.driverId), String(ob.y.driverId)].sort();
      if (!selected.has(`${a}|${b}|1`) && !selected.has(`${a}|${b}|2`)) add(ob.x, ob.y, 2, ob.obs, Math.min(1, ob.base), 'partial');
    }
  const rows = [...selected.values()].filter((item) => !item.conflict);
  const n = new Set([...weekend.rows, ...weekend.qrows].map((row) => row.driverId)).size;
  for (const row of rows) {
    const related = rows.filter((other) => other.a === row.a && other.b === row.b && other.channel > 0);
    const sum = related.reduce((value, other) => value + other.coverage, 0);
    const budget = row.channel === 0 ? 1 : (1.5 * Math.max(...related.map((other) => other.coverage)) * row.coverage) / sum;
    row.weight = budget * (row.same ? 1 : 1 / Math.max(1, n - 1));
  }
  return rows.sort((a, b) => a.channel - b.channel || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
}

export function outcomeRows(weekend) {
  const excluded = /disqual|excluded|withdrew|did not|107%|not classified/i;
  const rows = weekend.rawRows.filter(
    (row) =>
      !excluded.test(row.statusName) &&
      +row.positionOrder > 0 &&
      (+row.laps > 0 || defaultClass(row.statusName).driver > 0 || defaultClass(row.statusName).mech > 0),
  );
  if (Math.max(...rows.map((row) => +row.laps)) < 2) return [];
  const pairs = [];
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      let x = rows[i],
        y = rows[j];
      if (x.driverId > y.driverId) [x, y] = [y, x];
      if (+x.positionOrder === +y.positionOrder) continue;
      pairs.push({
        a: x.driverId,
        b: y.driverId,
        ca: carLineage(x.constructorId),
        cb: carLineage(y.constructorId),
        same: x.constructorId === y.constructorId,
        channel: 2,
        target: +x.positionOrder < +y.positionOrder ? 1 : 0,
        source: 'outcome',
        bothFinish: isFinishStatusName(x.statusName) && isFinishStatusName(y.statusName),
        hazardA: 1 - (1 - weekend.preQ.inc.get(x.driverId)) * (1 - weekend.preQ.rel.get(x.constructorId)),
        hazardB: 1 - (1 - weekend.preQ.inc.get(y.driverId)) * (1 - weekend.preQ.rel.get(y.constructorId)),
      });
    }
  return pairs;
}

export function entrants(weekend) {
  return [
    ...new Map(
      [...weekend.rows, ...weekend.qrows].map((row) => [
        String(row.driverId),
        {
          driver: String(row.driverId),
          car: carLineage(String(row.constructorId)),
          team: canonicalTeam(String(row.constructorId)),
          constructor: String(row.constructorId),
          appearances: weekend.raceSeen.get(String(row.driverId)) ?? 0,
        },
      ]),
    ).values(),
  ];
}
