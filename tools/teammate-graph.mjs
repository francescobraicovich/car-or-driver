// A dated, teammate-only graph. Every snapshot is built from evidence observed
// through that weekend; the same rule applies to every driver and every move.
const finitePosition = (value) => (/^\d+$/.test(String(value ?? '')) ? Number(value) : null);
const keyOf = (a, b) => [a, b].sort((x, y) => Number(x) - Number(y)).join(':');

export function buildTeammateGraph(snaps, results, qualifying, driverRows = [], options = {}) {
  const halfLifeYears = options.halfLifeYears ?? Infinity;
  const birthDates = new Map(driverRows.map((row) => [String(row.driverId), row.dob]));
  const ageAt = (id, date) => {
    const born = birthDates.get(id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(born ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null;
    const [by, bm, bd] = born.split('-').map(Number);
    const [y, m, d] = date.split('-').map(Number);
    return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  };
  const resultsByRace = new Map();
  const qualifyingByRace = new Map();
  for (const [rows, index] of [
    [results, resultsByRace],
    [qualifying, qualifyingByRace],
  ]) {
    for (const row of rows) {
      const key = String(row.raceId);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(row);
    }
  }
  const drivers = new Map(); // starts and mean date, through the selected weekend
  const pairs = new Map(); // observed teammate links only
  const snapshots = [];
  let previousDate = null;
  for (const snap of snaps) {
    const raceId = String(snap.raceId);
    const year = Number(snap.year) + (Number(snap.round) - 0.5) / 25;
    const date = Date.parse(`${snap.date}T00:00:00Z`);
    if (Number.isFinite(halfLifeYears) && previousDate !== null) {
      const elapsedYears = (date - previousDate) / (365.25 * 24 * 60 * 60 * 1000);
      const retention = 2 ** (-elapsedYears / halfLifeYears);
      for (const pair of pairs.values()) {
        pair.wins *= retention;
        pair.losses *= retention;
      }
    }
    previousDate = date;
    for (const row of snap.drivers) {
      const id = String(row.driverId);
      const old = drivers.get(id) ?? { starts: 0, years: 0 };
      old.starts++;
      old.years += year;
      drivers.set(id, old);
    }
    const byTeam = new Map();
    for (const row of resultsByRace.get(raceId) ?? []) {
      const id = String(row.driverId);
      if (!drivers.has(id)) continue;
      const team = String(row.constructorId);
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team).push(row);
    }
    const qualifyingRows = new Map((qualifyingByRace.get(raceId) ?? []).map((row) => [String(row.driverId), row]));
    const duels = [];
    for (const rows of byTeam.values()) {
      for (let i = 0; i < rows.length; i++)
        for (let j = i + 1; j < rows.length; j++) {
          const [a, b] = [String(rows[i].driverId), String(rows[j].driverId)].sort((x, y) => Number(x) - Number(y));
          const ra = rows.find((row) => String(row.driverId) === a);
          const rb = rows.find((row) => String(row.driverId) === b);
          const qa = qualifyingRows.get(a);
          const qb = qualifyingRows.get(b);
          // Compare the last session both entered. A grid penalty never becomes qualifying evidence.
          const session = ['q3', 'q2', 'q1'].find((part) => qa?.[part] && qb?.[part] && qa[part] !== '\\N' && qb[part] !== '\\N');
          const seconds = (value) => {
            const fields = String(value).split(':').map(Number);
            return fields.length === 2 ? fields[0] * 60 + fields[1] : Number(value);
          };
          const qaTime = session ? seconds(qa[session]) : NaN;
          const qbTime = session ? seconds(qb[session]) : NaN;
          const q = Number.isFinite(qaTime) && Number.isFinite(qbTime) && Math.abs(qaTime - qbTime) < 2.5 ? Math.sign(qbTime - qaTime) : 0;
          const pa = finitePosition(ra.position);
          const pb = finitePosition(rb.position);
          const r = pa && pb && pa !== pb ? Math.sign(pb - pa) : 0;
          duels.push([a, b, q, r]);
          const key = keyOf(a, b);
          const pair = pairs.get(key) ?? { a, b, wins: 0, losses: 0 };
          // Race and qualifying are separate observations, with race weighted more.
          pair.wins += (q === 1 ? 1 : 0) + (r === 1 ? 1.5 : 0);
          pair.losses += (q === -1 ? 1 : 0) + (r === -1 ? 1.5 : 0);
          pairs.set(key, pair);
        }
    }
    // Weighted graph Laplacian, anchored by equal zero-centred priors. Every
    // teammate path contributes; isolated nodes honestly stay at the prior.
    const ids = [...drivers.keys()];
    const level = new Map(ids.map((id) => [id, 0]));
    const links = [...pairs.values()].map((pair) => {
      const total = pair.wins + pair.losses;
      return { ...pair, target: 75 * Math.log10((pair.wins + 1) / (pair.losses + 1)), weight: Math.min(total, 60) / 8 };
    });
    const adjacency = new Map(ids.map((id) => [id, []]));
    for (const link of links) {
      adjacency.get(link.a)?.push([link.b, link.target, link.weight]);
      adjacency.get(link.b)?.push([link.a, -link.target, link.weight]);
    }
    for (let sweep = 0; sweep < 500; sweep++) {
      let largestChange = 0;
      for (const id of ids) {
        let sum = 0;
        let precision = 1; // fixed 1-point prior precision for all drivers
        for (const [other, gap, weight] of adjacency.get(id)) {
          sum += weight * (level.get(other) + gap);
          precision += weight;
        }
        const next = sum / precision;
        largestChange = Math.max(largestChange, Math.abs(next - level.get(id)));
        level.set(id, next);
      }
      if (largestChange < 1e-8) break;
    }
    snapshots.push({
      raceId,
      nodes: ids.map((id) => [
        id,
        Math.round((1000 + level.get(id)) * 10) / 10,
        Math.round((drivers.get(id).years / drivers.get(id).starts) * 100) / 100,
        drivers.get(id).starts,
        ageAt(id, snap.date),
      ]),
      duels,
    });
  }
  return snapshots;
}
