// The state-space model's settings besides its filters (presets/state-space.js): the exam it is read on (which observations exist and
// what each one counts), the retirement hazards, the rating scale and the standard race distance of the forecasts.
//
// They were chosen with the Elo benchmark (presets/tuned-elo.js reuses them) on 2008-2011 with 2012-2015 as a pre-registered gate
// (research/backbone/protocol-4.json, era-transfer.json), and are fixed: the exam is never searched (packages/core/src/exam.js).
//
// Teammate pairs are scored at weight 8 (qTmBoost for qualifying): they are the hardest subset.
// homeAdv is 0: the what-if's track term has no home bonus.
export const MODEL_SETTINGS = {
  scale: 75,
  homeAdv: 0,
  hazardW: 0.25,
  orderW: 12,
  paceW: 0.75,
  tmBoost: 8,
  alpha: 0.55,
  cap: 2.75,
  partialExp: 0.8,
  qTmBoost: 8,
  qualWeight: 0.35,
  qualOn: true,
  relHalf: 35,
  relPrior: 100,
  relWinter: 0.95,
  incHalf: 5,
  incPrior: 2000,
  stdLaps: 30,
};
