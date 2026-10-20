// The data behind the racing dots on the front page: data/race-laps/<year>.json (each driver's typical lap in every race since 2000, built by
// tools/build-race-laps.mjs from the CSV tables) and site/assets/tracks.json (the circuit outlines, built by tools/build-tracks.mjs from the files in
// data/source/f1-circuits). Both must be current, cover every race, and be plausible.
//   1. The files equal a fresh build (otherwise: node tools/build-race-laps.mjs, node tools/build-tracks.mjs).
//   2. Every race with results since 2000 has its laps, and the typical lap of its winner times the laps is no more than the real race time.
//   3. Every circuit raced since 2000 has an outline, except the four the source does not have; each outline is a closed loop in the right direction.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { csv } from '../packages/core/src/csv.js';
import { LICENCE_NOTICE } from '../tools/build-model.mjs';
import { RACE_LAPS_FORMAT, buildRaceLaps, parseLapTimes, typicalLap } from '../tools/build-race-laps.mjs';
import { REVERSED, SOURCE_FILES, TRACK_FORMAT, outline, pathLength } from '../tools/build-tracks.mjs';

const read = (path) => readFile(path, 'utf8');
const races = csv(await read('data/races.csv'));
const results = csv(await read('data/results.csv'));
const circuits = csv(await read('data/circuits.csv'));

// the typical lap leaves out the slow laps
assert.equal(typicalLap([90000, 91000, 92000, 150000]), 91000, 'a pit lap is left out of the typical lap');
assert.equal(typicalLap([90000]), 90000);

// 1. the lap files
const fresh = buildRaceLaps({ races, results, lapTimes: parseLapTimes(await read('data/lap_times.csv')) });
const manifest = JSON.parse(await read('data/manifest.json'));
const files = (await readdir('data/race-laps')).filter((name) => name.endsWith('.json')).sort();
assert.deepEqual(
  files,
  Object.keys(fresh).map((year) => `${year}.json`),
  'one file for each season with results: run node tools/build-race-laps.mjs',
);
for (const file of files) {
  const season = JSON.parse(await read(`data/race-laps/${file}`));
  assert.equal(season.format, RACE_LAPS_FORMAT);
  assert.equal(season.dataVersion, manifest.version, `${file} was built from other data: run node tools/build-race-laps.mjs`);
  assert.deepEqual(season.licence, LICENCE_NOTICE, `${file} carries the licence`);
  assert.deepEqual(season.races, fresh[season.year], `${file} equals a fresh build`);
}

// 2. every race, and plausible
const winners = new Map(results.filter((row) => row.positionOrder === '1').map((row) => [row.raceId, row]));
const ratios = [];
let covered = 0;
for (const race of races.filter((row) => Number(row.year) >= 2000)) {
  const entry = fresh[race.year]?.[race.raceId];
  if (!winners.has(race.raceId)) continue; // not raced yet
  assert.ok(entry && entry.laps >= 1 && entry.entries.length >= 6, `${race.year} ${race.name} has laps and at least six entries`);
  covered++;
  for (const [, , grid, laps, seconds, retired] of entry.entries) {
    // (a driver who retired within a few laps can have a very slow one: the start, a red flag or whatever ended their race is most of what they ran)
    assert.ok(
      seconds > 20 && seconds < (retired && laps <= 3 ? 1500 : 400),
      `${race.year} ${race.name}: a typical lap of ${seconds} seconds is plausible`,
    );
    assert.ok(Number.isInteger(laps) && laps >= 1 && laps <= entry.laps && grid >= 0 && (retired === 0 || retired === 1));
  }
  const winner = entry.entries[0];
  const real = Number(winners.get(race.raceId).milliseconds) / 1000;
  if (real > 0 && winner[3] === entry.laps) ratios.push((winner[4] * entry.laps) / real);
}
assert.ok(covered >= 500, `${covered} races covered`);
ratios.sort((a, b) => a - b);
// (it is 1.000 in most races, where no lap is slow; the source's lap times for the 2014 Chinese Grand Prix add up to 3.6% more than its race time)
assert.ok(
  ratios.at(-1) <= 1.05,
  `the typical lap of a winner times the laps does not exceed the race time (highest ${ratios.at(-1).toFixed(3)})`,
);
assert.ok(ratios[Math.floor(ratios.length / 2)] > 0.9, 'and is most of it');

