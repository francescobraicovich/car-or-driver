// The Insights page is written from a snapshot of numbers computed offline. This checks that every card can be written from that
// snapshot (no missing field, no NaN in a headline) and that the snapshot is for the data the site ships.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { csv } from '../packages/core/src/csv.js';
import { INSIGHTS_DATA } from '../site/js/insights-data.js';
import { INSIGHT_CARDS, INSIGHT_TOPICS } from '../site/js/insights-cards.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(await readFile(`${ROOT}data/manifest.json`, 'utf8'));
assert.deepEqual(
  INSIGHTS_DATA.dataThrough,
  manifest.lastRace,
  'insights-data.js was computed for another data version: rerun packages/research/python/compute-findings.py',
);
console.log(`PASS snapshot is for the shipped data (through ${manifest.lastRace.year} round ${manifest.lastRace.round})`);

const nonFinite = [];
const walk = (value, path) => {
  if (typeof value === 'number' && !Number.isFinite(value)) nonFinite.push(path);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
};
walk(INSIGHTS_DATA, 'data');
assert.deepEqual(nonFinite, [], 'the snapshot holds no NaN or infinite number');

assert.equal(INSIGHT_CARDS.length, 21, 'twenty-one findings');
assert.ok(INSIGHTS_DATA.eraTiming.length > 10, 'era comparison covers long careers');
assert.ok(INSIGHTS_DATA.eraTiming.some((row) => row.name === 'Mika Häkkinen' && row.advantage < 0));
assert.ok(INSIGHTS_DATA.eraTiming.some((row) => row.name === 'Max Verstappen' && row.advantage > 0));
assert.equal(new Set(INSIGHT_CARDS.map((card) => card.id)).size, INSIGHT_CARDS.length, 'card ids are unique');
const topics = new Set(INSIGHT_TOPICS.map((topic) => topic.id));
for (const card of INSIGHT_CARDS) {
  assert.ok(topics.has(card.topic), `${card.id}: known topic`);
  assert.ok(['direct', 'model'].includes(card.kind), `${card.id}: known kind`);
  assert.ok(
    typeof card.label === 'string' && card.label.length > 0 && card.label.length <= 30,
    `${card.id}: a short label of at most 30 characters for the list of slides`,
  );
  const how = typeof card.how === 'function' ? card.how(INSIGHTS_DATA) : card.how;
  for (const [part, text] of [
    ['title', card.title],
    ['headline', card.lead(INSIGHTS_DATA)],
    ['body', card.body(INSIGHTS_DATA)],
    ['note', how],
  ]) {
    assert.equal(typeof text, 'string', `${card.id}: ${part} is text`);
    assert.ok(!/undefined|NaN|\[object|null/.test(text), `${card.id}: ${part} has no placeholder (${text.slice(0, 80)})`);
  }
}
for (const topic of INSIGHT_TOPICS)
  assert.ok(
    INSIGHT_CARDS.some((card) => card.topic === topic.id),
    `${topic.id} has cards`,
  );
console.log(
  `PASS insights: ${INSIGHT_CARDS.length} cards in ${INSIGHT_TOPICS.length} topics, every headline and note is written from the snapshot`,
);

// The headlines also state facts that are written by hand (names and thresholds). Each is asserted here, so that a data refresh which
// changes one fails this test instead of leaving a false sentence on the page.
const D = INSIGHTS_DATA;
const names = (rows) => rows.map((row) => row.name);
const saturday = D.qualifyingVersusRace.drivers.filter((row) => row.difference > 0);
const sunday = D.qualifyingVersusRace.drivers.filter((row) => row.difference < 0);
for (const name of ['George Russell', 'Valtteri Bottas', 'Romain Grosjean'])
  assert.ok(names(saturday).includes(name), `${name} is a Saturday driver`);
for (const name of ['Fernando Alonso', 'Juan Pablo Montoya', 'Max Verstappen', 'Kimi Räikkönen'])
  assert.ok(names(sunday).includes(name), `${name} is a Sunday driver`);
assert.ok(
  D.qualifyingVersusRace.cars.some((row) => row.team === 'McLaren' && row.year === 2012 && row.difference > 0),
  'McLaren 2012 qualified better than it raced',
);

const change = (age) => D.ageing.yearlyChange.find((row) => row.age === age)?.mean;
assert.ok(
  [20, 21, 22, 23].every((age) => change(age) > 3),
  'drivers improve quickly until their mid-twenties',
);
assert.ok(
  [25, 26, 27, 28, 29].every((age) => Math.abs(change(age)) <= 3.5),
  'a plateau from 25 to 29',
);
const earlyThirtiesChange = [30, 31, 32, 33].reduce((sum, age) => sum + change(age), 0) / 4;
assert.ok(earlyThirtiesChange <= -3 && earlyThirtiesChange >= -5, 'an average decline of about 3 to 5 points a year from 30');
const model = JSON.parse(await readFile(`${ROOT}data/model.json`, 'utf8'));
const firstRatedYear = model.model.snaps[0].year;
assert.equal(D.analysisFrom, firstRatedYear + 2, 'pre-race analyses begin after two rated seasons');
for (const [name, rows] of [
  ['best car against best driver', D.bestCarAgainstBestDriver],
  ['champions', D.champions],
  ['driver and car sorting', D.driverCarSorting],
  ['dominance', D.dominance],
  ['equal-car titles', D.equalCarTitles.seasons],
])
  assert.equal(rows[0].year, firstRatedYear, `${name} begins with the first rated season`);
assert.equal(D.winterOrder.correlations[0].year, firstRatedYear + 1, 'winter comparisons include the first transition');
assert.equal(D.gridDependence.poleToWin[0].period.split('–')[0], String(firstRatedYear), 'pole-to-win eras start with rated history');
const actualTitles = Object.fromEntries(
  [...new Set(D.champions.map((champion) => champion.name))].map((name) => [
    name,
    D.champions.filter((champion) => champion.name === name).length,
  ]),
);
assert.deepEqual(D.equalCarTitles.actual, actualTitles, 'actual title counts cover the same seasons as the champion chart');
assert.equal(D.equalCarTitles.actual['Michael Schumacher'], 7, 'Schumacher has seven actual titles in the rated period');
const people = csv(await readFile(`${ROOT}data/drivers.csv`, 'utf8'));
const idByName = new Map(people.map((person) => [`${person.forename} ${person.surname}`, String(person.driverId)]));
const birthById = new Map(people.map((person) => [String(person.driverId), person.dob]));
for (const [name, seasons] of Object.entries(D.ageing.careers)) {
  const id = idByName.get(name);
  assert.ok(id, `${name} has a birth date`);
  const dob = birthById.get(id);
  for (const season of seasons) {
    const first = model.model.snaps.find(
      (snap) => snap.year === season.year && snap.drivers.some((driver) => String(driver.driverId) === id),
    );
    assert.ok(first, `${name} has a rated race in ${season.year}`);
    const age = season.year - Number(dob.slice(0, 4)) - Number(first.date.slice(5) < dob.slice(5));
    assert.equal(season.age, age, `${name} ${season.year} uses age on the first rated Grand Prix date`);
  }
}
const schumacherLate = D.ageing.careers['Michael Schumacher'].filter((season) => season.age >= 41);
const schumacherEarlier = D.ageing.careers['Michael Schumacher'].filter((season) => season.year >= 1996 && season.year <= 2006);
const averageRating = (rows) => rows.reduce((sum, row) => sum + row.rating, 0) / rows.length;
assert.ok(
  schumacherLate.length > 0 && averageRating(schumacherEarlier) - averageRating(schumacherLate) > 20,
  "Schumacher's comeback average is well below his Ferrari-year average",
);

assert.ok(
  D.development.climbs.some((row) => row.team === 'McLaren' && row.year === 2023 && row.change > 40),
  'McLaren 2023 remains an in-season climb above 40 points',
);
const retirement = (year) => D.mechanicalRetirements.find((row) => row.year === year).percent;
assert.ok(Math.abs(retirement(D.dataThrough.year) - retirement(2017)) < 3, 'mechanical retirements are back to about the 2017 level');
const correlation = (year) => D.winterOrder.correlations.find((row) => row.year === year).correlation;
assert.ok(correlation(2009) < 0.3 && correlation(2022) > 0.7, '2009 reshuffled the order and 2022 did not');
const driverShare = (label) => {
  const row = D.circuitWeights.find((entry) => entry.name.includes(label));
  return row.driverWeight / (row.driverWeight + row.carWeight);
};
assert.ok(driverShare('Monaco') > 0.45 && driverShare('Monaco') < 0.6, 'Monaco is not especially a driver track');
assert.ok(driverShare('Marina Bay') > 0.6 && driverShare('Catalunya') < 0.5, 'Singapore leans on the driver, Barcelona on the car');
assert.ok(Math.abs(D.homeAdvantage.points) < 2 && D.homeAdvantage.high <= 6.5, 'no home advantage above about 6 points');
const evenest = D.explainedShare.reduce((lowest, row) => (row.betweenTeams < lowest.betweenTeams ? row : lowest));
assert.equal(evenest.year, 2025, '2025 is the most even season between teams');

assert.ok(D.equalCarTitles.expected.length >= 4, 'enough drivers to quote');
console.log('PASS the hand-written facts in the headlines still hold for this data');
