// Builds data/race-laps/<year>.json, one file for each season since 2000: for every race of the season, how many laps it ran and, for each driver, their
// grid place, the laps they completed, their typical lap time and whether they retired. The racing dots on the front page run on these (site/js/track-view.js),
// and they are fetched one season at a time. Run after refreshing data/:
//   node tools/build-race-laps.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { csv } from '../packages/core/src/csv.js';
import { LICENCE_NOTICE } from './build-model.mjs';

export const RACE_LAPS_FORMAT = 1;
const FIRST_YEAR = 2000;
/** Laps slower than this multiple of a driver's median lap (pit stops, safety car laps, stoppages) are left out of their typical lap time. */
const SLOW_LAP = 1.5;

/** The mean of the laps (milliseconds) that are not much slower than the driver's median: how fast they race when they race. */
export function typicalLap(laps) {
  const sorted = [...laps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const kept = laps.filter((lap) => lap <= SLOW_LAP * median);
  return kept.reduce((sum, lap) => sum + lap, 0) / kept.length;
}

/** Lap times by race and driver: Map "raceId/driverId" -> [milliseconds, ...] in lap order. */
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
 * The seasons: { year: { raceId: { laps, entries: [[driverId, constructorId, grid, laps, typicalLapSeconds, retired], ...] } } }, with the entries in
 * finishing order. A driver with no lap times for the race gets their race time over their laps when they have one, and otherwise no entry.
 */
export function buildRaceLaps({ races, results, lapTimes }) {
  const years = new Map(races.map((race) => [String(race.raceId), Number(race.year)]));
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
    for (const row of rows.sort((a, b) => Number(a.positionOrder) - Number(b.positionOrder))) {
      const times = lapTimes.get(`${raceId}/${row.driverId}`);
      let laps;
      let seconds;
      if (times?.length) {
        laps = times.length;
        seconds = typicalLap(times) / 1000;
      } else if (Number(row.milliseconds) > 0 && Number(row.laps) > 0) {
        laps = Number(row.laps);
        seconds = Number(row.milliseconds) / 1000 / laps;
      } else continue;
      entries.push([
        Number(row.driverId),
        Number(row.constructorId),
        Number(row.grid) || 0,
        laps,
        Math.round(seconds * 100) / 100,
        /^\d+$/.test(row.positionText) ? 0 : 1,
      ]);
    }
    if (!entries.length) continue;
    const year = years.get(String(raceId));
    (seasons[year] ??= {})[raceId] = { laps: Math.max(...entries.map((entry) => entry[3])), entries };
  }
  return seasons;
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const read = (name) => readFile(`data/${name}`, 'utf8');
  const seasons = buildRaceLaps({
    races: csv(await read('races.csv')),
    results: csv(await read('results.csv')),
    lapTimes: parseLapTimes(await read('lap_times.csv')),
  });
  const { version } = JSON.parse(await read('manifest.json'));
  await mkdir('data/race-laps', { recursive: true });
  let bytes = 0;
  for (const [year, races] of Object.entries(seasons)) {
    const lines = Object.entries(races).map(([raceId, race]) => `  ${JSON.stringify(raceId)}: ${JSON.stringify(race)}`);
    const text = `{\n "format": ${RACE_LAPS_FORMAT},\n "dataVersion": ${JSON.stringify(version)},\n "licence": ${JSON.stringify(LICENCE_NOTICE)},\n "year": ${year},\n "races": {\n${lines.join(',\n')}\n }\n}\n`;
    await writeFile(`data/race-laps/${year}.json`, text);
    bytes += text.length;
  }
  console.log(`data/race-laps/: ${Object.keys(seasons).length} seasons, ${(bytes / 1e3).toFixed(0)} kB`);
}
