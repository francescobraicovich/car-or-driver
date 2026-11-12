// Historical error bars are yearly field averages, not individual posteriors.
// Historical scenarios approximate entity uncertainties as independent.
const POINTS = 75 / Math.LN10;

export function withAnnualUncertainty(model) {
  const last = model.snaps.length - 1;
  const snaps = model.snaps.map((snapshot, index) => {
    // The latest snapshot retains its exact filtered covariance and uncertainties.
    if (index === last && snapshot.unified) return snapshot;
    const yearly = model.annualUncertainty?.[String(snapshot.year)];
    if (!yearly?.driver || !yearly?.car) throw Error(`Missing yearly uncertainty for ${snapshot.year}`);
    const keys = [],
      variances = [];
    const add = (kind, identity, sd) => {
      if (keys.some(([entity, id]) => entity === kind && id === String(identity))) return;
      keys.push([kind, String(identity)]);
      variances.push((sd / POINTS) ** 2);
    };
    const apply = (row, kind, identity) => {
      const values = yearly[kind];
      if (values.length !== 3 || values.some((value) => !Number.isFinite(value) || value <= 0))
        throw Error(`Invalid yearly ${kind} uncertainty for ${snapshot.year}`);
      const [qualSd, raceSd, overallSd] = values;
      add(kind, identity, overallSd);
      return { ...row, qualSd, raceSd, overallSd, combinedSd: overallSd };
    };
    const drivers = snapshot.drivers.map((row) => apply(row, 'driver', row.driverId));
    const cars = snapshot.cars.map((row) => apply(row, 'car', row.carId));
    const covariance = keys.map((_, i) => keys.map((__, j) => (i === j ? variances[i] : 0)));
    return { ...snapshot, drivers, cars, unified: { keys, covariance } };
  });
  return { ...model, snaps };
}
