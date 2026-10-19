// Turning raw CSV text into the inputs buildEloCore expects. Pure: callers supply
// the text (fetched, read from disk, or picked in the browser).
import { csv } from './csv.js';
import { buildDefaultMapping, isFinishStatusName, statusNameMap } from './status.js';
import { parseLapPace } from './lap-pace.js';

/** Public mirrors of the RaceData CSVs, tried in order. */
export const REMOTE_BASES = [
  'https://raw.githubusercontent.com/TracingInsights/RaceData/main/data/',
  'https://huggingface.co/datasets/tracinginsights/RaceData/resolve/main/data/',
];

export const REQUIRED_CSVS = ['results.csv', 'qualifying.csv', 'races.csv', 'drivers.csv', 'constructors.csv', 'status.csv'];

/** Parse the six required CSVs (+ optional circuits.csv) into `raw`. */
export function parseRaw(texts) {
  return {
    results: csv(texts['results.csv']),
    qualifying: csv(texts['qualifying.csv']),
    races: csv(texts['races.csv']),
    drivers: csv(texts['drivers.csv']),
    constructors: csv(texts['constructors.csv']),
    status: csv(texts['status.csv']),
    circuits: texts['circuits.csv'] ? csv(texts['circuits.csv']) : [],
  };
}

/** Laps (per race) at which a non-finisher stopped — only those need snapshots. */
export function buildTargetLaps(raw) {
  const names = statusNameMap(raw.status);
  const years = new Map(raw.races.map((r) => [String(r.raceId), +r.year]));
  const targets = new Map();
  for (const r of raw.results) {
    if ((years.get(String(r.raceId)) || 0) < 2000) continue;
    const name = names.get(String(r.statusId)) || '';
    const laps = +r.laps;
    if (laps > 0 && !isFinishStatusName(name)) {
      const rid = String(r.raceId);
      if (!targets.has(rid)) targets.set(rid, new Set());
      targets.get(rid).add(laps);
    }
  }
  return targets;
}

/** Sparse parse of lap_times.csv: keep only (race, lap) keys in targets. */
export function parseLapSnapshots(text, targets) {
  const out = new Map();
  text = text.replace(/^﻿/, '');
  const p = text.indexOf('\n');
  if (p < 0) return out;
  const h = text.slice(0, p).replace(/\r$/, '').split(',');
  const ir = h.indexOf('raceId');
  const id = h.indexOf('driverId');
  const il = h.indexOf('lap');
  const ip = h.indexOf('position');
  if ([ir, id, il, ip].some((x) => x < 0)) throw Error('lap_times.csv schema not recognised');
  let i = p + 1;
  let kept = 0;
  while (i < text.length) {
    let e = text.indexOf('\n', i);
    if (e < 0) e = text.length;
    const line = text.slice(i, e).replace(/\r$/, '');
    i = e + 1;
    if (!line) continue;
    const a = line.split(',');
    const rid = a[ir];
    const lap = +a[il];
    const set = targets.get(rid);
    if (!set || !set.has(lap)) continue;
    const pos = +a[ip];
    if (!Number.isFinite(pos)) continue;
    const key = `${rid}|${lap}`;
    if (!out.has(key)) out.set(key, new Map());
    out.get(key).set(String(a[id]), pos);
    kept++;
  }
  out._kept = kept;
  return out;
}

/**
 * Drop every race after `toYear`. A walk-forward score over years <= toYear
 * cannot see a later race, so the result is identical and the build is shorter.
 */
export function truncateDataset(ctx, toYear) {
  const races = ctx.raw.races.filter((r) => +r.year <= toYear);
  const keep = new Set(races.map((r) => String(r.raceId)));
  return {
    raw: {
      ...ctx.raw,
      races,
      results: ctx.raw.results.filter((r) => keep.has(String(r.raceId))),
      qualifying: ctx.raw.qualifying.filter((r) => keep.has(String(r.raceId))),
    },
    maps: ctx.maps,
    lapSnapshots: new Map([...ctx.lapSnapshots].filter(([k]) => keep.has(String(k).split('|')[0]))),
    lapPace: ctx.lapPace ? new Map([...ctx.lapPace].filter(([k]) => keep.has(String(k)))) : null,
  };
}

/** Everything buildEloCore needs, from CSV text. `lap_times.csv` is optional. */
export function createDataset(texts) {
  const raw = parseRaw(texts);
  const lapText = texts['lap_times.csv'];
  return {
    raw,
    maps: { def: buildDefaultMapping(raw.status), ov: new Map() },
    lapSnapshots: lapText ? parseLapSnapshots(lapText, buildTargetLaps(raw)) : new Map(),
    lapPace: lapText ? parseLapPace(lapText) : null,
  };
}
