// Builds the ratings once and writes them as the files the site publishes:
//   data/model-latest.json the first screen: the latest weekend's ratings and the small lists around them
//   data/model.json        every weekend's ratings and the forecast state (what every page reads); the histories are rebuilt from the weekends on load,
//                          and the names and months of birth of the drivers rated (driverProfiles) for the card on a row of the ratings
// All carry a fingerprint of the data and the model source; tests/test-model-file.mjs fails if any changed since. Run after refreshing data/
// or changing packages/core:
//   node tools/build-model.mjs
import { writeFile } from 'node:fs/promises';
import { loadData } from '../packages/research/node/common.mjs';
import { buildUnified } from '../packages/core/node/build-unified.mjs';
import { serialize } from '../packages/core/src/json-serialization.js';
import { modelSourceHash } from './model-source-hash.mjs';

export const FILE_FORMAT = 3; // unified ratings and joint forecast covariance

// Travels inside every published data file, so the terms are with the data wherever it is copied (see the About page of the site and data/NOTICE.md).
export const LICENCE_NOTICE = {
  licence: 'CC BY-NC-SA 4.0',
  url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  credit:
    'Race data: Ergast / Jolpica-F1, Kaggle datasets by J. Trotman, and TracingInsights/RaceData. Changed: the results were converted into ratings, forecasts and findings by Francesco Braicovich (Car or Driver).',
  nonCommercial: true,
};
const WEEKEND_SIGNIFICANT_DIGITS = 6; // display still rounds to whole points; retain enough precision for what-if probabilities

const roundedRow = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      Number.isFinite(value) && !Number.isInteger(value) ? Number(value.toPrecision(WEEKEND_SIGNIFICANT_DIGITS)) : value,
    ]),
  );

const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const OMITTED_FROM_WEEKENDS = ['audit', 'qualAudit'];

/** The model as the site works with it: the same ratings, histories and forecast state, without what no page reads. */
export function trimmedModel(model) {
  return {
    ...omit(model, ['exportRows']),
    snaps: model.snaps.map((snap) => ({
      ...omit(snap, OMITTED_FROM_WEEKENDS),
    })),
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
        return [row[identifier], earlier.slice(-1).map((point) => roundedRow(point))];
      }),
    );
  return {
    // without what only the other pages read: the forecast state, the circuit and wet-weather skills, the name lists
    ...omit(shipped, ['snaps', 'forecastState', 'ss', 'affFinal', 'wetFinal', 'dname', 'cname', 'circuitList']),
    snaps: [omit(latest, ['diag', 'ssDiag', 'unified'])],
    dh: previousRows(model.dh, latest.drivers, 'driverId'),
    ch: previousRows(model.ch, latest.cars, 'constructorId'),
  };
}

/**
 * The first name, surname and month of birth of every driver that has been rated (the ids given), for the card that opens on a row of the ratings:
 * { driverId: [forename, surname, 'YYYY-MM' or ''] }. They come from data/drivers.csv. Only the year and the month are carried, so that the files
 * the site publishes hold no full birth dates (the privacy notice says so) and an age is still right except in the month of the birthday.
 */
export function driverProfiles(drivers, ids) {
  const wanted = new Set([...ids].map(String));
  return Object.fromEntries(
    drivers
      .filter((driver) => wanted.has(String(driver.driverId)))
      .map((driver) => [
        String(driver.driverId),
        [driver.forename || '', driver.surname || '', /^\d{4}-\d{2}-\d{2}$/.test(driver.dob) ? driver.dob.slice(0, 7) : ''],
      ]),
  );
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const data = await loadData();
  const model = await buildUnified(data);
  const { sourceHash, lastRace } = await modelSourceHash();
  const header = { format: FILE_FORMAT, sourceHash, lastRace, licence: LICENCE_NOTICE };
  const ratedIn = (snaps) => snaps.flatMap((snap) => snap.drivers.map((row) => row.driverId));
  const modelText = serialize({
    ...header,
    driverProfiles: driverProfiles(data.raw.drivers, ratedIn(model.snaps)),
    model: shippedModel(model),
  });
  const latestText = serialize({
    ...header,
    driverProfiles: driverProfiles(data.raw.drivers, ratedIn(model.snaps.slice(-1))),
    model: latestModel(model),
  });
  await writeFile('data/model-latest.json', latestText);
  await writeFile('data/model.json', modelText);
  console.log(
    `data/model-latest.json ${(latestText.length / 1e3).toFixed(0)} kB, data/model.json ${(modelText.length / 1e6).toFixed(1)} MB (source ${sourceHash})`,
  );
}
