// Settings of the Elo-style rating core (the benchmark): the settings it shares with the state-space model
// (presets/model-settings.js) and its own learning settings.
//
// Chosen on 2008-2011 walk-forward combined log-loss, with 2012-2015 held out as a pre-registered gate
// (0.342687 -> 0.338212; see research/backbone/protocol-4.json and research/backbone/era-transfer.json).
// packages/research/node/search-backbone.mjs and gate-backbone.mjs rerun that procedure.
//
// The weight-defining parameters (alpha, cap, tmBoost, qTmBoost, orderW, paceW, partialExp, qualOn) are the
// "exam" (packages/core/src/exam.js, values in model-settings.js). They are frozen during every search, so a candidate has to predict
// better rather than make the test easier (packages/research/node/verify-exam-invariance.mjs checks that
// the retuned settings leave the scored observations unchanged).
//
// Teammate pairs are scored at weight 8. tmLearn 0.875 makes a teammate pair teach the driver ratings with
// weight 7, and qTmLearn 0.5 leaves the qualifying learning weight at 4.
import { MODEL_SETTINGS } from './model-settings.js';

export const TUNED_ELO = {
  ...MODEL_SETTINGS,
  gridAdvRefuel: 8,
  kd: 7,
  kc: 40,
  carCarry: 0.8,
  qkd: 29,
  qkc: 40,
  qCarCarry: 0.8,
  circK: 5,
  circCarry: 0.7,
  gridAdv: 6,
  rookieBoost: 2.5,
  rookieN: 25,
  wetK: 4,
  kcEarly: 2.5,
  kcTau: 4,
  regCarry: 1,
  tmLearn: 0.875,
  qTmLearn: 0.5,
};
