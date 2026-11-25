// Compares rules for the 1,000 display reference on the published ratings. Run from the repository root:
//   node research/display-reference-field/compare-reference-rules.mjs
import { readFile } from 'node:fs/promises';
import { deserialize } from '../../packages/core/src/json-serialization.js';

const WEIGHT = 1 - 2 ** (-1 / 20);
const filtered = deserialize(await readFile('data/model.json', 'utf8')).model.snaps;
const historical = deserialize(await readFile('data/retrospective.json', 'utf8')).model.snaps;

// Career starts before each weekend, counted over the whole championship history.
const raceDates = new Map();
for (const line of (await readFile('data/races.csv', 'utf8')).split('\n').slice(1))
  if (line) raceDates.set(line.split(',')[0], line.match(/\d{4}-\d{2}-\d{2}/)[0]);
const starts = new Map();
for (const line of (await readFile('data/results.csv', 'utf8')).split('\n').slice(1)) {
  if (!line) continue;
  const [, raceId, driverId] = line.split(',');
  if (!starts.has(driverId)) starts.set(driverId, []);
  starts.get(driverId).push(raceDates.get(raceId));
}
const startsBefore = (driverId, date) => (starts.get(driverId) ?? []).filter((day) => day < date).length;

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const robustSpread = (values) => 1.4826 * median(values.map((value) => Math.abs(value - median(values))));
const highest = (values, count) => [...values].sort((a, b) => b - a).slice(0, count);
const drivers = (snapshot) => snapshot.drivers.map((row) => row.overall);
const cars = (snapshot) => snapshot.cars.map((row) => row.overall);
const experienced = (snapshot) => {
  const values = snapshot.drivers.filter((row) => startsBefore(row.driverId, snapshot.date) >= 20).map((row) => row.overall);
  return values.length >= 8 ? values : drivers(snapshot);
};

/** A reference frozen before each weekend: a lagged exponential average with a 20-weekend half-life. */
function lagged(snaps, level) {
  let reference;
  let previous;
  return snaps.map((snapshot) => {
    const current = level(snapshot);
    reference = reference === undefined ? current : reference + WEIGHT * (previous - reference);
    previous = current;
    return reference;
  });
}
const years = [1994, 1995, 1996, 1997, 2000, 2006, 2010, 2015, 2020, 2025, 2026];
const yearly = (year, value) => {
  const indices = historical.flatMap((snapshot, index) => (snapshot.year === year ? [index] : []));
  return mean(indices.map(value));
};
const format = (value, width = 8) => value.toFixed(1).padStart(width);

console.log('1. Displayed median driver (overall) by year');
const driverRules = {
  previous: lagged(filtered, (snapshot) => mean(drivers(snapshot))), // filtered field means, also applied to the history
  'field mean': lagged(historical, (snapshot) => mean(drivers(snapshot))),
  'field median': lagged(historical, (snapshot) => median(drivers(snapshot))),
  '20+ starts': lagged(historical, (snapshot) => median(experienced(snapshot))),
  'highest 20': lagged(historical, (snapshot) => median(highest(drivers(snapshot), 20))),
};
console.log(
  `year  grid ${Object.keys(driverRules)
    .map((name) => name.padStart(13))
    .join('')}`,
);
for (const year of years)
  console.log(
    `${year} ${format(
      yearly(year, (index) => historical[index].drivers.length),
      5,
    )}${Object.values(driverRules)
      .map((reference) =>
        format(
          yearly(year, (index) => 1000 + median(drivers(historical[index])) - reference[index]),
          13,
        ),
      )
      .join('')}`,
  );

