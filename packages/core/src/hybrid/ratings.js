// Complete driver/car ratings from the two state-space filters and the online
// comparison learner. Every blend is made before the weekend it forecasts.
import { HYBRID } from '../presets/hybrid.js';
import { rankingRatings } from './ranking.js';

const meanOf = (snapshot, kind, id) => snapshot[kind].get(id)?.m;
const center = (values) => {
  const mean = [...values.values()].reduce((sum, value) => sum + value, 0) / values.size;
  return new Map([...values].map(([id, value]) => [id, value - mean]));
};
const centerRatings = (values) => {
  const mean = [...values.values()].reduce((sum, value) => sum + value.m, 0) / values.size;
  return new Map([...values].map(([id, value]) => [id, { ...value, m: value.m - mean }]));
};

export function hybridRatings(weekends, snapshots, race, qualifying, carOf) {
  const ranking = rankingRatings(
    weekends,
    carOf,
    snapshots.map((snapshot) => !!snapshot.diag.wet),
  );
  const pre = [];
  const ratings = [];
  const predictions = [];
  for (const [index, weekend] of weekends.entries()) {
    const old = race.pre[index];
    const other = qualifying.pre[index];
    const ranked = ranking.pre[index];
    const driverDelta = (id) => {
      const base = old.rated.get(id);
      const first = base + HYBRID.qualifyingDriverShare * ((other.rated.get(id) ?? base) - base);
      return first + HYBRID.rankingDriverShare * ((ranked.rated.get(id) ?? first) - first) - base;
    };
    const carDelta = (id) => HYBRID.qualifyingCarShare * ((other.cars.get(id) ?? old.cars.get(id)) - old.cars.get(id));
    const preRated = center(new Map([...old.rated].map(([id, value]) => [id, value + driverDelta(id)])));
    const preDrivers = center(new Map([...old.drivers].map(([id, value]) => [id, value + driverDelta(id)])));
    const preCars = center(new Map([...old.cars].map(([id, value]) => [id, value + carDelta(id)])));
    pre.push({
      ...old,
      rated: preRated,
      drivers: preDrivers,
      cars: preCars,
    });
    const oldPost = race.ratings[index];
    const qualPost = qualifying.ratings[index];
    const rankedPost = ranking.post[index];
    const postDriverDelta = (id) => {
      const base = meanOf(oldPost, 'drivers', id);
      const first = base + HYBRID.qualifyingDriverShare * ((meanOf(qualPost, 'drivers', id) ?? base) - base);
      return first + HYBRID.rankingDriverShare * ((meanOf(rankedPost, 'drivers', id) ?? first) - first) - base;
    };
    const postCarDelta = (id) => {
      const base = meanOf(oldPost, 'cars', id);
      return HYBRID.qualifyingCarShare * ((meanOf(qualPost, 'cars', id) ?? base) - base);
    };
    ratings.push({
      drivers: centerRatings(new Map([...oldPost.drivers].map(([id, value]) => [id, { ...value, m: value.m + postDriverDelta(id) }]))),
      cars: centerRatings(new Map([...oldPost.cars].map(([id, value]) => [id, { ...value, m: value.m + postCarDelta(id) }]))),
    });
    const original = race.predictions[index];
    const mean = Float64Array.from(original.mean, (value, observationIndex) => {
      const observation = weekend.raceObs[observationIndex];
      return value + driverDelta(observation.x) - driverDelta(observation.y) + carDelta(observation.cx) - carDelta(observation.cy);
    });
    predictions.push({ ...original, mean });
  }
  const latest = race.latest
    ? {
        ...race.latest,
        mean: Float64Array.from(race.latest.mean, (value, position) => {
          const driverCount = race.latest.driverIds.length;
          const id = position < driverCount ? race.latest.driverIds[position] : race.latest.carIds[position - driverCount];
          const kind = position < driverCount ? 'drivers' : 'cars';
          const prior = meanOf(race.ratings.at(-1), kind, id);
          const updated = meanOf(ratings.at(-1), kind, id);
          return value + (Number.isFinite(updated) && Number.isFinite(prior) ? updated - prior : 0);
        }),
      }
    : null;
  return { ...race, pre, ratings, predictions, latest, ranking };
}
