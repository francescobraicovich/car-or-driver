// Publish future race dates and typical circuit distances for the prediction page.
import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import { csv } from '../packages/core/src/csv.js';

const read = async (name) => csv(await readFile(`data/${name}.csv`, 'utf8'));
const [races, circuits, results] = await Promise.all(['races', 'circuits', 'results'].map(read));
const lastRace = JSON.parse(await readFile('data/manifest.json', 'utf8')).lastRace;
const completedLaps = new Map();
for (const result of results) {
  const laps = Number(result.laps);
  if (Number.isInteger(laps) && laps > (completedLaps.get(result.raceId) || 0)) completedLaps.set(result.raceId, laps);
}
const distances = new Map();
for (const race of races.filter((race) => race.date <= lastRace.date).sort((a, b) => b.date.localeCompare(a.date))) {
  if (!distances.has(race.circuitId) && completedLaps.has(race.raceId)) distances.set(race.circuitId, completedLaps.get(race.raceId));
}
const calendar = {
  races: races
    .filter((race) => race.date > lastRace.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ name, date, circuitId }) => ({ name, date, circuitId })),
  circuits: circuits
    .map(({ circuitId, name }) => ({ id: circuitId, name, laps: distances.get(circuitId) <= 100 ? distances.get(circuitId) : null }))
    .sort((a, b) => a.name.localeCompare(b.name)),
};
await writeFile('site/assets/prediction-calendar.json', await format(JSON.stringify(calendar), { parser: 'json' }));
