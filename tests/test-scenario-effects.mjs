import assert from 'node:assert/strict';
import { scenarioEffects } from '../packages/core/src/state-space/scenario-effects.js';

const weekend = (year, circuit, outcome) => ({
  year,
  info: { circuitId: circuit },
  raceObs: [{ x: 'a', y: 'b', cx: 'team', cy: 'team', o: outcome, w: 1, same: true }],
});
const weekends = [weekend(2020, 'circuit', 1), weekend(2020, 'circuit', 1), weekend(2021, 'circuit', 0)];
const race = {
  pre: weekends.map(() => ({
    rated: new Map([
      ['a', 0],
      ['b', 0],
    ]),
    cars: new Map([['team', 0]]),
  })),
};
const snapshots = weekends.map(() => ({ diag: { wet: true } }));
const forecasts = [];
const effects = scenarioEffects(weekends, race, snapshots, { observe: ({ circuitGap, wetGap }) => forecasts.push({ circuitGap, wetGap }) });
assert.equal(forecasts[0].circuitGap, 0, 'the first observation cannot affect its own forecast');
assert.ok(forecasts[1].circuitGap > 0, 'a positive residual raises the next circuit forecast');
assert.equal(forecasts[0].wetGap, 0);
assert.equal(forecasts[1].wetGap, 0, 'driver-specific wet effects are inactive by default');
assert.ok(effects.affFinal.get('a').get('circuit') > 0);
const prefix = [];
scenarioEffects(weekends.slice(0, 2), { pre: race.pre.slice(0, 2) }, snapshots.slice(0, 2), {
  observe: ({ circuitGap, wetGap }) => prefix.push({ circuitGap, wetGap }),
});
assert.deepEqual(prefix, forecasts.slice(0, 2), 'future weekends cannot alter earlier forecasts');
const wetForecasts = [];
scenarioEffects(weekends, race, snapshots, { wetRate: 4, observe: ({ wetGap }) => wetForecasts.push(wetGap) });
assert.equal(wetForecasts[0], 0);
assert.ok(wetForecasts[1] > 0, 'the research wet effect learns only after a wet weekend');
console.log('PASS scenario effects: chronological circuit learning, wet control, and prefix invariance');
