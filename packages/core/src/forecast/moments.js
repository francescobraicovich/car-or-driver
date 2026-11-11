// Resolve driver and car ratings at a chosen historical weekend.
const mean = (xs, pick) => xs.reduce((s, x) => s + pick(x), 0) / xs.length;
const shortName = (name) => String(name || '').replace(/ Grand Prix$/, ' GP');
const DAY = 86400000;

function describe(points) {
  const first = points[0];
  const last = points[points.length - 1];
  const at = (p) => `${p.year} ${shortName(p.name)}`;
  if (points.length === 1) return at(first);
  return first.year === last.year ? `${first.year} season, ${points.length} weekends` : `${first.year}–${last.year}`;
}

/** Average ratings over a set of weekends (one weekend gives that weekend's values). */
function summarize(points, extra = {}) {
  return {
    points,
    race: mean(points, (p) => p.race),
    overall: mean(points, (p) => p.overall ?? p.race),
    qual: mean(points, (p) => p.qual),
    q: mean(points, (p) => p.q),
    label: describe(points),
    from: points[0].date,
    to: points[points.length - 1].date,
    note: '',
    ...extra,
  };
}

/**
 * Pick the weekends a "moment" refers to from a chronological list of rating points.
 *   { kind: 'latest' }            the most recent appearance
 *   { kind: 'date', date }        the rating after the last weekend on or before that date
 *   { kind: 'prime' }             the weekend with the highest rating
 * A date outside the entity's career is clamped to the nearest end and says so.
 */
export function resolveMoment(points, when = { kind: 'latest' }) {
  if (!points?.length) return null;
  if (when.kind === 'prime') {
    // The weekend after which the rating was highest. A rating is already an average of the
    // past, so averaging a stretch of weekends again would lag a rising career and could put
    // a "prime" below today's rating.
    const peak = points.reduce((best, p) => ((p.overall ?? p.race) > (best.overall ?? best.race) ? p : best));
    return summarize([peak], { prime: true });
  }
  if (when.kind === 'date') {
    const t = Date.parse(when.date);
    if (Number.isFinite(t)) {
      let index = -1;
      for (let i = 0; i < points.length; i++) if (Date.parse(points[i].date) <= t) index = i;
      if (index < 0) return summarize([points[0]], { note: `First appeared on ${points[0].date}, so that weekend is used.` });
      const last = points[points.length - 1];
      if (index === points.length - 1 && t - Date.parse(last.date) > 400 * DAY)
        return summarize([last], { note: `Last appeared on ${last.date}, so that weekend is used.` });
      return summarize([points[index]]);
    }
  }
  return summarize([points[points.length - 1]]);
}

/**
 * One side of the matchup. `side` = { driverId, when, carId, carWhen }:
 * carId '' means the car the driver actually had at that moment; otherwise `carWhen`
 * is { kind: 'same' } (the car as of the driver's weekends) or any moment as above.
 */
export function resolveSide(model, side) {
  const driverPoints = model.dh.get(side.driverId);
  const driver = resolveMoment(driverPoints, side.when);
  if (!driver) return { error: 'That driver has no rating history.' };
  const weekends = new Set(driver.points.map((p) => String(p.raceId)));
  let constructorId = side.carId;
  const own = !constructorId;
  if (own) {
    const counts = new Map();
    for (const p of driver.points) counts.set(p.constructorId, (counts.get(p.constructorId) || 0) + 1);
    constructorId = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  }
  const carPoints = model.ch.get(constructorId);
  if (!carPoints?.length) return { error: 'That car has no rating history.' };
  const carName = model.cname.get(constructorId) || constructorId;
  let car;
  if (own || !side.carWhen || side.carWhen.kind === 'same') {
    const shared = carPoints.filter((p) => weekends.has(String(p.raceId)));
    if (!shared.length)
      return {
        error: `${carName} did not race then. It raced ${carPoints[0].date.slice(0, 4)}–${carPoints[carPoints.length - 1].date.slice(0, 4)}; pick a date in that range.`,
      };
    car = summarize(
      shared,
      shared.length < driver.points.length
        ? { note: `${carName} raced in ${shared.length} of those ${driver.points.length} weekends.` }
        : {},
    );
  } else {
    car = resolveMoment(carPoints, side.carWhen);
  }
  return {
    driverId: side.driverId,
    name: model.dname.get(side.driverId) || side.driverId,
    driver,
    car: { ...car, constructorId, name: carName, own },
    constructorId,
  };
}
