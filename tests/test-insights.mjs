// The Insights page is written from a snapshot of numbers computed offline. This checks that every card can be written from that
// snapshot (no missing field, no NaN in a headline) and that the snapshot is for the data the site ships.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { csv } from '../packages/core/src/csv.js';
import { INSIGHTS_DATA } from '../site/js/insights-data.js';
import { INSIGHT_CARDS, INSIGHT_TOPICS } from '../site/js/insights-cards.js';
import { formatOneDecimal, formatSigned } from '../site/js/insights-charts.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(await readFile(`${ROOT}data/manifest.json`, 'utf8'));
assert.deepEqual(
  INSIGHTS_DATA.dataThrough,
  manifest.lastRace,
  'insights-data.js was computed for another data version: rerun packages/research/python/compute-findings.py',
);
console.log(`PASS snapshot is for the shipped data (through ${manifest.lastRace.year} round ${manifest.lastRace.round})`);

assert.equal(INSIGHTS_DATA.ratingMetric, 'race', 'Insights use the published race rating');

const nonFinite = [];
const walk = (value, path) => {
  if (typeof value === 'number' && !Number.isFinite(value)) nonFinite.push(path);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
};
walk(INSIGHTS_DATA, 'data');
assert.deepEqual(nonFinite, [], 'the snapshot holds no NaN or infinite number');

assert.equal(INSIGHT_CARDS.length, 20, 'twenty findings');
const eraRows = INSIGHTS_DATA.eraTiming;
const seasons = INSIGHTS_DATA.equalCarTitles.seasons;
assert.ok(eraRows.length > 10, 'era comparison covers multiple careers');
for (const [index, row] of eraRows.entries()) {
  assert.equal(row.actualTitles, INSIGHTS_DATA.equalCarTitles.actual[row.name] || 0, `${row.name}: actual titles`);
  assert.ok(row.minimum <= row.median && row.median <= row.maximum, `${row.name}: median is within the alternative range`);
  assert.equal(row.alternatives, seasons.length - (row.last - row.first + 1), `${row.name}: all other placements are counted`);
  if (index > 0)
    assert.ok(
      eraRows[index - 1].actualEra - eraRows[index - 1].median <= row.actualEra - row.median,
      'rows are sorted by the equal-car timing difference',
    );
  const expected = INSIGHTS_DATA.equalCarTitles.expected.find(([name]) => name === row.name);
  if (expected) assert.ok(Math.abs(row.actualEra - expected[1]) < 0.05, `${row.name}: actual-era estimate agrees with equal-car titles`);
}
const alonso = eraRows.find((row) => row.name === 'Fernando Alonso');
assert.ok(alonso.alternatives > 0, 'long careers have at least one alternative placement');
assert.ok(alonso.seasons < alonso.last - alonso.first + 1, 'career gaps are preserved in the era comparison');
assert.ok(
  eraRows.some((row) => row.actualTitles === 0 && row.median > 0),
  'drivers without titles are included',
);
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
assert.ok(D.qualifyingVersusRace.drivers.filter((row) => row.difference > 0).length >= 3);
assert.ok(D.qualifyingVersusRace.drivers.filter((row) => row.difference < 0).length >= 4);
const carGap = D.qualifyingVersusRace.cars.reduce((best, row) => (row.difference > best.difference ? row : best));
const qualifyingHeadline = INSIGHT_CARDS.find((card) => card.id === 'qualifying-versus-race').lead(D);
assert.ok(carGap.difference > 0, 'a car has a higher qualifying rating than race rating');
assert.ok(qualifyingHeadline.includes(`${carGap.team} ${carGap.year}`), 'the headline names the current largest qualifying gap');
assert.ok(qualifyingHeadline.includes(formatOneDecimal(carGap.difference)), 'the headline shows the current qualifying gap');

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
const ageingHeadline = INSIGHT_CARDS.find((card) => card.id === 'ageing').lead(D);
assert.ok(earlyThirtiesChange < 0, 'ratings decline on average in the early thirties');
assert.ok(ageingHeadline.includes('ages 30 to 33'), 'the headline states the ages used in the average');
assert.ok(ageingHeadline.includes(formatSigned(earlyThirtiesChange)), 'the headline uses the current early-thirties change');
const model = JSON.parse(await readFile(`${ROOT}data/model.json`, 'utf8'));
assert.equal(D.modelSourceHash, model.sourceHash, 'Insights were computed from the current published model');
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
const latest = model.model.snaps.at(-1);
const driverById = new Map(latest.drivers.map((row) => [String(row.driverId), row]));
const carById = new Map(latest.cars.map((row) => [String(row.constructorId), row]));
assert.equal(D.currentGrid.length, latest.drivers.length, 'current grid contains the latest weekend lineup');
assert(
  latest.drivers.some((row) => Math.abs(row.race - row.combined) > 0.2),
  'race-versus-combined fixture is discriminating',
);
for (const item of D.currentGrid) {
  const row = driverById.get(idByName.get(item.name));
  assert.ok(row, `${item.name} is on the latest published grid`);
  assert.ok(Math.abs(item.driverRating - (row.race - 1000)) < 0.056, `${item.name} uses race driver rating`);
  assert.ok(Math.abs(item.carRating - (carById.get(String(row.constructorId)).race - 1000)) < 0.056, `${item.name} uses race car rating`);
  assert.ok(Math.abs(item.uncertainty - row.raceSd) < 0.056, `${item.name} uses race uncertainty`);
}

