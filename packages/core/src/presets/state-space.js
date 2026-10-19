// Settings of the joint state-space ratings. See docs/state-space.md for how they were chosen.
//
// Chosen on data through 2011 at most (the race settings of the cross-session link: through 2011, with 2012-2015 as a gate; see
// docs/detach.md and research/eval/ACCEPTANCE-detach.md). The 2016+ window was read once for the link, after every setting here was fixed.
// Qualifying is an independent filter. The race filter reads the qualifying filter's driver and car levels (`link`, state-space/qualifying-link.js).
//
//   race:  fitted on 2002-2007 (all-pairs loss), then the new-stint settings on 2002-2011. `varInfl`, added by the hill climb
//          (docs/history/state-space-hill-climbing-1.md), only scales the reported error bars: the other settings are as they were before it.
//   qual:  the same procedure, plus the rookie debut adjustment (fitted on 2002-2011 by state-space-rookies.mjs).
export const STATE_SPACE = {
  // cross-session link (state-space/qualifying-link.js): the race filter's driver strength is beta * (qualifying driver level) + its own residual level, a car's is
  // gamma * (qualifying car level) + its own. beta = 0 and gamma = 0 is the independent race filter of before.
  link: { beta: 0.4, gamma: 0.3 },
  // arrival adaptation (state-space/qualifying-link.js `arrivalOffsets`): a known offset of -dip * rho^n points in a driver's n-th weekend at a new team (established drivers). OFF (dip 0):
  // it passes the gates of research/eval/ACCEPTANCE-detach.md Amendment 8 and removes most of the first-weekend shortfall of movers, but it is a prior keyed to a team
  // change, so adopting it is a project decision (docs/metrics.md). Reference setting: dip 20, rho 0.5.
  adapt: { dip: 0, rho: 0.5, minPrior: 10, span: 12 },
  race: {
    sdD: 20,
    sdNew: 9.103322712790167,
    sdC: 26.923076923076923,
    rho: 0.7999999999999999,
    winterC: 8.753194916144391,
    raceC: 0.9103322712790167,
    yearD: 3.846153846153846,
    raceD: 0,
    tau: 0.038461538461538464,
    thetaT: 2.7439999999999993,
    mPace: 25.62890625,
    mPart: 38.443359375,
    s: 75,
    iters: 3,
    sdJ: 5,
    sdA: 12,
    rhoA: 0.97, // persistent driver-team term: reset at a team change, so a driver's portable level D never carries the old team's fit (docs/detach.md)
    // the posted rating is the portable level D (+ the qualifying offset): the team-fit term A is internal to the filter, so a team change moves nobody's displayed rating
    rateA: false,
    shrinkM: 1,
    // the variance the filter reports is multiplied by this: the likelihood is tempered (`tau`) because the pairs of a weekend are dependent,
    // which leaves the posterior covariance too small. The 6-race revision of a driver's rating, in units of its own sd, has a mean square of
    // 7.88 on 2002-2007; this puts it at 1 (bars of 90% coverage). Reported uncertainty only: no mean, no forecast and no fitted multiplier changes.
    varInfl: 8.55,
    // a rookie's temporary debut adjustment: off for race. The race start was already near its optimum
    // (it sits about 25 points under the field's average) and a fitted dip did not hold up on 2012-2015.
    dipR: 0,
    sdR: 0,
    rhoR: 0.85,
  },
  qual: {
    sdD: 20,
    sdNew: 33.800000000000004,
    sdC: 59.15,
    rho: 1,
    winterC: 32.5,
    raceC: 5.712200000000002,
    yearD: 8.450000000000001,
    raceD: 0,
    tau: 0.06999999999999999,
    thetaT: 2.7439999999999993,
    mPace: 1,
    mPart: 1,
    s: 75,
    iters: 3,
    sdJ: 30,
    sdA: 0,
    rhoA: 0.8,
    shrinkM: 1,
    // the filter's own error bars: qualifying's already match how much its ratings revise (squared standardised revision 1.04), no scaling
    varInfl: 1,
    // a rookie's temporary debut adjustment, fitted on 2002-2011: new drivers qualify well below where they settle,
    // by about 45 points at their first appearance, and the gap closes by about 15% per weekend
    dipR: 45,
    sdR: 6.5536,
    rhoR: 0.85,
  },
};
