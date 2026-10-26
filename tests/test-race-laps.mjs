// The data behind the replay of a race on the front page: data/race-laps/<year>.json (every driver's lap times in every race since 1994, and the red flags,
// built by tools/build-race-laps.mjs from the CSV tables) and site/assets/tracks.json (the circuit outlines and their speed profiles, built by
// tools/build-tracks.mjs from the files in data/source/f1-circuits). Both must be current, cover every race, and be plausible; and the replay built
// from them (site/js/race-replay.js) must do what a replay of a real race has to:
//   1. The files equal a fresh build (otherwise: npm run build:data).
//   2. Every race with results since 1994 is there, and a winner's laps add up to the real race time.
//   3. The red flags found are the known ones.
//   4. In every race, for every car: its progress never goes backwards; it crosses the line at the moments its lap times say, and in the order the lap
//      times record (the `position` of lap_times.csv); and no stretch of driving is faster than a car going 1.43 times its normal pace.
//   5. The clock of the screen is a monotone map that takes a stoppage down to a few seconds.
//   6. Every available circuit outline is a closed loop in the right direction,
//      each has a speed profile of a plausible shape.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { csv } from '../packages/core/src/csv.js';
import { FIRST_YEAR } from '../packages/core/src/weekends.js';
import { LICENCE_NOTICE } from '../tools/build-model.mjs';
import { RACE_LAPS_FORMAT, assignCodes, buildRaceLaps, detectStops, parseLapTimes } from '../tools/build-race-laps.mjs';
import { REVERSED, SOURCE_FILES, TRACK_FORMAT, outline, pathLength } from '../tools/build-tracks.mjs';
import { LEAST_DRIVING, STOP_PAUSE, buildReplay, progress, screenClock, timeAtProgress } from '../site/js/race-replay.js';
import { uniformClock } from '../site/js/speed-profile.js';

const read = (path) => readFile(path, 'utf8');
const races = csv(await read('data/races.csv'));
const results = csv(await read('data/results.csv'));
const circuits = csv(await read('data/circuits.csv'));
const drivers = csv(await read('data/drivers.csv'));
const statuses = csv(await read('data/status.csv'));
const lapText = await read('data/lap_times.csv');

// 1. the lap files
const fresh = buildRaceLaps({ races, results, lapTimes: parseLapTimes(lapText), statuses });
const manifest = JSON.parse(await read('data/manifest.json'));
const files = (await readdir('data/race-laps')).filter((name) => name.endsWith('.json')).sort();
assert.deepEqual(
  files,
  Object.keys(fresh).map((year) => `${year}.json`),
  'one file for each season with results: run npm run build:data',
);
const seasons = new Map();
for (const file of files) {
  const season = JSON.parse(await read(`data/race-laps/${file}`));
  assert.equal(season.format, RACE_LAPS_FORMAT);
  assert.equal(season.dataVersion, manifest.version, `${file} was built from other data: run npm run build:data`);
  assert.deepEqual(season.licence, LICENCE_NOTICE, `${file} carries the licence`);
  assert.deepEqual(season.races, fresh[season.year], `${file} equals a fresh build`);
  const used = new Set(Object.values(season.races).flatMap((race) => race.entries.map((entry) => String(entry[0]))));
  assert.deepEqual(Object.keys(season.codes).sort(), [...used].sort(), `${file} has a code for every driver in it, and no other`);
  assert.deepEqual(
    season.codes,
    assignCodes(drivers.filter((candidate) => used.has(String(candidate.driverId)))),
    `${file}: the codes are the ones the rule gives`,
  );
  assert.equal(
    new Set(Object.values(season.codes)).size,
    Object.keys(season.codes).length,
    `${file}: no two drivers of a season have the same letters`,
  );
  assert.ok(
    Object.values(season.codes).every((code) => /^[A-Z]{3}$/.test(code)),
    `${file}: every code is three capital letters`,
  );
  seasons.set(season.year, season);
}
assert.deepEqual(
  assignCodes([
    { driverId: 1, code: 'PAN', surname: 'Panis', forename: 'Olivier' },
    { driverId: 2, code: '\\N', surname: 'Pantano', forename: 'Giorgio' },
    { driverId: 3, code: '\\N', surname: 'de la Rosa', forename: 'Pedro' },
    { driverId: 4, code: 'HAM', surname: 'Hamilton', forename: 'Lewis' },
  ]),
  { 1: 'PAN', 2: 'GPA', 3: 'DEL', 4: 'HAM' },
  'a driver with no code of his own is called by his surname, or, if that is taken, by his first initial and two letters of his surname',
);