// 3. the outlines
const ref = new Map(circuits.map((circuit) => [circuit.circuitId, circuit.circuitRef]));
const tracks = JSON.parse(await read('site/assets/tracks.json'));
assert.equal(tracks.format, TRACK_FORMAT);
assert.match(tracks.credit, /bacinger\/f1-circuits.*MIT/, 'the credit and the licence of the source travel with the outlines');
const clockwise = {
  albert_park: true,
  sepang: true,
  shanghai: true,
  bahrain: true,
  catalunya: true,
  monaco: true,
  istanbul: false,
  silverstone: true,
  nurburgring: true,
  hungaroring: true,
  spa: true,
  monza: true,
  marina_bay: false,
  interlagos: false,
  yas_marina: false,
  villeneuve: true,
  magny_cours: true,
  hockenheimring: true,
  indianapolis: true,
  imola: false,
  red_bull_ring: true,
  americas: false,
  sochi: true,
  rodriguez: true,
  baku: false,
  ricard: true,
  mugello: true,
  portimao: true,
  losail: true,
  zandvoort: true,
  jeddah: false,
  miami: false,
  vegas: false,
  madring: true,
}; // from Wikipedia's list of Formula One circuits (Suzuka is a figure of eight and is not checked)
for (const [id, track] of Object.entries(tracks.tracks)) {
  const name = ref.get(id);
  assert.ok(SOURCE_FILES[name], `circuit ${id} (${name}) has a source file`);
  const source = JSON.parse(await read(`data/source/f1-circuits/circuits/${SOURCE_FILES[name]}.geojson`)).features[0];
  const rebuilt = outline(source.geometry.coordinates, { reverse: REVERSED.includes(name) });
  assert.deepEqual({ width: track.width, height: track.height, points: track.points }, rebuilt, `${name} equals a fresh build`);
  assert.ok(Math.max(track.width, track.height) === 1000 && track.points.length >= 120, `${name} fills a 1000-unit plan`);
  assert.ok(
    track.points.every((value) => value >= 0 && value <= 1000),
    `${name} stays inside it`,
  );
  const ratio = pathLength(source.geometry.coordinates) / source.properties.length;
  assert.ok(ratio > 0.95 && ratio < 1.03, `${name}: the outline is as long as the circuit (${ratio.toFixed(3)})`);
  assert.equal(track.length, source.properties.length);
  if (name in clockwise) {
    let area = 0; // the plan has y pointing down: a positive sum is clockwise
    const n = track.points.length / 2;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = [track.points[2 * i], track.points[2 * i + 1]];
      const [x2, y2] = [track.points[2 * ((i + 1) % n)], track.points[2 * ((i + 1) % n) + 1]];
      area += x1 * y2 - x2 * y1;
    }
    assert.equal(area > 0, clockwise[name], `${name} is raced ${clockwise[name] ? 'clockwise' : 'anticlockwise'}`);
  }
}
const raced = new Set(races.filter((race) => Number(race.year) >= 2000 && winners.has(race.raceId)).map((race) => race.circuitId));
const without = [...raced].filter((id) => !tracks.tracks[id]).map((id) => ref.get(id));
assert.deepEqual(without.sort(), ['buddh', 'fuji', 'valencia', 'yeongam'], 'only the four circuits that the source lacks have no outline');
console.log(
  `PASS race laps and tracks: ${files.length} seasons and ${covered} races of lap data equal a fresh build, ${Object.keys(tracks.tracks).length} outlines (none for ${without.join(', ')}) closed, the right length and direction`,
);
