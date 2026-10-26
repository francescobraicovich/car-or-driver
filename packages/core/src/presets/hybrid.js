// Fixed research blend selected on the dated pair and frozen-mover exams.
// The ranking learner has no component or team-change adjustment.
export const HYBRID = Object.freeze({
  qualifyingDriverShare: 0.4,
  rankingDriverShare: 0.2,
  qualifyingCarShare: 0.25,
  ranking: Object.freeze({
    learningRate: 180,
    teammateWeight: 2,
    fitPenalty: 0.15,
    levelPenalty: 0.001,
    carWinterRetention: 0.8,
    driverWinterRetention: 0.95,
  }),
});
