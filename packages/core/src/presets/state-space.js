import { INFORMATION_FRACTION } from './learning.js';

// Settings of the joint state-space ratings. See docs/state-space.md for how they were chosen.
//
// The original settings were selected through 2011 with later historical gates.
// Rounded on 3 November 2026 under the retrospective chronological comparison
// in research/simplification/protocol.md; later eras are not untouched holdouts.
// Qualifying is an independent filter. The race filter reads the qualifying filter's driver levels (`link`, state-space/qualifying-link.js).
//
//   race:  fitted on 2002-2007 (all-pairs loss), then the new-stint settings on 2002-2011. `varInfl` only scales the reported error bars.
//   qual:  the same procedure, plus the rookie debut adjustment fitted on 2002-2011.
export const STATE_SPACE = {
  // The race driver's strength includes beta times the qualifying driver level.
  link: { beta: 0.4 },
  race: {
    sdD: 20,
    sdNew: 9,
    sdC: 27,
    rho: 0.8,
    winterC: 9,
    raceC: 1,
    yearD: 4,
    raceD: 0,
    tau: 0.04 * INFORMATION_FRACTION,
    thetaT: 2.75,
    mPace: 25,
    mPart: 40,
    s: 75,
    iters: 3,
    sdA: 12,
    rhoA: 0.97, // persistent driver-team term: reset at a team change, so a driver's portable level D never carries the old team's fit (docs/detach.md)
    // the posted rating is the portable level D (+ the qualifying offset): the team-fit term A is internal to the filter, so a team change moves nobody's displayed rating
    rateA: false,
    // the variance the filter reports is multiplied by this: the likelihood is tempered (`tau`) because the pairs of a weekend are dependent,
    // which leaves the posterior covariance too small. The 6-race revision of a driver's rating, in units of its own sd, has a mean square of
    // 7.88 on 2002-2007; this puts it at 1 (bars of 90% coverage). Reported uncertainty only: no mean, no forecast and no fitted multiplier changes.
    varInfl: 8.55,
  },
  qual: {
    sdD: 20,
    sdNew: 34,
    sdC: 60,
    rho: 1,
    winterC: 33,
    raceC: 6,
    yearD: 8.5,
    raceD: 0,
    tau: 0.07 * INFORMATION_FRACTION,
    thetaT: 2.75,
    mPace: 1,
    mPart: 1,
    s: 75,
    iters: 3,
    sdA: 0,
    rhoA: 0.8,
    // the filter's own error bars: qualifying's already match how much its ratings revise (squared standardised revision 1.04), no scaling
    varInfl: 1,
    // a rookie's temporary debut adjustment, fitted on 2002-2011: new drivers qualify well below where they settle,
    // by about 45 points at their first appearance, and the gap closes by about 15% per weekend
    dipR: 45,
    sdR: 6.5,
    rhoR: 0.85,
  },
};