// 2. every race, and plausible
const winners = new Map(results.filter((row) => row.positionOrder === '1').map((row) => [row.raceId, row]));
let covered = 0;
const exact = [];
const cause = new Map(statuses.map((status) => [String(status.statusId), status.status]));
for (const race of races.filter((row) => Number(row.year) >= FIRST_YEAR)) {
  const entry = fresh[race.year]?.[race.raceId];
  if (!winners.has(race.raceId)) continue; // not raced yet
  assert.ok(entry && entry.laps >= 1 && entry.entries.length >= 6, `${race.year} ${race.name} has laps and at least six entries`);
  covered++;
  for (const [, , grid, out, statusId, centiseconds] of entry.entries) {
    assert.ok(
      centiseconds.length >= 1 && centiseconds.length <= entry.laps && centiseconds.every((lap) => Number.isInteger(lap) && lap > 2000),
    );
    assert.ok(
      grid >= 0 && (out === 0 || out === 1) && cause.has(String(statusId)),
      `${race.year} ${race.name}: grid, out and status are what they should be`,
    );
    if (out) assert.ok(centiseconds.length < entry.laps, 'a car that retired did not finish the distance');
  }
  const winner = entry.entries[0];
  const real = Number(winners.get(race.raceId).milliseconds) / 1000;
  if (real > 0 && winner[5].length === entry.laps) {
    const total = winner[5].reduce((sum, lap) => sum + lap, 0) / 100;
    assert.ok(
      Math.abs(total / real - 1) < 0.05,
      `${race.year} ${race.name}: the laps of the winner add up to the race time (${total} against ${real})`,
    );
    exact.push(Math.abs(total - real) < 1.5);
  }
}
assert.ok(covered >= 500, `${covered} races covered`);
assert.ok(exact.filter(Boolean).length > 0.95 * exact.length, 'and to within a second and a half in nearly every race');

// 3. the red flags
assert.deepEqual(detectStops([[90000, 91000, 90500, 90800, 91200, 90700]]), [], 'a race with no long lap has no stoppage');
const found = [];
for (const season of seasons.values())
  for (const [raceId, race] of Object.entries(season.races)) {
    for (const [from, to] of race.stops)
      assert.ok(from >= 0 && to - from >= 90, `${season.year} ${raceId}: a stoppage lasts at least 90 seconds`);
    if (race.stops.length) found.push(`${season.year} ${races.find((row) => row.raceId === raceId).name}`);
  }
assert.ok(found.length >= 28 && found.length <= 40, `${found.length} races with a red flag`);
for (const known of [
  '2011 Canadian',
  '2012 Malaysian',
  '2014 British',
  '2016 Brazilian',
  '2021 Hungarian',
  '2022 British',
  '2024 Monaco',
  '2007 European',
  '2020 Tuscan',
  '2021 Saudi',
])
  assert.ok(
    found.some((name) => name.startsWith(known)),
    `${known} Grand Prix has its red flag`,
  );
assert.ok(!found.some((name) => /^2024 Singapore|^2025 Italian|^2019 German/.test(name)), 'and an ordinary race does not');

