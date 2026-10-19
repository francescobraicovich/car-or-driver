// The evaluation harness: one entry point per question.
//
//   structuralMetrics(idx, run, ...)   the properties of the ratings (movers, new teammates, car shocks, rookies, health)
//                                      of one session of one model: pure functions of a timeline and a rating run
//   evaluateModel(...)                 predictive scores plus the structural metrics of every session
//   syntheticStudy(...)                the same structural metrics on worlds with known truth (the null), plus recovery
//
// A "rating run" is the common shape every model adapts to (adapters.js), so a new model gets every metric by
// producing one.
import { indexTimeline, findMoves, findRookies, findTeamChanges } from './events.js';
import { moverMetrics } from './movers.js';
import { teammateMetrics } from './teammates.js';
import { shockMetrics } from './shocks.js';
import { diagnosticMetrics } from './diagnostics.js';
import { rookieMetrics } from './rookies.js';
import { fitSlope, observationRows, predictiveMetrics, linkDistances } from './predictive.js';
import { stateSpaceRun } from './adapters.js';
import { syntheticWorld, truthMetrics, worldFromHyper } from './synthetic.js';
import { worldParamsV2 } from './synthetic-v2.js';
import { STATE_SPACE_DEFAULTS } from '../../core/src/state-space/filter.js';
import { STATE_SPACE } from '../../core/src/presets/state-space.js';
import { mean, nll, sd } from './stats.js';
import { WINDOWS } from './timeline.js';

export * from './timeline.js';
export * from './adapters.js';
export * from './events.js';
export * from './stats.js';
export { moverDuels, stayerDuels } from './movers.js';
export { predictiveMetrics, linkDistances, observationRows, fitSlope, reliability } from './predictive.js';
export { syntheticWorld, truthMetrics, worldFromHyper, toyTimeline, WORLD_DEFAULTS } from './synthetic.js';
export { syntheticWorldV2, worldParamsV2, WORLD_V2_DEFAULTS } from './synthetic-v2.js';
export { STATE_SPACE_DEFAULTS } from '../../core/src/state-space/filter.js';

/** Moves, lineup changes and rookies of a timeline (exogenous: they depend only on who raced where). */
export function catalogue(idx, opts = {}) {
  const moves = findMoves(idx, opts);
  return { moves, changes: findTeamChanges(idx, moves, opts), rookies: findRookies(idx) };
}

/** Wrap a plain number into the { est } shape of the interval estimates. */
const asEst = (v) => (v && typeof v === 'object' ? v : { est: v });

/**
 * The structural metrics of one session of one model.
 * @param {object} idx
 * @param {object} run
 * @param {{ moves, changes, rookies }} events
 * @param {{ calib?: number, boot?: object }} [o]
 */
export function structuralMetrics(idx, run, events, { calib = 1, boot = {} } = {}) {
  const movers = moverMetrics(idx, run, events.moves, { calib, boot });
  const teammates = teammateMetrics(idx, run, events.changes, { boot });
  const shocks = shockMetrics(idx, run, { boot });
  const health = diagnosticMetrics(idx, run, { moves: events.moves, rookies: events.rookies, boot });
  const rookies = rookieMetrics(idx, run, events.rookies, { calib, boot });
  const headline = {};
  for (const m of [movers, teammates, shocks, health, rookies]) for (const [k, v] of Object.entries(m.headline)) headline[k] = asEst(v);
  return { movers, teammates, shocks, health, rookies, headline };
}

/**
 * Predictive scores and structural metrics of a model.
 * @param {object[]} timeline
 * @param {{ canon, carOf }} identity
 * @param {{ race?: object, qual?: object }} runs
 * @param {{ boot?: object, windows?: object[], fitWindow?: object }} [opts]
 */
export function evaluateModel(timeline, identity, runs, { boot = {}, windows = WINDOWS, fitWindow = WINDOWS[0] } = {}) {
  const idx = indexTimeline(timeline, identity);
  const events = catalogue(idx);
  const distance = linkDistances(idx);
  const predictive = predictiveMetrics(idx, runs, { windows, fitWindow, distance });
  const sessions = {};
  const headline = {};
  for (const [k, v] of Object.entries(predictive.headline)) headline[k] = asEst(v);
  for (const s of Object.keys(runs)) {
    if (!runs[s]) continue;
    sessions[s] = structuralMetrics(idx, runs[s], events, { calib: predictive.slopes[s], boot });
    Object.assign(headline, sessions[s].headline);
  }
  const { rowsBy: _rows, ...predictiveOut } = predictive;
  return {
    counts: {
      weekends: timeline.length,
      moves: events.moves.filter((m) => m.valid).length,
      lineupChanges: events.changes.filter((c) => c.valid).length,
      rookies: events.rookies.length,
    },
    predictive: predictiveOut,
    sessions,
    headline,
  };
}

/** Weighted log-loss of a run's own forecasts after one multiplier (the project's tuning criterion). */
function forecastLoss(idx, run) {
  const rows = observationRows(idx, run);
  const c = fitSlope(rows);
  let s = 0;
  let w = 0;
  for (const r of rows) {
    s += r.w * nll(c * r.z, r.o);
    w += r.w;
  }
  return w ? s / w : NaN;
}

