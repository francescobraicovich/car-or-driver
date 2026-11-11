import { runPublishedRatings } from '../../packages/core/src/state-space/build.js';
import { MODEL_SETTINGS } from '../../packages/core/src/presets/model-settings.js';
import { strictItems, strictStayers } from '../../packages/research/node/mover-strict.mjs';
import { chronologicalValidation } from '../../packages/eval/src/chronological-validation.js';
import { graphCarRatings, graphHistory, graphWithPublishedCars, midpointCarRatings } from './model.mjs';

/** Adapt the exact published pipeline to the evaluation harness. */
export function publishedRatings(weekends, ctx) {
  const ratings = runPublishedRatings(weekends, ctx.tmBoost);
  return Object.fromEntries(
    ['race', 'qual'].map((session) => {
      const raw = ratings[session],
        k = Math.LN10 / raw.hyper.s;
      return [
        session,
        {
          session,
          k,
          pre: raw.pre,
          post: raw.ratings,
          z: raw.predictions.map((prediction) => {
            const plain = Float64Array.from(prediction.mean, (value) => k * value);
            return {
              plain,
              vari: prediction.vari,
              adj: Float64Array.from(plain, (value, index) => value / Math.sqrt(1 + (Math.PI / 8) * k * k * prediction.vari[index])),
            };
          }),
        },
      ];
    }),
  );
}

export function experimentRuns(timeline, weekends, ctx) {
  if (timeline.length !== weekends.length) throw Error('Timeline and weekend lengths differ');
  const graph = graphHistory(weekends);
  const published = publishedRatings(weekends, ctx);
  return {
    published,
    graphPublishedCars: graphWithPublishedCars(timeline, published, graph),
    graphNewCars: graphCarRatings(timeline, ctx, graph),
    midpointNewCars: midpointCarRatings(timeline, ctx, graph, published),
  };
}

/** Match the combined rating displayed by the site. */
export function combinedRatings(runs) {
  const weight = MODEL_SETTINGS.qualOn ? MODEL_SETTINGS.qualWeight : 0;
  return {
    session: 'combined',
    k: runs.race.k,
    performanceSession: 'race',
    pre: runs.race.pre.map((snapshot, index) => {
      const rated = new Map(
        [...snapshot.rated].map(([id, value]) => [id, (1 - weight) * value + weight * (runs.qual.pre[index].rated.get(id) ?? value)]),
      );
      return { rated, drivers: rated };
    }),
    post: runs.race.post.map((snapshot, index) =>
      Object.fromEntries(
        ['drivers', 'cars'].map((kind) => [
          kind,
          new Map(
            [...snapshot[kind]].map(([id, value]) => {
              const qual = runs.qual.post[index][kind].get(id);
              return [id, { ...value, m: qual && qual.seen !== false ? (1 - weight) * value.m + weight * qual.m : value.m }];
            }),
          ),
        ]),
      ),
    ),
  };
}

export function validateRatings(idx, runs, moves) {
  const movers = Object.fromEntries(
    ['race', 'qual'].map((session) => [
      session,
      Object.fromEntries(
        [5, 10].map((horizon) => [
          horizon,
          {
            items: strictItems(idx, runs[session], moves, horizon),
            stayers: strictStayers(idx, runs[session], horizon),
          },
        ]),
      ),
    ]),
  );
  return {
    validation: chronologicalValidation(idx, runs, movers),
    monitoring: chronologicalValidation(idx, runs, movers, [{ from: 2026, to: 2026 }], { allowUnavailable: true }),
    omissions: Object.fromEntries(
      Object.entries(movers).map(([session, horizons]) => [
        session,
        Object.fromEntries(Object.entries(horizons).map(([horizon, rows]) => [horizon, rows.items.omitted])),
      ]),
    ),
  };
}