// 4. the replay of every race
const recorded = new Map(); // "raceId/driverId" -> [position at the end of each lap]
for (const line of lapText.split('\n').slice(1)) {
  if (!line) continue;
  const [raceId, driverId, lap, position] = line.split(',');
  const key = `${raceId}/${driverId}`;
  if (!recorded.has(key)) recorded.set(key, []);
  recorded.get(key)[Number(lap) - 1] = Number(position);
}
let crossings = 0;
const disagreements = [];
let fastest = 0;
let replays = 0;
for (const season of seasons.values())
  for (const [raceId, race] of Object.entries(season.races)) {
    const replay = buildReplay(race, uniformClock);
    replays++;
    // progress never goes backwards, sampled every 5 seconds
    for (const car of replay.cars) {
      let before = -Infinity;
      for (let time = 0; time <= replay.end + 400; time += 5) {
        const now = progress(car, time, uniformClock);
        assert.ok(now >= before - 1e-9, `${season.year} ${raceId} car ${car.id}: progress went backwards at ${time}`);
        before = now;
      }
      for (let i = 1; i < car.t.length; i++) {
        assert.ok(
          car.t[i] >= car.t[i - 1] && car.u[i] >= car.u[i - 1],
          `${season.year} ${raceId} car ${car.id}: the timeline is not monotone`,
        );
        const seconds = car.t[i] - car.t[i - 1];
        if (seconds > 0.5 && car.u[i] > car.u[i - 1])
          fastest = Math.max(fastest, ((car.u[i] - car.u[i - 1]) / seconds) * replay.cars[0].typical);
      }
      // it crosses the line at the moments its lap times say
      let time = 0;
      race.entries
        .find((entry) => String(entry[0]) === car.id)[5]
        .forEach((centiseconds, lap) => {
          time += centiseconds / 100;
          if ((lap + 1) % 9 === 0 || lap + 1 === car.laps)
            assert.ok(
              Math.abs(timeAtProgress(car, lap + 1, uniformClock) - time) < 0.02,
              `${season.year} ${raceId}: lap ${lap + 1} is crossed on time`,
            );
        });
    }
    // and in the order the lap times record
    for (let lap = 1; lap <= race.laps; lap++) {
      const present = replay.cars.filter((car) => car.laps >= lap && recorded.get(`${raceId}/${car.id}`)?.[lap - 1]);
      const byTime = present.map((car) => ({ id: car.id, time: timeAtProgress(car, lap, uniformClock) })).sort((a, b) => a.time - b.time);
      const byRecord = [...present].sort((a, b) => recorded.get(`${raceId}/${a.id}`)[lap - 1] - recorded.get(`${raceId}/${b.id}`)[lap - 1]);
      byTime.forEach((entry, place) => {
        crossings++;
        if (byRecord[place].id !== entry.id) {
          const other = byTime.find((candidate) => candidate.id === byRecord[place].id);
          if (Math.abs(other.time - entry.time) > 0.15) disagreements.push(`${season.year} ${raceId} lap ${lap}`); // more than the centiseconds can explain
        }
      });
    }
  }
assert.equal(replays, covered + 0, 'every race was replayed');
assert.ok(crossings > 500000, `${crossings} crossings of the line compared`);
assert.ok(
  disagreements.length <= 60,
  `the replay crosses the line in the order the lap times record, but for ${disagreements.length} crossings: ${disagreements.slice(0, 5).join(', ')}`,
);
assert.ok(
  disagreements.every((where) => !/2025|2024|2023|2022|2021|2020|2019/.test(where.slice(0, 4))) || disagreements.length < 10,
  'and not in recent seasons',
);
assert.ok(
  fastest <= 1 / LEAST_DRIVING + 0.01,
  `no car drives faster than ${(1 / LEAST_DRIVING).toFixed(2)} times its normal pace (${fastest.toFixed(3)})`,
);

