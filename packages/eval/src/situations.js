import { REGULATION_YEARS } from './events.js';
import { reliability } from './predictive.js';
import { logisticCalibration, nll } from './stats.js';

/** Identify participants using only their appearances before each weekend. */
export function situationFlags(idx) {
  const flags = idx.timeline.map(() => new Map());
  for (const [driver, appearances] of idx.appear) {
    let stint = 0;
    let isMover = false;
    appearances.forEach((appearance, prior) => {
      const previous = appearances[prior - 1];
      if (!previous || previous.team !== appearance.team) {
        stint = 0;
        isMover = !!previous && prior >= 10 && idx.year(appearance.i) - idx.year(previous.i) <= 1;
      }
      flags[appearance.i].set(driver, { rookie: prior < 10 && idx.year(appearances[0].i) > idx.firstYear, mover: isMover && stint < 5 });
      stint++;
    });
  }
  return flags;
}

function score(rows, unweighted) {
  if (!rows.length) return null;
  const data = rows.map((r) => ({ ...r, z: r.logit, w: unweighted ? 1 : r.w }));
  const weight = data.reduce((sum, r) => sum + r.w, 0);
  const average = (value) => data.reduce((sum, r) => sum + r.w * value(r), 0) / weight;
  const slope =
    data.length >= 20 && data.some((r) => r.o === 0) && data.some((r) => r.o === 1)
      ? logisticCalibration(
          data.map((r) => r.z),
          data.map((r) => r.o),
          data.map((r) => r.w),
          { intercept: false },
        ).b
      : null;
  const calibration = reliability(data, 1);
  return {
    count: data.length,
    weekends: new Set(data.map((r) => r.i)).size,
    weight,
    loss: average((r) => nll(r.z, r.o)),
    brier: average((r) => (1 / (1 + Math.exp(-r.z)) - r.o) ** 2),
    accuracy: average((r) => (r.z === 0 ? 0.5 : +(r.z > 0 === !!r.o))),
    calibrationSlope: slope,
    ece: calibration.ece,
    reliability: calibration.bins,
  };
}

/** Slice forecasts that were calibrated only on earlier seasons. */
export function situationMetrics(idx, forecasts) {
  const flags = situationFlags(idx);
  const inSituation = {
    all: () => true,
    rookie: (r) => [r.x, r.y].some((d) => flags[r.i].get(d)?.rookie),
    mover: (r) => [r.x, r.y].some((d) => flags[r.i].get(d)?.mover),
    closeTeammates: (r) => r.same && Math.abs(r.logit) < Math.log(1.5),
    largeFavorite: (r) => Math.abs(r.logit) >= Math.log(4),
    wetRace: (r) => r.session === 'race' && r.wet,
    earlyRegulationSeason: (r) => REGULATION_YEARS.includes(r.year) && idx.timeline[r.i].round <= 5,
  };
  return Object.fromEntries(
    ['race', 'qual'].map((session) => [
      session,
      Object.fromEntries(
        Object.entries(inSituation).map(([name, keep]) => {
          const rows = forecasts.filter((r) => r.session === session && keep(r));
          const finish = rows.filter((r) => r.src === 'finish');
          return [
            name,
            {
              weighted: score(rows, false),
              unweighted: score(rows, true),
              unweightedFinish: session === 'race' ? score(finish, true) : null,
            },
          ];
        }),
      ),
    ]),
  );
}
