// Builds the ratings once and writes them as the two files the site downloads:
//   data/model.json        every weekend's ratings and the forecast state (what every page reads); the histories are rebuilt from the weekends on load
//   data/export-rows.json  the rows of the CSV download, fetched only when a visitor asks for it
// Both carry a fingerprint of the data and the model source; tests/test-model-file.mjs fails if either changed since. Run after refreshing data/
// or changing packages/core:
//   node tools/build-model.mjs
import { writeFile } from 'node:fs/promises';
import { loadData } from '../packages/research/node/common.mjs';
import { buildStateSpace } from '../packages/core/src/state-space/build.js';
import { eloBenchmark } from '../packages/core/src/elo-benchmark.js';
import { serialize } from '../packages/core/src/json-serialization.js';
import { formShifts } from '../packages/core/src/forecast/form-shift.js';
import { modelSourceHash } from './model-source-hash.mjs';

export const FILE_FORMAT = 1;

// Travels inside every published data file, so the terms are with the data wherever it is copied (see the About page of the site and data/NOTICE.md).
export const LICENCE_NOTICE = {
  licence: 'CC BY-NC-SA 4.0',
  url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  credit:
    'Race data: Ergast / Jolpica-F1, Kaggle datasets by J. Trotman, and TracingInsights/RaceData. Changed: the results were converted into ratings, forecasts and findings by Francesco Braicovich (Driver or Car).',
  nonCommercial: true,
};
const WEEKEND_SIGNIFICANT_DIGITS = 4; // a rating near 1000 is shown as a whole number; the forecast state and the CSV rows keep 9

// The benchmark rating tracks stay: Head to head reads the circuit and wet-weather skills from them. Everything else the benchmark adds is for
// comparison only and is left out, and so are the retirement audit tables, which no page reads.
const isBenchmarkField = (key) => /^elo[A-Z]/.test(key);
const withoutBenchmarkFields = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !isBenchmarkField(key)));
const withoutBenchmarkRows = (history) => new Map([...history].map(([id, rows]) => [id, rows.map(withoutBenchmarkFields)]));

const roundedRow = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      Number.isFinite(value) && !Number.isInteger(value) ? Number(value.toPrecision(WEEKEND_SIGNIFICANT_DIGITS)) : value,
    ]),
  );

const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const OMITTED_FROM_WEEKENDS = ['audit', 'qualAudit', 'eloDiag'];

/** The model as the site works with it: the same ratings, histories and forecast state, without what no page reads. */
export function trimmedModel(model) {
  return {
    ...omit(model, ['exportRows']),
    formShifts: formShifts(model), // the Ratings page's recent-form column, computed here so the browser needs no forecasting code to show it
    snaps: model.snaps.map((snap) => ({
      ...omit(snap, OMITTED_FROM_WEEKENDS),
      drivers: snap.drivers.map((row) => withoutBenchmarkFields(row)),
      cars: snap.cars.map((row) => withoutBenchmarkFields(row)),
    })),
    dh: withoutBenchmarkRows(model.dh),
    ch: withoutBenchmarkRows(model.ch),
  };
}

/** What the file carries: the trimmed model without the histories, which the site rebuilds from the weekends (core/src/weekend-histories.js). */
export function shippedModel(model) {
  const trimmed = omit(trimmedModel(model), ['dh', 'ch']);
  return {
    ...trimmed,
    snaps: trimmed.snaps.map((snap) => ({ ...snap, drivers: snap.drivers.map(roundedRow), cars: snap.cars.map(roundedRow) })),
  };
}

/** The first screen only: the latest weekend's ratings and the small lists around them. The rest of the file is fetched afterwards. */
export function latestModel(model) {
  const shipped = shippedModel(model);
  const latest = shipped.snaps.at(-1);
  // The Ratings page shows each rating's change since the entry's previous weekend, so each entry brings that one earlier row.
  const previousRows = (histories, rows, identifier) =>
    new Map(
      rows.map((row) => {
        const earlier = histories.get(row[identifier]).filter((point) => point.raceId !== latest.raceId);
        return [row[identifier], earlier.slice(-1).map((point) => roundedRow(withoutBenchmarkFields(point)))];
      }),
    );
  return {
    // without what only the other pages read: the forecast state, the circuit and wet-weather skills, the name lists
    ...omit(shipped, ['snaps', 'forecastState', 'ss', 'affFinal', 'wetFinal', 'dname', 'cname', 'circuitList']),
    snaps: [omit(latest, ['diag', 'ssDiag'])],
    dh: previousRows(model.dh, latest.drivers, 'driverId'),
    ch: previousRows(model.ch, latest.cars, 'constructorId'),
  };
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const data = await loadData();
  const model = buildStateSpace(data.raw, data.lapSnapshots, data.maps, { modelKind: 'state-space' }, data.lapPace, {
    benchmark: eloBenchmark,
  });
  const { sourceHash, lastRace } = await modelSourceHash();
  const header = { format: FILE_FORMAT, sourceHash, lastRace, licence: LICENCE_NOTICE };
  const modelText = serialize({ ...header, model: shippedModel(model) });
  const exportText = serialize({ ...header, rows: model.exportRows });
  const latestText = serialize({ ...header, model: latestModel(model) });
  await writeFile('data/model-latest.json', latestText);
  await writeFile('data/model.json', modelText);
  await writeFile('data/export-rows.json', exportText);
  console.log(
    `data/model-latest.json ${(latestText.length / 1e3).toFixed(0)} kB, data/model.json ${(modelText.length / 1e6).toFixed(1)} MB, data/export-rows.json ${(exportText.length / 1e6).toFixed(1)} MB (source ${sourceHash})`,
  );
}
