// Experimental graph-only driver ratings and independently filtered car ratings.
import { teammateGraphExam } from '../../packages/core/src/teammate-graph-exam.js';
import { stateSpaceRun } from '../../packages/eval/src/adapters.js';

// All car settings and observation weights are inherited from production. The
// joint filter's driver states are disabled: the graph is the sole driver input.
const DRIVER_DISABLED = Object.freeze({
  sdD: 0,
  sdNew: 0,
  yearD: 0,
  raceD: 0,
  sdA: 0,
  sdR: 0,
  sdRel: 0,
  muNew: 0,
  muRel: 0,
  dipR: 0,
  relStart: 0,
  sdJ: 0,
  shrinkM: 1,
  mMover: 1,
  mRookieCross: 1,
  rateA: false,
});

const centered = (values) => {
  const mean = [...values.values()].reduce((sum, value) => sum + value, 0) / (values.size || 1);
  return new Map([...values].map(([id, value]) => [id, value - mean]));
};

/** Graph history computed before and after each weekend from teammate evidence. */
export const graphHistory = (weekends) => teammateGraphExam(weekends, { halfLifeYears: 3 });

/**
 * Each car update uses the graph snapshot from before that weekend, so the
 * weekend's teammate results are not first learned by the graph and then
 * reused as if the resulting driver ratings were independent car evidence.
 * Published snapshots use the graph after the weekend. Forecasts are point
 * predictions: graph uncertainty is not supplied by this experiment.
 */
export function graphCarRatings(timeline, ctx, graph) {
  if (graph.length !== timeline.length) throw Error('Graph and timeline lengths differ');
  return Object.fromEntries(['race', 'qual'].map((session) => [session, conditionalCarSession(timeline, ctx, graph, session)]));
}

/** A fixed midpoint of published portable driver levels and graph levels. */
export function midpointCarRatings(timeline, ctx, graph, published) {
  if (graph.length !== timeline.length) throw Error('Graph and timeline lengths differ');
  return Object.fromEntries(
    ['race', 'qual'].map((session) => {
      const source = published[session];
      if (source.pre.length !== timeline.length || source.post.length !== timeline.length)
        throw Error('Published and timeline lengths differ');
      const history = graph.map((snapshot, index) => ({
        pre: {
          levels: centered(
            new Map([...source.pre[index].rated].map(([id, value]) => [id, 0.5 * value + 0.5 * (snapshot.pre.levels.get(id) ?? 0)])),
          ),
        },
        post: {
          levels: centered(
            new Map(
              [...source.post[index].drivers].map(([id, value]) => {
                const graphLevel = snapshot.post.levels.get(id);
                if (!Number.isFinite(graphLevel)) throw Error(`Missing graph level for ${id} at weekend ${index}`);
                return [id, 0.5 * value.m + 0.5 * graphLevel];
              }),
            ),
          ),
        },
      }));
      return [session, conditionalCarSession(timeline, ctx, history, session)];
    }),
  );
}

function conditionalCarSession(timeline, ctx, graph, session) {
  const offsets = graph.map((weekend) => weekend.pre.levels);
  const carRun = stateSpaceRun(timeline, session, { ...ctx, offsets, offsetsPost: offsets }, DRIVER_DISABLED, 'graph-car');
  const pre = carRun.pre.map((snapshot, i) => {
    const drivers = centered(new Map([...snapshot.rated.keys()].map((id) => [id, graph[i].pre.levels.get(id) ?? 0])));
    return { ...snapshot, drivers, rated: drivers };
  });
  const post = carRun.post.map((snapshot, i) => {
    const drivers = centered(
      new Map(
        [...snapshot.drivers.keys()].map((id) => {
          const value = graph[i].post.levels.get(id);
          if (!Number.isFinite(value)) throw Error(`Missing graph level for ${id} at weekend ${i}`);
          return [id, value];
        }),
      ),
    );
    return {
      ...snapshot,
      drivers: new Map(
        [...snapshot.drivers].map(([id, rating]) => [
          id,
          {
            ...rating,
            m: drivers.get(id),
            sd: null,
            seen: true,
          },
        ]),
      ),
    };
  });
  return { ...carRun, pre, post, z: carRun.z.map((z) => ({ ...z, adj: z.plain })) };
}

/** Previous exploratory control: graph drivers with cars from the published model. */
export function graphWithPublishedCars(timeline, published, graph) {
  if (graph.length !== timeline.length) throw Error('Graph and timeline lengths differ');
  return Object.fromEntries(
    ['race', 'qual'].map((session) => {
      const base = published[session];
      const pre = base.pre.map((snapshot, i) => {
        const drivers = centered(new Map([...snapshot.rated.keys()].map((id) => [id, graph[i].pre.levels.get(id) ?? 0])));
        return { ...snapshot, drivers, rated: drivers };
      });
      const post = base.post.map((snapshot, i) => {
        const drivers = centered(
          new Map(
            [...snapshot.drivers.keys()].map((id) => {
              const value = graph[i].post.levels.get(id);
              if (!Number.isFinite(value)) throw Error(`Missing graph level for ${id} at weekend ${i}`);
              return [id, value];
            }),
          ),
        );
        return {
          ...snapshot,
          drivers: new Map(
            [...snapshot.drivers].map(([id, rating]) => [
              id,
              {
                ...rating,
                m: drivers.get(id),
                sd: null,
                seen: true,
              },
            ]),
          ),
        };
      });
      const z = timeline.map((weekend, i) => {
        const snapshot = pre[i];
        const plain = Float64Array.from(weekend.obs[session], (observation) => {
          const values = [
            snapshot.drivers.get(observation.x),
            snapshot.drivers.get(observation.y),
            snapshot.cars.get(observation.cx),
            snapshot.cars.get(observation.cy),
          ];
          if (!values.every(Number.isFinite)) throw Error(`Missing pre-weekend level at ${i}`);
          return base.k * (values[0] - values[1] + values[2] - values[3]);
        });
        return { plain, adj: plain, vari: null };
      });
      return [session, { ...base, pre, post, z }];
    }),
  );
}