console.log('\n2. Displayed median car (overall) by year');
const carRules = {
  previous: lagged(filtered, (snapshot) => mean(cars(snapshot))),
  'field mean': lagged(historical, (snapshot) => mean(cars(snapshot))),
  'highest 10': lagged(historical, (snapshot) => median(highest(cars(snapshot), 10))),
};
console.log(
  `year  cars ${Object.keys(carRules)
    .map((name) => name.padStart(13))
    .join('')}`,
);
for (const year of years)
  console.log(
    `${year} ${format(
      yearly(year, (index) => historical[index].cars.length),
      5,
    )}${Object.values(carRules)
      .map((reference) =>
        format(
          yearly(year, (index) => 1000 + median(cars(historical[index])) - reference[index]),
          13,
        ),
      )
      .join('')}`,
  );

function peaks(reference) {
  const best = new Map();
  historical.forEach((snapshot, index) => {
    for (const row of snapshot.drivers) {
      if (startsBefore(row.driverId, snapshot.date) < 20) continue;
      const value = 1000 + row.overall - reference[index];
      if (!best.has(row.name) || value > best.get(row.name).value) best.set(row.name, { name: row.name, value, year: snapshot.year });
    }
  });
  return [...best.values()].sort((a, b) => b.value - a.value).slice(0, 15);
}
console.log('\n3. All-time peak overall ratings, drivers with at least 20 starts at the time');
const previousPeaks = peaks(driverRules.previous);
const publishedPeaks = peaks(driverRules['highest 20']);
for (const [name, list] of [
  ['previous', previousPeaks],
  ['highest 20', publishedPeaks],
])
  console.log(`${name}: ${list.filter((peak) => peak.year <= 1996).length} of the top 15 from 1994-1996`);
for (let rank = 0; rank < 10; rank++) {
  const [a, b] = [previousPeaks[rank], publishedPeaks[rank]];
  console.log(
    `${String(rank + 1).padStart(2)}  ${`${a.name} ${a.value.toFixed(0)} (${a.year})`.padEnd(36)} ${b.name} ${b.value.toFixed(0)} (${b.year})`,
  );
}

console.log('\n4. Sensitivity to the size of the reference field');
for (const size of [16, 18, 20, 22, 24]) {
  const reference = lagged(historical, (snapshot) => median(highest(drivers(snapshot), size)));
  const list = peaks(reference);
  const medians = [1994, 1996, 2010, 2025]
    .map((year) => `${year} ${yearly(year, (index) => 1000 + median(drivers(historical[index])) - reference[index]).toFixed(1)}`)
    .join(', ');
  console.log(
    `${size} drivers: median driver ${medians}; ${list.filter((peak) => peak.year <= 1996).length} of the top 15 from 1994-1996; highest peak ${list[0].name} ${list[0].value.toFixed(0)} (${list[0].year})`,
  );
}

console.log('\n5. Robust spread (1.4826 x median absolute deviation) of driver ratings, season average');
console.log(`year ${['highest 20', 'whole field', '20+ starts'].map((name) => name.padStart(12)).join('')}`);
for (const year of years)
  console.log(
    `${year}${[(snapshot) => highest(drivers(snapshot), 20), drivers, experienced]
      .map((values) =>
        format(
          yearly(year, (index) => robustSpread(values(historical[index]))),
          12,
        ),
      )
      .join('')}`,
  );

console.log('\n6. Newcomers: share of grid entries with fewer than 20 previous starts, and displayed debut ratings (highest-20 reference)');
for (let first = 1994; first <= 2026; first += 4) {
  let entries = 0;
  let inexperienced = 0;
  const debuts = [];
  historical.forEach((snapshot, index) => {
    if (snapshot.year < first || snapshot.year > first + 3) return;
    for (const row of snapshot.drivers) {
      const previous = startsBefore(row.driverId, snapshot.date);
      entries++;
      if (previous < 20) inexperienced++;
      if (previous === 0) debuts.push(1000 + row.overall - driverRules['highest 20'][index]);
    }
  });
  console.log(
    `${first}-${Math.min(first + 3, 2026)}: ${((100 * inexperienced) / entries).toFixed(1)}% of entries; ${debuts.length} debuts, median ${debuts.length ? median(debuts).toFixed(1) : '-'}`,
  );
}
