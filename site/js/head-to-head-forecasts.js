// The forecasts of the head to head of two drivers (the page of two drivers: tools/driver-and-team-pages.mjs writes them into the page, and
// pair-page.js works them out again when a moment, the distance or the grid is changed): the chance that the first finishes ahead of the second.
// - At a moment of each career (their best, their latest, any date), from the published historical ratings (scenarioForecast): in the same car
//   (the car of the first driver at that moment, so that the gap is the drivers' alone) or each in their own.
// - The next race, for two drivers of the current grid in their own cars, from the current ratings (forecastRace), with the distance and, when
//   given, the starting grid.
import { forecastRace } from '../../packages/core/src/unified/forecast.js';
import { resolveSide } from '../../packages/core/src/forecast/moments.js';
import { scenarioForecast } from '../../packages/core/src/unified/scenario.js';

export const RACE_LAPS = 60;

const round = (value, places = 4) => (Number.isFinite(value) ? Math.round(value * 10 ** places) / 10 ** places : null);

/** What a page shows of a forecast: the chance, how it is built, the rating gap and the chance of each retiring over the distance. */
function summary(result, L) {
  const retire = (q) => round(1 - (1 - q) ** L);
  return {
    p: round(result.p),
    steps: Object.fromEntries(Object.entries(result.breakdown).map(([step, p]) => [step, round(p)])),
    gap: round(result.gap, 1),
    sd: round(result.sd, 1),
    risk: [retire(result.qA), retire(result.qB)],
    laps: L,
  };
}

/**
 * The two drivers at a moment each: `when` is { kind: 'latest' } or { kind: 'date', date }, `car` 'same' or 'own'.
 * @returns {object} the summary, with the date each driver is taken at and the car (when it is the same), or { error }
 */
export function momentForecast(historical, [firstId, secondId], [firstWhen, secondWhen], car, L = RACE_LAPS) {
  let sides = [
    { driverId: firstId, when: firstWhen, carId: '', carWhen: { kind: 'same' } },
    { driverId: secondId, when: secondWhen, carId: '', carWhen: { kind: 'same' } },
  ];
  if (car === 'same') {
    const first = resolveSide(historical, sides[0]);
    if (first.error) return { error: first.error };
    const shared = { carId: first.constructorId, carWhen: { kind: 'date', date: first.car.to } };
    sides = sides.map((side) => ({ ...side, ...shared }));
  }
  const result = scenarioForecast(historical, sides[0], sides[1], { L });
  if (result.error) return { error: result.error };
  return {
    ...summary(result, L),
    dates: [result.a.driver.to, result.b.driver.to],
    car: car === 'same' ? result.a.car.name : null,
  };
}

/** The next race, for two drivers of the current grid in their own cars; null if either is not on it. */
export function nextRaceForecast(filtered, [firstId, secondId], { L = RACE_LAPS, gridA, gridB } = {}) {
  const grid = new Set(filtered.snaps.at(-1).drivers.map((row) => String(row.driverId)));
  if (!grid.has(String(firstId)) || !grid.has(String(secondId))) return null;
  const result = forecastRace(filtered, String(firstId), String(secondId), { L, ...(gridA && gridB ? { gridA, gridB } : {}) });
  return result && { ...summary(result, L), grid: result.forecastMode === 'grid' ? [gridA, gridB] : null, date: result.date };
}

/**
 * Every forecast a page of two drivers shows at first, without a script: at their best (the peak of each, as the page counts it), at their latest,
 * each in the same car and in their own, and the next race.
 * @param {{historical: object, filtered: object}} models the historical ratings and the current ones, each with its histories (withHistories)
 * @param {{id: string, best: string}[]} drivers the two drivers, with the date of the best rating of each
 */
export function headToHeadForecasts({ historical, filtered }, drivers) {
  const ids = drivers.map((driver) => String(driver.id));
  const best = drivers.map((driver) => ({ kind: 'date', date: driver.best }));
  const latest = [{ kind: 'latest' }, { kind: 'latest' }];
  return {
    best: { same: momentForecast(historical, ids, best, 'same'), own: momentForecast(historical, ids, best, 'own') },
    latest: { same: momentForecast(historical, ids, latest, 'same'), own: momentForecast(historical, ids, latest, 'own') },
    next: nextRaceForecast(filtered, ids),
  };
}
