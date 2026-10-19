// The exam: which pairwise observations exist and how much each one counts. Both rating systems are scored on it, and the
// state-space filters read it. It does not depend on a rating.
//
// These weights decide which observations exist and how much each one counts, so they
// are frozen during every parameter search: a candidate must win by predicting
// better, never by making the test easier. packages/research/node/verify-exam-invariance.mjs
// enforces that by hashing the whole observation stream.
//
// Teammate pairs are weighted 8 deliberately: they are the hardest subset (loss ~0.52
// against ~0.28 for different-car pairs) and this benchmark chooses to weight them heavily.
import { MODEL_SETTINGS } from './presets/model-settings.js';

export const ELO_EXAM = {
  alpha: MODEL_SETTINGS.alpha,
  cap: MODEL_SETTINGS.cap,
  tmBoost: MODEL_SETTINGS.tmBoost,
  qTmBoost: MODEL_SETTINGS.qTmBoost,
  orderW: MODEL_SETTINGS.orderW,
  paceW: MODEL_SETTINGS.paceW,
  partialExp: MODEL_SETTINGS.partialExp,
  qualOn: MODEL_SETTINGS.qualOn,
};

/** Keys a search must never change. */
export const EXAM_KEYS = Object.keys(ELO_EXAM);

/** Weight of a gap of `g` places: grows with the logarithm of the gap, capped. */
const margin = (g, { alpha, cap }) => Math.min(cap, 1 + alpha * Math.log2(Math.max(1, g)));

/**
 * How much a qualifying observation counts. `gw` is the weight of the gap (by the time gap when the two set times in the
 * same session, by the places otherwise); `wd` is what it scores, with the teammate boost.
 */
export function qualWeight(ob, S) {
  const gw = ob.dt != null ? Math.min(S.cap, 1 + S.alpha * Math.log2(1 + ob.dt / 0.25)) : margin(ob.gap, S);
  return { gw, wd: gw * (ob.x.constructorId === ob.y.constructorId ? S.qTmBoost : 1) };
}

/** The same for a race observation (the gap is in seconds of pace when there is one; `ob.base` is the weight of its source). */
export function raceWeight(ob, S) {
  const gw = (ob.gapSec != null ? Math.min(S.cap, 1 + S.alpha * Math.log2(1 + ob.gapSec / 0.3)) : margin(ob.gap, S)) * ob.base;
  return { gw, wd: gw * (ob.x.constructorId === ob.y.constructorId ? S.tmBoost : 1) };
}
