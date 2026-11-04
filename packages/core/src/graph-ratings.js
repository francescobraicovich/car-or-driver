// Blend unrounded dated teammate graph levels into both driver ratings. The
// state-space covariance remains an approximation after this mean adjustment.
import { teammateGraphExam } from './teammate-graph-exam.js';
import { GRAPH_RATINGS } from './presets/graph-ratings.js';

const center = (values) => {
  const average = [...values.values()].reduce((sum, value) => sum + value, 0) / (values.size || 1);
  return new Map([...values].map(([id, value]) => [id, value - average]));
};

function graphSession(weekends, base, graph, session) {
  const pre = [];
  const ratings = [];
  const predictions = [];
  for (const [index, weekend] of weekends.entries()) {
    const old = base.pre[index];
    const graphPre = center(new Map([...old.rated.keys()].map((id) => [id, graph[index].pre.levels.get(id) ?? 0])));
    const delta = (id) => GRAPH_RATINGS.share * (graphPre.get(id) - old.rated.get(id));
    pre.push({
      ...old,
      rated: center(new Map([...old.rated].map(([id, value]) => [id, value + delta(id)]))),
      drivers: center(new Map([...old.drivers].map(([id, value]) => [id, value + delta(id)]))),
    });
    const originalPost = base.ratings[index];
    const ids = [...originalPost.drivers.keys()];
    const graphPost = center(
      new Map(
        ids.map((id) => {
          const value = graph[index].post.levels.get(id);
          if (!Number.isFinite(value)) throw Error(`Missing or invalid graph level for ${id} at ${weekend.info.raceId}`);
          return [id, value];
        }),
      ),
    );
    const means = center(
      new Map(
        ids.map((id) => {
          const value = originalPost.drivers.get(id).m;
          return [id, value + GRAPH_RATINGS.share * (graphPost.get(id) - value)];
        }),
      ),
    );
    ratings.push({ ...originalPost, drivers: new Map(ids.map((id) => [id, { ...originalPost.drivers.get(id), m: means.get(id) }])) });
    const original = base.predictions[index];
    const observations = session === 'race' ? weekend.raceObs : weekend.qualObs;
    const mean = Float64Array.from(original.mean, (value, j) => {
      const observation = observations[j];
      return value + delta(observation.x) - delta(observation.y);
    });
    predictions.push({ ...original, mean });
  }
  const latest = base.latest
    ? {
        ...base.latest,
        mean: Float64Array.from(base.latest.mean, (value, position) => {
          const count = base.latest.driverIds.length;
          const kind = position < count ? 'drivers' : 'cars';
          const id = position < count ? base.latest.driverIds[position] : base.latest.carIds[position - count];
          const before = base.ratings.at(-1)[kind].get(id)?.m;
          const after = ratings.at(-1)[kind].get(id)?.m;
          return value + (Number.isFinite(before) && Number.isFinite(after) ? after - before : 0);
        }),
      }
    : null;
  return { ...base, pre, ratings, predictions, latest };
}

export function graphRatings(weekends, race, qual) {
  const graph = teammateGraphExam(weekends, { halfLifeYears: GRAPH_RATINGS.halfLifeYears });
  return { race: graphSession(weekends, race, graph, 'race'), qual: graphSession(weekends, qual, graph, 'qual') };
}
