// Presentation only: forecasts and inference retain the model's original coordinates.
import { withHistories } from '../../packages/core/src/weekend-histories.js';

export const REFERENCE_HALF_LIFE = 20;
/** The reference field is a fixed number of the highest-rated entrants, so grid size and turnover do not move it. */
export const REFERENCE_FIELD_SIZE = { drivers: 20, cars: 10 };
const REFERENCE_WEIGHT = 1 - 2 ** (-1 / REFERENCE_HALF_LIFE);
const OUTPUTS = ['qual', 'race', 'overall'];
const KINDS = ['drivers', 'cars'];

/** The median of the `count` highest values, or of all values when fewer are present. */
function medianOfHighest(values, count) {
  const highest = [...values].sort((a, b) => b - a).slice(0, count);
  const middle = Math.floor(highest.length / 2);
  return highest.length % 2 ? highest[middle] : (highest[middle - 1] + highest[middle]) / 2;
}

/** Six references, frozen before each weekend, built from the snapshots they translate. The first field supplies the initial origin. */
export function buildRatingReference(model, refitHash) {
  let reference = null;
  let previousLevels = null;
  const snapshots = model.snaps.map((snapshot) => {
    const levels = Object.fromEntries(
      KINDS.map((kind) => [
        kind,
        Object.fromEntries(
          OUTPUTS.map((output) => [
            output,
            medianOfHighest(
              snapshot[kind].map((row) => row[output]),
              REFERENCE_FIELD_SIZE[kind],
            ),
          ]),
        ),
      ]),
    );
    reference = reference
      ? Object.fromEntries(
          KINDS.map((kind) => [
            kind,
            Object.fromEntries(
              OUTPUTS.map((output) => [
                output,
                reference[kind][output] + REFERENCE_WEIGHT * (previousLevels[kind][output] - reference[kind][output]),
              ]),
            ),
          ]),
        )
      : levels;
    previousLevels = levels;
    return { raceId: snapshot.raceId, ...reference };
  });
  return { format: 2, refitHash, halfLife: REFERENCE_HALF_LIFE, fieldSize: REFERENCE_FIELD_SIZE, snapshots };
}

/** Project display rows without modifying raw ratings, uncertainty, calibration or forecast state. */
export function centredRatings(model, reference, refitHash) {
  if (
    reference.format !== 2 ||
    reference.halfLife !== REFERENCE_HALF_LIFE ||
    KINDS.some((kind) => reference.fieldSize?.[kind] !== REFERENCE_FIELD_SIZE[kind]) ||
    reference.refitHash !== refitHash
  )
    throw Error('Rating reference does not match this model. Rebuild the reference or reload the page.');
  const byRace = new Map(reference.snapshots.map((snapshot) => [String(snapshot.raceId), snapshot]));
  const project = (row, kind, raceId) => {
    const baseline = byRace.get(String(raceId))?.[kind];
    if (!baseline) throw Error(`Missing rating reference for weekend ${raceId}`);
    const displayed = { ...row };
    for (const output of OUTPUTS) displayed[output] = 1000 + row[output] - baseline[output];
    displayed.combined = displayed.overall;
    return displayed;
  };
  const displayed = {
    dname: model.dname,
    cname: model.cname,
    snaps: model.snaps.map((snapshot) => ({
      ...snapshot,
      drivers: snapshot.drivers.map((row) => project(row, 'drivers', snapshot.raceId)),
      cars: snapshot.cars.map((row) => project(row, 'cars', snapshot.raceId)),
    })),
  };
  // The first-screen file carries previous appearances that are absent from its single snapshot.
  if (model.dh && model.ch) {
    for (const [history, kind] of [
      ['dh', 'drivers'],
      ['ch', 'cars'],
    ])
      displayed[history] = new Map([...model[history]].map(([id, rows]) => [id, rows.map((row) => project(row, kind, row.raceId))]));
    return displayed;
  }
  return withHistories(displayed);
}
