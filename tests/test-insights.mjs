import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { centredRatings } from '../site/js/rating-reference.js';
import { INSIGHTS_DATA } from '../site/js/insights-data.js';
import { INSIGHT_CARDS, INSIGHT_TOPICS } from '../site/js/insights-cards.js';

const manifest = JSON.parse(await readFile('data/manifest.json', 'utf8'));
const modelBytes = await readFile('data/model.json');
const model = JSON.parse(modelBytes);
const retrospectiveBytes = await readFile('data/retrospective.json');
const referenceBytes = await readFile('data/rating-reference.json');
const retrospective = deserialize(retrospectiveBytes.toString());
const reference = JSON.parse(referenceBytes);
// Grand Prix starts through each date, with the findings' definition of a start.
const NOT_STARTED = new Set(['Did not start', 'Did not qualify', 'Did not prequalify', 'Withdrew']);
const statusNames = new Map(
  (await readFile('data/status.csv', 'utf8'))
    .trim()
    .split('\n')
    .slice(1)
    .map((line) =>
      line
        .trim()
        .split(',')
        .map((cell) => cell.replaceAll('"', '')),
    ),
);
const raceDates = new Map(
  (await readFile('data/races.csv', 'utf8'))
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => [line.split(',')[0], line.match(/\d{4}-\d{2}-\d{2}/)[0]]),
);
const startDates = new Map();
for (const line of (await readFile('data/results.csv', 'utf8')).trim().split('\n').slice(1)) {
  const cells = line.trim().split(',');
  if (NOT_STARTED.has(statusNames.get(cells.at(-1)))) continue;
  if (!startDates.has(cells[2])) startDates.set(cells[2], []);
  startDates.get(cells[2]).push(raceDates.get(cells[1]));
}
const startsThrough = (driverId, date) => (startDates.get(String(driverId)) ?? []).filter((day) => day <= date).length;
assert.deepEqual(INSIGHTS_DATA.dataThrough, manifest.lastRace, 'findings match the race data');
assert.equal(INSIGHTS_DATA.modelSourceHash, model.sourceHash, 'findings match the model source');
assert.equal(INSIGHTS_DATA.modelFileHash, createHash('sha256').update(modelBytes).digest('hex'), 'rebuild findings after any model change');
assert.equal(
  INSIGHTS_DATA.retrospectiveFileHash,
  createHash('sha256').update(retrospectiveBytes).digest('hex'),
  'rebuild findings after retrospective changes',
);
assert.equal(
  INSIGHTS_DATA.ratingReferenceHash,
  createHash('sha256').update(referenceBytes).digest('hex'),
  'rebuild findings after the display reference changes',
);
assert.deepEqual(
  INSIGHT_CARDS.map((card) => card.id),
  [
    'driver-peak-ratings',
    'driver-low-ratings',
    'car-peak-ratings',
    'car-low-ratings',
    'explained-share',
    'circuit-weights',
    'champions',
    'equal-car-titles',
    'career-driver-and-car',
    'teammate-gaps',
    'qualifying-versus-race',
    'ageing',
    'upsets',
  ],
);
for (const card of INSIGHT_CARDS) {
  assert.ok(INSIGHT_TOPICS.some((topic) => topic.id === card.topic));
  assert.ok(card.label.length <= 30);
  for (const text of [card.title, card.lead(INSIGHTS_DATA), card.body(INSIGHTS_DATA), card.how(INSIGHTS_DATA)]) {
    assert.equal(typeof text, 'string');
    assert.ok(!/undefined|NaN|\[object|null/.test(text), `${card.id}: ${text}`);
  }
}
assert.equal(INSIGHT_TOPICS.length, 3, 'findings have three categories');
assert.deepEqual(
  INSIGHT_TOPICS.flatMap((topic) => INSIGHT_CARDS.filter((card) => card.topic === topic.id).map((card) => card.id)).slice(0, 4),
  ['driver-peak-ratings', 'driver-low-ratings', 'car-peak-ratings', 'car-low-ratings'],
  'the four extremes lead the displayed insights',
);
for (const topic of INSIGHT_TOPICS) assert.ok(INSIGHT_CARDS.some((card) => card.topic === topic.id));
// Compare each extreme with the same displayed weekends used by Ratings and History.
const displayed = centredRatings(retrospective.model, reference, retrospective.refitHash);
for (const [kind, identity, keys] of [
  ['drivers', 'driverId', ['driverHigh', 'driverLow']],
  ['cars', 'constructorId', ['carHigh', 'carLow']],
]) {
  const ratings = displayed.snaps.flatMap((snap) =>
    snap[kind].map((row) => ({
      id: row[identity],
      name: row.name,
      date: snap.date,
      rating: row.overall,
    })),
  );
  for (const [index, key] of keys.entries()) {
    const extremes = INSIGHTS_DATA.ratingExtremes[key];
    assert.equal(extremes.length, 25, `${key} lists 25 entities`);
    assert.equal(new Set(extremes.map((row) => row.name)).size, extremes.length);
    const minimumStarts = INSIGHTS_DATA.ratingExtremes[`${key}MinimumStarts`];
    const eligible = minimumStarts ? ratings.filter((rating) => startsThrough(rating.id, rating.date) >= minimumStarts) : ratings;
    const bestById = new Map();
    for (const rating of eligible) {
      const previous = bestById.get(rating.id);
      if (!previous || (index === 0 ? rating.rating > previous.rating : rating.rating < previous.rating)) bestById.set(rating.id, rating);
    }
    const expected = [...bestById.values()].sort((a, b) => (index === 0 ? b.rating - a.rating : a.rating - b.rating)).slice(0, 25);
    assert.deepEqual(
      extremes.map((row) => [row.name, row.date]),
      expected.map((row) => [row.name, row.date]),
      `${key}: top 25 entities`,
    );
    for (const row of extremes) {
      const actual = eligible.find((rating) => rating.name === row.name && rating.date === row.date);
      assert.ok(actual && Math.abs(actual.rating - row.rating) < 0.056, `${key}: ${row.name} ${row.date}`);
      const history = eligible.filter((rating) => rating.id === actual.id).map((rating) => rating.rating);
      const peak = index === 0 ? Math.max(...history) : Math.min(...history);
      assert.ok(Math.abs(actual.rating - peak) < 1e-8, `${key}: ${row.name} is at their own extreme`);
    }
    const global = index === 0 ? Math.max(...eligible.map((row) => row.rating)) : Math.min(...eligible.map((row) => row.rating));
    assert.ok(Math.abs(extremes[0].rating - global) < 0.056, `${key} leads with the correct extreme`);
    for (let position = 1; position < extremes.length; position++)
      assert.ok(
        index === 0
          ? extremes[position - 1].rating >= extremes[position].rating
          : extremes[position - 1].rating <= extremes[position].rating,
      );
  }
}
assert.equal(INSIGHTS_DATA.ratingExtremes.driverHighMinimumStarts, 20, 'driver peaks count from 20 Grand Prix starts');
for (const key of ['driverLow', 'carHigh', 'carLow'])
  assert.equal(INSIGHTS_DATA.ratingExtremes[`${key}MinimumStarts`], undefined, `${key} has no minimum`);
const highestDriver = INSIGHT_CARDS.find((card) => card.id === 'driver-peak-ratings');
assert.match(highestDriver.how(INSIGHTS_DATA), /only after 20 Grand Prix starts/);
assert.match(INSIGHT_CARDS.find((card) => card.id === 'driver-low-ratings').how(INSIGHTS_DATA), /even short careers/);
const revisedExtremes = {
  ...INSIGHTS_DATA,
  ratingExtremes: {
    ...INSIGHTS_DATA.ratingExtremes,
    driverHigh: [{ name: 'Example Driver', year: 2025, grandPrix: 'Example Grand Prix', rating: 1150 }],
  },
};
assert.match(highestDriver.lead(revisedExtremes), /Example Driver/);
const circuitCard = INSIGHT_CARDS.find((card) => card.id === 'circuit-weights');
const altered = {
  ...INSIGHTS_DATA,
  circuitWeights: [{ name: 'Example Circuit', carWeight: 1, driverWeight: 9 }, ...INSIGHTS_DATA.circuitWeights],
};
assert.match(circuitCard.lead(altered), /Example/);
assert.notEqual(circuitCard.lead(altered), circuitCard.lead(INSIGHTS_DATA), 'circuit headline follows changed model estimates');
const rows = INSIGHTS_DATA.eraTiming;
for (const row of rows) assert.ok(row.minimum <= row.median && row.median <= row.maximum);
console.log('PASS insight selection, current model fingerprint and data-dependent headlines');
