// The cross-session link: what the race filter reads from the qualifying filter.
//
// Qualifying is a one-lap measurement with little noise from strategy, reliability or traffic, and a driver's skill carries over from one car to another
// there far better than in the race (frozen-rating slope of movers 0.86 against 0.35). Race and qualifying skill of a driver share most of their
// variance (the slope of race on qualifying teammate differences is 0.5 to 0.9 by season, the correlation 0.6 to 0.9; same car, so no car in it). So the race
// filter's strength of a driver is `beta * Dq + D + A + C` and of a car `gamma * Cq + C`, where Dq and Cq are the qualifying filter's levels, known inputs,
// and D, A, C are the race filter's own states: the race-specific residual of the driver, his persistent driver-team term, and the car's race residual.
//
// Look-ahead: a forecast of weekend k reads the qualifying levels through weekend k-1 (`offsets`); the update with that weekend's results and the
// posted rating also read weekend k's own qualifying (`offsetsPost`), which is known by the race and is not part of any forecast.

/**
 * @param {{ post?: { drivers: Map<string, { m: number, seen?: boolean }>, cars: Map<string, { m: number, seen?: boolean }> }[] }} qualRun
 *        the qualifying filter's output (or a harness rating run) on the same weekends
 * @param {number|number[]} beta   loading of a driver's race skill on his qualifying level (a series: one value per weekend, known before it)
 * @param {number} gamma           the same for a car
 * @returns {{ offsets: Map[], offsetsPost: Map[], carOffsets: Map[], carOffsetsPost: Map[] }}  ctx fields for runStateSpace
 */
export function qualLink(qualRun, beta, gamma = 0) {
  const lastD = new Map();
  const lastC = new Map();
  const out = { offsets: [], offsetsPost: [], carOffsets: [], carOffsetsPost: [] };
  const scaled = (m, b) => new Map([...m].map(([id, v]) => [id, b * v]));
  const posts = qualRun.post ?? qualRun.ratings; // a harness rating run says `post`, the filter's own output `ratings`
  if (!posts) throw Error('qualLink: the qualifying run has neither `post` nor `ratings`');
  posts.forEach((post, k) => {
    const bk = Array.isArray(beta) ? beta[k] : beta;
    out.offsets.push(scaled(lastD, bk));
    out.carOffsets.push(scaled(lastC, gamma));
    for (const [id, r] of post.drivers) if (r.seen) lastD.set(id, r.m);
    for (const [id, r] of post.cars) if (r.seen) lastC.set(id, r.m);
    out.offsetsPost.push(scaled(lastD, bk));
    out.carOffsetsPost.push(scaled(lastC, gamma));
  });
  return out;
}

/**
 * Arrival adaptation: a known, deterministic offset for a driver in his first weekends at a new team (lineage-aware `canon`), for drivers with at least `minPrior`
 * earlier weekends: -dip * rho^n in rating points at his n-th weekend there (n = 0 at the first), for `span` weekends. It is a prior about team changes in general
 * (like the rookie debut dip), uses nothing of the driver's results at the new team, and is meant for forecasts and the update, not for the posted rating.
 *
 * @param {{ rows: { driverId: string, constructorId: string }[] }[]} weekends   in date order (the same list the filter reads)
 * @param {(constructorId: string) => string} canon
 * @param {{ dip: number, rho: number, minPrior?: number, span?: number }|null} p
 * @returns {Map<string, number>[]|null} one map per weekend
 */
export function arrivalOffsets(weekends, canon, p) {
  if (!p || !p.dip) return null;
  const { dip, rho, minPrior = 10, span = 12 } = p;
  const team = new Map();
  const seen = new Map();
  const since = new Map(); // weekends already spent at the current team, for drivers under adaptation
  return weekends.map((w) => {
    const m = new Map();
    for (const r of w.rows) {
      const d = String(r.driverId);
      const t = canon(String(r.constructorId));
      const prev = team.get(d);
      if (prev !== undefined && prev !== t && (seen.get(d) ?? 0) >= minPrior) since.set(d, 0);
      team.set(d, t);
      if (since.has(d)) {
        const n = since.get(d);
        if (n < span) {
          m.set(d, -dip * rho ** n);
          since.set(d, n + 1);
        } else since.delete(d);
      }
      seen.set(d, (seen.get(d) ?? 0) + 1);
    }
    return m;
  });
}
