// A new circuit needs an outline before the front-page race replay can show it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { csv } from '../packages/core/src/csv.js';

const races = csv(await readFile('data/races.csv', 'utf8'));
const completed = new Set(csv(await readFile('data/results.csv', 'utf8')).map((row) => row.raceId));
const tracks = JSON.parse(await readFile('site/assets/tracks.json', 'utf8')).tracks;
const missing = races.filter((race) => Number(race.year) >= 2026 && completed.has(race.raceId) && !tracks[race.circuitId]);
assert.deepEqual(
  missing.map((race) => `${race.year} ${race.name}`),
  [],
  'new races need a circuit outline before automatic publication',
);
console.log('PASS GP build: every completed 2026+ race has a circuit outline');
