import { measurementRows } from '../packages/core/node/unified-evidence.mjs';

/** Display the published overall ratings and the teammate evidence they read. */
export function buildUnifiedTeammateGraph(model, weekends, driverRows, lapPace, laps) {
  const drivers = new Map();
  const pairs = new Map();
  const births = new Map(driverRows.map((row) => [String(row.driverId), row.dob]));
  return weekends.map((weekend, index) => {
    const snap = model.snaps[index];
    const duels = new Map();
    const observations = measurementRows(weekend, lapPace, laps, model.params.refinements).filter((row) => row.same);
    for (const row of observations) {
      const key = `${row.a}:${row.b}`;
      const pair = pairs.get(key) ?? [row.a, row.b, 0, 0];
      const direction = (row.channel === 2 ? 2 * row.target - 1 : Math.sign(row.target)) || 0;
      if (direction > 0) pair[2] += row.weight;
      if (direction < 0) pair[3] += row.weight;
      pairs.set(key, pair);
      const duel = duels.get(key) ?? [row.a, row.b, 0, 0];
      if (row.channel === 0) duel[2] = direction;
      // Career race counts prefer finishing order; pace is the fallback.
      if (row.channel > 0) duel[3] = direction;
      duels.set(key, duel);
    }
    for (const row of snap.drivers) {
      const prior = drivers.get(row.driverId) ?? { starts: 0, years: 0 };
      drivers.set(row.driverId, {
        starts: prior.starts + 1,
        years: prior.years + snap.year + (snap.round - 0.5) / 25,
        rating: row.overall,
        year: snap.year,
      });
    }
    const nodes = [...drivers].map(([id, record]) => {
      const born = births.get(id);
      const age = /^\d{4}-\d{2}-\d{2}$/.test(born ?? '')
        ? snap.year - +born.slice(0, 4) - (snap.date.slice(5) < born.slice(5) ? 1 : 0)
        : null;
      return [id, record.rating, record.years / record.starts, record.starts, age, record.year];
    });
    // Qualifying-only entrants are not plotted until their first race appearance.
    const present = new Set(nodes.map(([id]) => id));
    return {
      raceId: snap.raceId,
      nodes,
      duels: [...duels.values()],
      edges: [...pairs.values()].filter(([a, b]) => present.has(a) && present.has(b)).map((row) => [...row]),
    };
  });
}