// Independently recompute the latest season leaders from published race scores.
const seasonalMeans = (kind, idKey) => {
  const groups = new Map();
  for (const snap of model.model.snaps.filter((row) => row.year === latest.year))
    for (const row of snap[kind]) {
      const id = String(row[idKey]);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(row.race - 1000);
    }
  return [...groups.values()]
    .filter((values) => values.length >= 8)
    .map((values) => values.reduce((sum, value) => sum + value, 0) / values.length);
};
const currentSeason = D.bestCarAgainstBestDriver.find((row) => row.year === latest.year);
assert(currentSeason, 'latest season leaders are present');
assert(
  Math.abs(currentSeason.driverEdge - Math.max(...seasonalMeans('drivers', 'driverId'))) < 0.056,
  'season driver leader uses race ratings',
);
assert(
  Math.abs(currentSeason.carEdge - Math.max(...seasonalMeans('cars', 'constructorId'))) < 0.056,
  'season car leader uses race ratings',
);
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

assert.ok(D.development.mclaren2023 > 0, 'McLaren 2023 remains an in-season climb');
assert.ok(
  INSIGHT_CARDS.find((card) => card.id === 'development')
    .lead(D)
    .includes(String(Math.round(D.development.mclaren2023))),
  'the headline uses the current McLaren climb',
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
assert.ok(driverShare('Marina Bay') > 0.5 && driverShare('Catalunya') < 0.5, 'Singapore leans on the driver, Barcelona on the car');
for (const name of ['Suzuka', 'Catalunya']) assert.ok(driverShare(name) < 0.5, `${name}: car weight exceeds driver weight`);
for (const name of ['Marina Bay', 'Hermanos Rodríguez', 'Enzo e Dino Ferrari'])
  assert.ok(driverShare(name) > 0.5, `${name}: driver weight exceeds car weight`);
assert.ok(D.homeAdvantage.low <= 0 && D.homeAdvantage.high >= 0, 'the reported home-advantage interval includes zero');
const evenest = D.explainedShare.reduce((lowest, row) => (row.betweenTeams < lowest.betweenTeams ? row : lowest));
assert.equal(evenest.year, 2025, '2025 is the most even season between teams');
const sorting = D.driverCarSorting;
const historicalSorting = sorting.filter((row) => row.year >= 2010 && row.year <= sorting.at(-1).year - 2);
const averageSorting = historicalSorting.reduce((sum, row) => sum + row.correlation, 0) / historicalSorting.length;
assert.ok(
  sorting.at(-2).correlation < averageSorting && sorting.at(-1).correlation < averageSorting,
  'recent driver-car sorting is below the historical average',
);
assert.ok(
  D.exchangeRate.every((row) => row.carSpreadPlaces > row.driverSpreadPlaces),
  'car spread exceeds driver spread in each era',
);

const fragile = D.fastButFragile;
const meanPace = fragile.reduce((sum, row) => sum + row.pace, 0) / fragile.length;
const meanRetirement = fragile.reduce((sum, row) => sum + row.excessRetirementPoints, 0) / fragile.length;
assert.ok(
  fragile.reduce((sum, row) => sum + (row.pace - meanPace) * (row.excessRetirementPoints - meanRetirement), 0) < 0,
  'faster cars have a negative association with excess retirements',
);
assert.ok(D.equalCarTitles.expected.length >= 4, 'enough drivers to quote');
console.log('PASS the hand-written facts in the headlines still hold for this data');