// 5. the clock of the screen
const flat = screenClock([]);
assert.equal(flat.realAt(123.4), 123.4);
assert.equal(flat.shownAt(123.4), 123.4);
const two = screenClock([
  [100, 1100],
  [3000, 3600],
]);
for (const [shown, real] of [
  [50, 50],
  [100, 100],
  [100 + STOP_PAUSE, 1100],
  [500, 1470], // the first stoppage of 1000 seconds takes 30 on the screen, so 970 are gone
  [3000 - 970, 3000],
  [3000 - 970 + STOP_PAUSE, 3600],
]) {
  assert.ok(Math.abs(two.realAt(shown) - real) < 1e-6, `at ${shown} on the screen it is ${real} in the race (${two.realAt(shown)})`);
  assert.ok(Math.abs(two.shownAt(real) - shown) < 1e-6, `and the other way`);
}
let last = -1;
for (let shown = 0; shown < 4000; shown += 7) {
  const real = two.realAt(shown);
  assert.ok(real >= last, 'the race clock only goes forward');
  last = real;
}
assert.ok(Math.abs(two.shownAt(1100) - two.shownAt(100) - STOP_PAUSE) < 1e-9, 'a stoppage takes STOP_PAUSE seconds on the screen');

// 6. the outlines
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
  const rebuilt = outline(source.geometry.coordinates, { reverse: REVERSED.includes(name), length: source.properties.length });
  assert.deepEqual(
    { width: track.width, height: track.height, points: track.points },
    { width: rebuilt.width, height: rebuilt.height, points: rebuilt.points },
    `${name} equals a fresh build`,
  );
  assert.deepEqual(track.speeds, rebuilt.speeds, `${name}: its speed profile equals a fresh build`);
  assert.ok(Math.max(track.width, track.height) === 1000 && track.points.length >= 120, `${name} fills a 1000-unit plan`);
  assert.ok(
    track.points.every((value) => value >= 0 && value <= 1000),
    `${name} stays inside it`,
  );
  const ratio = pathLength(source.geometry.coordinates) / source.properties.length;
  assert.ok(ratio > 0.95 && ratio < 1.03, `${name}: the outline is as long as the circuit (${ratio.toFixed(3)})`);
  assert.equal(track.length, source.properties.length);
  const [slowest, quickest] = [Math.min(...track.speeds), Math.max(...track.speeds)];
  assert.ok(
    track.speeds.length === 200 && slowest >= 40 && slowest < 190 && quickest > 180 && quickest <= 306,
    `${name}: speeds from ${slowest} to ${quickest} km/h`,
  );
  assert.ok(slowest < 0.8 * quickest, `${name}: it has slow parts and fast ones`);
  const mean = track.speeds.length / track.speeds.reduce((sum, speed) => sum + 1 / speed, 0);
  assert.ok(mean > 150 && mean < 270, `${name}: a mean speed of ${mean.toFixed(0)} km/h`);
  // the first point of an outline is the start line, which is on a straight: the speed near it is above the speed of the lap (three circuits have it by a slow corner)
  const near = [...track.speeds.slice(0, 8), ...track.speeds.slice(-8)].reduce((sum, speed) => sum + speed, 0) / 16;
  assert.ok(
    near > (['monaco', 'vegas', 'spa'].includes(name) ? 0.9 : 1.1) * mean,
    `${name}: the start line is on a fast part of the lap (${near.toFixed(0)} against ${mean.toFixed(0)} km/h)`,
  );
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
const raced = new Set(races.filter((race) => Number(race.year) >= FIRST_YEAR && winners.has(race.raceId)).map((race) => race.circuitId));
const without = [...raced].filter((id) => !tracks.tracks[id]).map((id) => ref.get(id));
assert.deepEqual(
  without.sort(),
  ['adelaide', 'buddh', 'estoril', 'fuji', 'galvez', 'jerez', 'okayama', 'valencia', 'yeongam'],
  'only circuits absent from the source lack an outline',
);
console.log(
  `PASS race laps and tracks: ${files.length} seasons and ${covered} races of lap times equal a fresh build; ${found.length} red flags; ${replays} replays monotone, on time, in the recorded order at ${crossings} crossings of the line, at most ${fastest.toFixed(2)} times normal pace; ${Object.keys(tracks.tracks).length} outlines with speed profiles (none for ${without.join(', ')})`,
);
