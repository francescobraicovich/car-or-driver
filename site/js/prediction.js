import { prepareUnifiedForecast } from '../../packages/core/src/unified/forecast.js';

// The expected position is one plus the expected number of opponents finishing ahead.
export function predictGrid(model, { date, laps, positions = [] } = {}) {
  const drivers = model.snaps.at(-1).drivers;
  const values = positions.map((value) => (value === '' || value == null ? null : Number(value)));
  const hasGrid = values.some((value) => value != null);
  if (
    hasGrid &&
    (values.length !== drivers.length || values.some((value) => !Number.isInteger(value) || value < 1 || value > drivers.length))
  )
    throw Error(`Enter a starting position from 1 to ${drivers.length} for every driver, or leave all positions blank.`);
  if (hasGrid && new Set(values).size !== drivers.length) throw Error('Starting positions must be unique.');
  const forecast = prepareUnifiedForecast(model, { date });
  const rows = drivers.map((driver) => ({ driver, expectedPosition: 1 }));
  for (let first = 0; first < drivers.length; first++) {
    for (let second = first + 1; second < drivers.length; second++) {
      const result = forecast(drivers[first].driverId, drivers[second].driverId, {
        L: laps,
        ...(hasGrid ? { gridA: values[first], gridB: values[second] } : {}),
      });
      if (!result) throw Error('A driver is missing from the forecast.');
      rows[first].expectedPosition += 1 - result.p;
      rows[second].expectedPosition += result.p;
    }
  }
  return rows.sort((a, b) => a.expectedPosition - b.expectedPosition || a.driver.name.localeCompare(b.driver.name));
}
