// The per-driver and per-car histories (model.dh, model.ch) are the weekends' rows regrouped by driver or car, each row prefixed with the weekend it
// belongs to. The published ratings file leaves them out and the site rebuilds them from the weekends on load; this is the same grouping that
// state-space/build.js performs when it builds the model.

const NOT_WEEKEND_INFORMATION = ['drivers', 'cars', 'audit', 'qualAudit', 'diag', 'ssDiag'];

function groupRows(snaps, rowsOf, identifier) {
  const histories = new Map();
  for (const snap of snaps) {
    const weekend = Object.fromEntries(Object.entries(snap).filter(([key]) => !NOT_WEEKEND_INFORMATION.includes(key)));
    for (const row of rowsOf(snap)) {
      if (!histories.has(row[identifier])) histories.set(row[identifier], []);
      histories.get(row[identifier]).push({ ...weekend, ...row });
    }
  }
  return histories;
}

/** The model with its driver and car histories (dh, ch) rebuilt from its weekend snapshots. */
export function withHistories(model) {
  return {
    ...model,
    dh: groupRows(model.snaps, (snap) => snap.drivers, 'driverId'),
    ch: groupRows(model.snaps, (snap) => snap.cars, 'constructorId'),
  };
}
