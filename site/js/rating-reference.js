// Presentation only: forecasts and inference retain the model's original coordinates.
import { withHistories } from '../../packages/core/src/weekend-histories.js';

export const REFERENCE_HALF_LIFE = 20;
const REFERENCE_WEIGHT = 1 - 2 ** (-1 / REFERENCE_HALF_LIFE);
const OUTPUTS = ['qual', 'race', 'overall'];
const KINDS = ['drivers', 'cars'];

/** Six references, frozen before each weekend. The first field supplies the initial origin. */
export function buildRatingReference(model, sourceHash) {
  let reference = null;
  let previousMeans = null;
  const snapshots = model.snaps.map((snapshot) => {
    const means = Object.fromEntries(
      KINDS.map((kind) => [
        kind,
        Object.fromEntries(
          OUTPUTS.map((output) => [output, snapshot[kind].reduce((sum, row) => sum + row[output], 0) / snapshot[kind].length]),
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
                reference[kind][output] + REFERENCE_WEIGHT * (previousMeans[kind][output] - reference[kind][output]),
              ]),
            ),
          ]),
        )
      : means;
    previousMeans = means;
    return { raceId: snapshot.raceId, ...reference };
  });
  return { format: 1, sourceHash, halfLife: REFERENCE_HALF_LIFE, snapshots };
}

/** Project display rows without modifying raw ratings, uncertainty, calibration or forecast state. */
export function centredRatings(model, reference, sourceHash) {
  if (reference.format !== 1 || reference.halfLife !== REFERENCE_HALF_LIFE || reference.sourceHash !== sourceHash)
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
