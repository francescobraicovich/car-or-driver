# Open problems

What is not solved, in the order the evidence says it matters. The evidence and the numbers are in [docs/diagnosis.md](docs/diagnosis.md) and [docs/metrics.md](docs/metrics.md); the pre-registered rule for any change is [research/eval/ACCEPTANCE-detach.md](research/eval/ACCEPTANCE-detach.md).

1. **Drivers in a new car are still forecast worse than drivers who stayed**, more so since 2012 (the gap to the stayers' loss is three to six times larger in 2012–2015 than in 2002–2011). Estimate the variance of the persistent driver–car fit from the data (marginal likelihood) instead of searching for it; the simulator that matches the late eras needs a fit about twice the size the filter assumes.
2. **Make the uncertainty informative about transferability.** The likelihood is tempered so uniformly that a mover's rating has almost the same error bar as a stayer's. A within-weekend dependence model (shared noise) in place of the global weight `tau` would let the variance follow how much cross-car information a rating rests on.
3. **Do not treat the race-specific part of a rating as portable across cars.** In 2012 onward it carries no information in duels between movers.
4. **Decide on the arrival-adaptation prior** (`STATE_SPACE.adapt`, off): movers lose about 16 percentage points against their rating in the first weekend, and the model does not anticipate it. It passes the gates but is keyed to a team change.
5. **Make Simulator v2 realistic** on the three things it lacks: a driver–car fit near 15 points, an early-weekend penalty, and a race/qualifying relation that gives the late-era pattern. Always simulate both sessions (`simulation-both.mjs`).
6. **Two guards are at their limits** (efficiency of cars, drivers' ratings following their car through a winter in which a driver joins): any change must make room there first.

7. **Elo benchmark, in-progress season.** `seasonSize` (`weekends.js`) counts the races *with results* in a season, so the Elo core's early-season learning-rate schedule for the current season changes when races are added (the Elo values of 2026 moved by up to about 1 point when rounds 15–17 arrived; every complete season is unaffected, and so are the state-space ratings, which were verified identical for all earlier weekends). Use the length of the published calendar (all rows of `races.csv` for the year) instead, then refresh the goldens and `research/final-results.json`.

Housekeeping: `tests/golden.json` was regenerated with rounded hashes; if CI disagrees, run `node tests/golden.mjs --update` on Linux with Node 24 and commit the result.
