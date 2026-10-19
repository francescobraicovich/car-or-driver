// The common input of the harness: the weekends of a season calendar, in date order, with who took part and the
// pairwise observations of each session. Everything downstream (rating runs, events, metrics) is keyed by the index
// of a weekend in this array.
//
// A weekend: { i, year, round, date, raceId, wet, rows: [{ driverId, constructorId }],
//              obs: { race: Obs[], qual: Obs[] } }
// An Obs is the filter's own observation (see state-space/filter.js): { x, y, cx, cy, o, w, same, src, pElo? } where x and y
// are driver ids, o = 1 when x finished ahead (or was faster), w the exam's weight and `same` marks teammates.

/**
 * Timeline of the real data from the exam pass (collectExam in state-space/exam.js). `snaps` supplies the wet flag.
 * @param {object[]} weekends  collectExam(...).weekends
 * @param {object[]} snaps     collectExam(...).model.snaps (same length), or null
 */
export function timelineFromExam(weekends, snaps = null) {
  return weekends.map((w, i) => ({
    i,
    year: w.year,
    round: +w.info.round,
    date: w.info.date,
    raceId: String(w.info.raceId),
    name: w.info.name,
    wet: !!snaps?.[i]?.diag?.wet,
    rows: w.rows,
    obs: { race: w.raceObs, qual: w.qualObs },
  }));
}

/** The weekends up to and including `year` (the filters are forward-only, so cutting the end loses nothing). */
export const truncateTimeline = (timeline, lastYear) => timeline.filter((w) => w.year <= lastYear);

/** The evaluation windows of the project (docs/state-space.md). The last one has been read once: see `holdout`. */
export const WINDOWS = [
  { id: 'fit', label: '2002-2007', from: 2002, to: 2007 },
  { id: 'w2', label: '2008-2011', from: 2008, to: 2011 },
  { id: 'w3', label: '2012-2015', from: 2012, to: 2015 },
  { id: 'holdout', label: '2016+', from: 2016, to: 9999, holdout: true },
];

/** Years from which data counts as holdout unless the caller opts in. */
export const HOLDOUT_FROM = 2016;
