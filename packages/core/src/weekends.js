// Raw CSV rows -> chronologically ordered race weekends. Everything here is
// independent of model parameters, so it can be computed once and reused.
import { WET_RACES } from './wet-races.js';

/** First season the model rates (earlier rows are ignored). */
export const FIRST_YEAR = 1994;

/** Map curated wet-weather (year, GP name) entries to raceIds. */
export function buildWetSet(raw) {
  const byKey = new Map(raw.races.map((r) => [`${+r.year}|${(r.name || '').trim()}`, String(r.raceId)]));
  const out = new Set();
  for (const w of WET_RACES) {
    const id = byKey.get(`${w.year}|${w.gp}`);
    if (id) out.add(id);
  }
  return out;
}

/** Grid slot of a result row; 0 = pit-lane start, treated as the back of the grid. */
export const gridVal = (r) => {
  const g = +r.grid;
  return g > 0 ? g : 20;
};

/** Ordered unique circuits with display names (for pre-weekend prediction). */
export function buildCircuitList(raw) {
  const names = new Map((raw.circuits || []).map((c) => [String(c.circuitId), c.name || c.circuitRef || c.circuitId]));
  const seen = new Map();
  for (const r of raw.races || []) {
    const id = String(r.circuitId || '');
    if (!id || seen.has(id)) continue;
    seen.set(id, { id, name: names.get(id) || `Circuit ${id}` });
  }
  return [...seen.values()];
}

/**
 * Group results and qualifying by race, in calendar order.
 * Returns display-name maps, race info, per-race rows and the season lengths
 * (calendars are published in advance, so knowing a season's length is not
 * hindsight).
 */
export function groupWeekends(raw) {
  const dname = new Map(
    raw.drivers.map((d) => [String(d.driverId), ((d.forename || '') + ' ' + (d.surname || '')).trim() || d.driverRef || d.driverId]),
  );
  const cname = new Map(raw.constructors.map((c) => [String(c.constructorId), c.name || c.constructorRef || c.constructorId]));
  const smap = new Map((raw.status || []).map((s) => [String(s.statusId), s.status]));
  const rinfo = new Map(
    raw.races.map((r) => [
      String(r.raceId),
      { raceId: String(r.raceId), year: +r.year, round: +r.round, name: r.name || '', date: r.date || '', circuitId: r.circuitId || '' },
    ]),
  );

  const byRace = new Map();
  for (const r of raw.results) {
    const ri = rinfo.get(String(r.raceId));
    if (!ri || ri.year < FIRST_YEAR) continue;
    const rid = String(r.raceId);
    if (!byRace.has(rid)) byRace.set(rid, []);
    byRace.get(rid).push({
      ...r,
      raceId: rid,
      driverId: String(r.driverId),
      constructorId: String(r.constructorId),
      statusName: smap.get(String(r.statusId)) || String(r.statusId),
    });
  }
  const byQual = new Map();
  for (const q of raw.qualifying || []) {
    const ri = rinfo.get(String(q.raceId));
    if (!ri || ri.year < FIRST_YEAR) continue;
    const rid = String(q.raceId);
    if (!byQual.has(rid)) byQual.set(rid, []);
    byQual.get(rid).push({ ...q, raceId: rid, driverId: String(q.driverId), constructorId: String(q.constructorId) });
  }
  const raceIds = [...byRace.keys()].sort((a, b) => {
    const x = rinfo.get(a);
    const y = rinfo.get(b);
    return x.year - y.year || x.round - y.round;
  });
  const seasonSize = new Map();
  for (const rid of raceIds) {
    const y = rinfo.get(rid).year;
    seasonSize.set(y, (seasonSize.get(y) || 0) + 1);
  }
  return { dname, cname, rinfo, byRace, byQual, raceIds, seasonSize };
}

/**
 * Everything buildEloCore derives from the data alone, computed once per dataset:
 * the grouped weekends with their rows already sorted, plus the lookups the
 * circuit, wet and rookie mechanisms need. Pass it back through buildEloCore's `cache` option to
 * skip that work on every later build (e.g. during a parameter search).
 */
export function prepareWeekends(raw) {
  const grouped = groupWeekends(raw);
  const weekends = grouped.raceIds.map((rid) => {
    const rows = grouped.byRace
      .get(rid)
      .slice()
      .sort((a, b) => +a.positionOrder - +b.positionOrder);
    const qrows = (grouped.byQual.get(rid) || []).slice().sort((a, b) => +a.position - +b.position);
    return {
      rid,
      info: grouped.rinfo.get(rid),
      rows,
      qrows,
      maxLaps: Math.max(...rows.map((r) => +r.laps || 0), 1),
      qobs: null, // pairwise qualifying observations, filled on first use
    };
  });
  return {
    ...grouped,
    weekends,
    wetSet: buildWetSet(raw),
    dnat: new Map(raw.drivers.map((d) => [String(d.driverId), d.nationality || ''])),
    ddob: new Map(raw.drivers.map((d) => [String(d.driverId), Date.parse(d.dob)])),
    cirCountry: new Map((raw.circuits || []).map((c) => [String(c.circuitId), c.country || ''])),
    circuitList: buildCircuitList(raw),
  };
}
