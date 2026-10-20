// Builds data/race-laps/<year>.json, one file for each season since 2000: for every race of the season, every driver's lap times (so that the race can be
// replayed lap by lap on the front page, site/js/race-replay.js), their grid place and whether they were still racing at the end, and the stretches of time in
// which the whole field stood still (red flags). The files are fetched one season at a time. Run after refreshing data/:
//   node tools/build-race-laps.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { csv } from '../packages/core/src/csv.js';
import { isFinishStatusName } from '../packages/core/src/status.js';
import { LEAST_DRIVING, median, raceTypical } from '../site/js/race-replay.js';
import { LICENCE_NOTICE } from './build-model.mjs';

export const RACE_LAPS_FORMAT = 2;
const FIRST_YEAR = 2000;
/** A lap this many times longer than the driver's median lap is a long lap: a red flag shows as one for every car (a safety car lap is 1.3 to 1.7 times). */
const LONG_LAP = 2.2;
/** A stoppage is when this share of the cars still racing are in a long lap at the same time. */
const SHARE_STOPPED = 0.6;
const MINIMUM_STOP = 90; // seconds: a shorter stretch is not a stoppage (a long safety car period)
const MINIMUM_LAPS = 5; // a driver with fewer laps than this is not used to judge what is a long lap

/** Lap times by race and driver: Map "raceId/driverId" -> [milliseconds, ...] in lap order (the laps of the source are numbered without gaps). */
export function parseLapTimes(text) {
  const out = new Map();
  const lines = text.replace(/^﻿/, '').split('\n');
  const header = lines[0].replace(/\r$/, '').split(',');
  const [race, driver, lap, ms] = ['raceId', 'driverId', 'lap', 'milliseconds'].map((name) => header.indexOf(name));
  if ([race, driver, lap, ms].some((index) => index < 0)) throw new Error('lap_times.csv schema not recognised');
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = lines[i].replace(/\r$/, '').split(',');
    const milliseconds = Number(cells[ms]);
    if (!Number.isFinite(milliseconds)) continue;
    const key = `${cells[race]}/${cells[driver]}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push([Number(cells[lap]), milliseconds]);
  }
  for (const [key, laps] of out)
    out.set(
      key,
      laps.sort((a, b) => a[0] - b[0]).map(([, milliseconds]) => milliseconds),
    );
  return out;
}

/**
 * The stretches of race time, in seconds from the start, in which the cars stood still, from the lap times of every car ([[ms, ms, ...], ...]). Each
 * car's laps that are much longer than its own median are marked; where most of the cars still racing are in such a lap at once, the field was stopped.
 * A stretch starts at the middle of the moments the cars' long laps began (they stopped as they came round to the pits, one after another) and ends early
 * enough that even the first car to cross the line afterwards has driven at least LEAST_DRIVING of a typical lap since (so that no car has to cover a lap
 * in no time when the clock of the screen jumps over the stretch). Time is the absolute race clock, not the lap count: a lapped car's long lap is a different
 * lap number from the leader's.
 */
export function detectStops(series) {
  const typical = raceTypical(series);
  const cars = series
    .filter((laps) => laps.length >= MINIMUM_LAPS)
    .map((laps) => {
      const own = median(laps);
      let time = 0;
      const long = [];
      for (const lap of laps) {
        if (lap > LONG_LAP * own) long.push([time, time + lap]);
        time += lap;
      }
      return { long, end: time };
    });
  const inLong = (car, at) => car.long.some(([start, end]) => start <= at && at < end);
  const edges = [...new Set(cars.flatMap((car) => car.long.flat()))].sort((a, b) => a - b);
  const regions = [];
  let from = null;
  for (let i = 0; i < edges.length - 1; i++) {
    const at = (edges[i] + edges[i + 1]) / 2; // between two edges, who is in a long lap and who is still racing does not change
    const stopped = cars.filter((car) => inLong(car, at)).length;
    const on = stopped >= 4 && stopped >= SHARE_STOPPED * cars.filter((car) => car.end > at).length;
    if (on && from === null) from = edges[i];
    if (from !== null && (!on || i === edges.length - 2)) {
      regions.push([from, on ? edges[i + 1] : edges[i]]);
      from = null;
    }
  }
  const stops = [];
  for (const [start, end] of regions) {
    const middle = (start + end) / 2; // the cars in the stoppage are the ones whose long lap is going on in the middle of it (not a repair that ended near its start)
    const laps = cars.flatMap((car) => car.long.filter(([first, last]) => first <= middle && middle < last));
    const a = median(laps.map(([first]) => first));
    const b = Math.min(...laps.map(([, last]) => last)) - LEAST_DRIVING * typical;
    if ((b - a) / 1000 >= MINIMUM_STOP) stops.push([Math.round(a / 100) / 10, Math.round(b / 100) / 10]);
  }
  return stops;
}

/**
 * The seasons: { year: { raceId: { laps, stops, entries } } }, with the entries in finishing order. An entry is
 * [driverId, constructorId, grid, out, statusId, lapTimes]: `out` is 1 for a car that stopped racing before the end (a retirement), `statusId` is how the
 * race ended for it (the names are in `statuses`), and the lap times are in centiseconds, one for each lap it completed. A driver with no lap times for
 * the race gets their race time shared over their laps when the results have one, and otherwise no entry.
 */
export function buildRaceLaps({ races, results, lapTimes, statuses }) {
  const years = new Map(races.map((race) => [String(race.raceId), Number(race.year)]));
  const names = new Map(statuses.map((status) => [String(status.statusId), status.status]));
  const byRace = new Map();
  for (const result of results) {
    const year = years.get(String(result.raceId));
    if (!(year >= FIRST_YEAR)) continue;
    if (!byRace.has(result.raceId)) byRace.set(result.raceId, []);
    byRace.get(result.raceId).push(result);
  }
  const seasons = {};
  for (const [raceId, rows] of byRace) {
    const entries = [];
    const series = [];
    for (const row of rows.sort((a, b) => Number(a.positionOrder) - Number(b.positionOrder))) {
      let laps = lapTimes.get(`${raceId}/${row.driverId}`);
      if (!laps?.length) {
        const count = Number(row.laps);
        if (!(Number(row.milliseconds) > 0 && count > 0)) continue;
        laps = Array(count).fill(Math.round(Number(row.milliseconds) / count));
      } else series.push(laps);
      entries.push([
        Number(row.driverId),
        Number(row.constructorId),
        Number(row.grid) || 0,
        0,
        Number(row.statusId),
        laps.map((ms) => Math.round(ms / 10)),
      ]);
    }
    if (!entries.length) continue;
    const total = Math.max(...entries.map((entry) => entry[5].length));
    for (const entry of entries) {
      const finished = isFinishStatusName(names.get(String(entry[4])));
      entry[3] = !finished && entry[5].length < total ? 1 : 0; // a disqualified car that ran the whole distance did not retire
    }
    const year = years.get(String(raceId));
    (seasons[year] ??= {})[raceId] = { laps: total, stops: detectStops(series), entries };
  }
  return seasons;
}

/** What a driver is called on the timing table: the three letters of the source, or the first three letters of the surname. */
export function driverCode(driver) {
  return /^[A-Z]{3}$/.test(driver.code)
    ? driver.code
    : String(driver.surname || driver.driverRef || driver.driverId)
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase();
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const read = (name) => readFile(`data/${name}`, 'utf8');
  const drivers = csv(await read('drivers.csv'));
  const statuses = csv(await read('status.csv'));
  const seasons = buildRaceLaps({
    races: csv(await read('races.csv')),
    results: csv(await read('results.csv')),
    lapTimes: parseLapTimes(await read('lap_times.csv')),
    statuses,
  });
  const { version } = JSON.parse(await read('manifest.json'));
  await mkdir('data/race-laps', { recursive: true });
  let bytes = 0;
  for (const [year, races] of Object.entries(seasons)) {
    const used = new Set(Object.values(races).flatMap((race) => race.entries.map((entry) => String(entry[0]))));
    const usedStatuses = new Set(
      Object.values(races).flatMap((race) => race.entries.filter((entry) => entry[3]).map((entry) => String(entry[4]))),
    );
    const codes = Object.fromEntries(
      drivers.filter((driver) => used.has(String(driver.driverId))).map((driver) => [driver.driverId, driverCode(driver)]),
    );
    const causes = Object.fromEntries(
      statuses.filter((status) => usedStatuses.has(String(status.statusId))).map((status) => [status.statusId, status.status]),
    );
    const lines = Object.entries(races).map(([raceId, race]) => `  ${JSON.stringify(raceId)}: ${JSON.stringify(race)}`);
    const text = `{\n "format": ${RACE_LAPS_FORMAT},\n "dataVersion": ${JSON.stringify(version)},\n "licence": ${JSON.stringify(LICENCE_NOTICE)},\n "year": ${year},\n "codes": ${JSON.stringify(codes)},\n "statuses": ${JSON.stringify(causes)},\n "races": {\n${lines.join(',\n')}\n }\n}\n`;
    await writeFile(`data/race-laps/${year}.json`, text);
    bytes += text.length;
  }
  console.log(`data/race-laps/: ${Object.keys(seasons).length} seasons, ${(bytes / 1e6).toFixed(2)} MB`);
}