/** Likelihood weights tried when the filter is tuned to a synthetic world (the shipped value is for the real data's dependence). */
export const TAU_GRID = [0.001, 0.003, 0.01, 0.03, 0.1];

/**
 * The likelihood weight `tau` that makes the filter under test forecast a synthetic world best. The observations of a
 * synthetic weekend all derive from one ranking, so how strongly pairs depend on each other differs from the real data,
 * where the shipped `tau` was fitted; on a world with known answers a filter can be tuned to that world, as the project did
 * for its earlier synthetic recovery tests (docs/state-space.md).
 */
export function tuneTau(timeline, ctx, { session = 'race', hyper = {}, worldParams, seed = 9001, grid = TAU_GRID } = {}) {
  const idx0 = indexTimeline(timeline, ctx);
  const w = syntheticWorld(timeline, idx0, session, worldParams, seed);
  const idx = indexTimeline(w.timeline, ctx);
  const losses = grid.map((tau) => forecastLoss(idx, stateSpaceRun(w.timeline, session, ctx, { ...hyper, tau }, 'tune')));
  const best = losses.reduce((b, v, i) => (v < losses[b] ? i : b), 0);
  return { tau: grid[best], grid, losses };
}

/**
 * Worlds with known answers on the real schedule: the structural metrics of the filter under test on a world whose
 * assumptions hold (the null for each real-data number) and the recovery of the truth.
 *
 * The reference world is drawn from the SHIPPED settings by default (`worldHyper` overrides them; `self: true` draws it from the
 * filter's own settings instead). A candidate must be judged on a world it did not choose: a filter with rigid cars and
 * drifting drivers run on a world with rigid cars and drifting drivers would certify itself.
 *
 * @param {object[]} timeline  the real timeline
 * @param {{ canon, carOf, tmBoost }} ctx   filter context (identity plus the exam's teammate boost)
 * @param {{ session, hyper, worldHyper, self, seeds, world, tau, boot }} o
 *   hyper   overrides of the shipped settings: the filter under test (an explicit `tau` here is honoured)
 *   world   overrides of the world itself (a stress world has regMult > 1, noise 't3', moveSd 10, ...)
 *   tau     'auto': tune the filter's `tau` to the world (an ideally tuned filter); 'shipped': keep the filter as evaluated on
 *           the real data; or a number
 */
export function syntheticStudy(
  timeline,
  ctx,
  { session = 'race', hyper = {}, worldHyper = {}, self = false, seeds = [1, 2, 3], world = {}, tau = 'auto', boot = { B: 60 } } = {},
) {
  const idx0 = indexTimeline(timeline, ctx);
  const h = { ...STATE_SPACE_DEFAULTS, ...STATE_SPACE[session], ...hyper };
  // a v2 world has its own fixed dynamics for both sessions (race and qualifying share their latent world); `self` draws the session under
  // test from its own settings instead
  const worldParams =
    world.version === 2
      ? worldParamsV2(worldFromHyper, self ? { [session]: h } : {}, world)
      : { ...worldFromHyper(self ? h : { ...STATE_SPACE_DEFAULTS, ...STATE_SPACE[session], ...worldHyper }), ...world };
  const explicit = Number.isFinite(hyper.tau);
  const mode = explicit ? 'explicit' : tau === 'auto' ? 'auto' : tau === 'shipped' ? 'shipped' : 'number';
  const tuning = mode === 'auto' ? tuneTau(timeline, ctx, { session, hyper, worldParams }) : null;
  const runHyper = mode === 'auto' ? { ...hyper, tau: tuning.tau } : mode === 'number' ? { ...hyper, tau } : hyper;
  const replicates = [];
  for (const seed of seeds) {
    const w = syntheticWorld(timeline, idx0, session, worldParams, seed);
    const idx = indexTimeline(w.timeline, ctx);
    const events = catalogue(idx);
    const run = stateSpaceRun(w.timeline, session, ctx, runHyper, 'synthetic');
    const fitRows = observationRows(idx, run).filter((r) => r.year >= WINDOWS[0].from && r.year <= WINDOWS[0].to);
    const calib = fitSlope(fitRows);
    const structural = structuralMetrics(idx, run, events, { calib: Number.isFinite(calib) ? calib : 1, boot });
    const truth = truthMetrics(idx, run, w, { boot, moves: events.moves });
    replicates.push({
      seed,
      calib,
      headline: { ...structural.headline, ...Object.fromEntries(Object.entries(truth.headline).map(([k, v]) => [k, asEst(v)])) },
      truth,
    });
  }
  // null summary: mean and spread across worlds of every headline estimate
  const keys = new Set(replicates.flatMap((r) => Object.keys(r.headline)));
  const summary = {};
  for (const k of keys) {
    const v = replicates.map((r) => r.headline[k]?.est).filter(Number.isFinite);
    if (v.length) summary[k] = { mean: mean(v), sd: v.length > 1 ? sd(v) : NaN, n: v.length };
  }
  return { session, seeds, world: worldParams, tau: runHyper.tau ?? h.tau, tauMode: mode, tuning, replicates, summary };
}
