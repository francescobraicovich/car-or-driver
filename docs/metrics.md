# The metrics we optimise and guard, how we are doing, and the best possible

**Historical scorecard for the former filter-only publication.** The definitions and diagnostics remain useful, but the "Now" values below were computed before the hybrid became the published rating. See [hybrid.md](hybrid.md) for the current ratings-only, frozen-mover and refitted forecast-head scores. The hybrid blend was selected after inspecting the historical periods, so they no longer constitute untouched holdouts.

The historical figures were computed by one suite (`packages/research/node/metric-suite.mjs`, run with `suite.mjs`; every candidate of that phase is in `research/eval/logs/suite-log.jsonl`). Real data through 2015 unless marked (timeline cut at 2015, which shortens the stints of moves in 2015 and moves the 2012–15 window of the movers' rows by up to 0.01 against the full-timeline numbers in [detach.md](detach.md)); 2016+ was a second look. "Before" = the filter before the detachment work (independent race filter, `research/eval/baseline.txt`); "Now" = the former filter-only publication (race filter reads qualifying, posted rating = its portable level, team-fit term internal with `sdA` 12).

Three kinds of "best possible" appear, and they are not the same thing:

- **Ideal**: the value a perfect model would read by definition (1 for a ratio of slopes, 0 for a bias).
- **Oracle** (Simulator v2, both sessions simulated, `simulation-optimum.mjs`): what a forecast that knows the true levels reaches in a world where we know them. It is a floor for that world, not for the real one.
- **Practical reference**: the same quantity for the group we want movers to match (stayers).
  The real irreducible loss is not known; a coin flip scores 0.6931.

## 1. Overall predictive quality (guards: the model must stay a good rating system)

| # | Metric | What it measures | Before | Now | Best possible |
| --- | --- | --- | --- | --- | --- |
| 1 | **Ratings-alone log-loss, all pairs** (weights of the exam; multiplier fitted on 2002–2007) | How well the ratings alone forecast every pair of every weekend, from earlier weekends only. Windows 2002–07 (fit), 2008–11, 2012–15, 2016+ (second look) | 0.3862 / 0.3877 / 0.3656 / 0.4007 | 0.3866 / **0.3846** / **0.3639** / **0.3977** | Real: unknown. Oracle in the simulator: 0.350 (2008–11), 0.357 (2012–15) against our 0.3815 / 0.3829: about 0.03 above the floor. |
| 2 | **Same, teammate pairs** | The pairs where the car cancels: the cleanest test of the driver ratings | 0.6031 / 0.6079 / 0.6329 / 0.6022 | 0.6046 / 0.6075 / **0.6310** / **0.5981** | Oracle 0.541 / 0.576 against ours 0.567 / 0.595. A coin is 0.693. |
| 3 | **Same, pairs from different cars** | Driver plus car together | 0.3120 / 0.3181 / 0.2862 / 0.3311 | 0.3121 / **0.3141** / **0.2846** / **0.3285** | Oracle 0.287 / 0.284 against ours 0.320 / 0.312. |
| 4 | **Calibration slope** (race) | Whether the stated odds are right on average (out of the fit window) | 1.005 | about 1.00–1.01 | **1.00** (limit 0.95–1.05). |
| 5 | **Walk-forward loss** (2008–11) | The same loss with the multiplier refitted every year | 0.3925 | 0.3888 | As row 1. |
| 6 | **Forecast layer** (race-day / Thursday / qualifying head, 2008–11) | The supervised heads built on the ratings, refitted for them (tracked in the table below) | 0.3372 / 0.3820 / 0.3492 | 0.3372 / 0.3817 / 0.3495 | Unknown; a tie is the aim (guard). |

### The forecast heads, tracked on the same metrics

The heads (Thursday: before qualifying; race-day: with the grid; and the qualifying head) are fitted on top of the shipped ratings (`finalize-state-space.py`) and then tracked by `heads-metrics.mjs` (`research/eval/heads-metrics.txt`, `npm run research:heads-metrics`), per observation, on the same windows and on drivers in a new car. Through 2015, race observations:

| Forecast | Loss 2008–11 all / teammates / other cars | Loss 2012–15 all / teammates / other cars | Calibration slope (ECE) | Movers' slope ÷ stayers' (online) | First-weekend residual of movers |
| --- | --- | --- | --- | --- | --- |
| Ratings alone (with the hazard mix) | 0.3913 / 0.6109 / 0.3217 | 0.3655 / 0.6317 / 0.2868 | 1.12 (0.011) | 0.73 | −0.071 |
| Thursday head | 0.3856 / 0.6087 / 0.3149 | 0.3595 / 0.6269 / 0.2804 | **1.02 (0.007)** | **0.85** | −0.070 |
| Race-day head (sees the grid) | 0.3357 / 0.5415 / 0.2705 | 0.3211 / 0.5658 / 0.2488 | 0.96 (0.010) | 0.86 | **−0.024** |

The qualifying head: 0.3563 → 0.3495 (2008–11) and 0.3732 → 0.3622 (2012–15). For movers' duels the online loss is 0.630 (ratings alone), 0.624 (Thursday) and 0.594 (race-day), against 0.615 / 0.614 / 0.564 for stayers. Reading: the Thursday head improves on the ratings alone everywhere, is better calibrated and narrows the gap between movers and stayers a little; the race-day head removes most of the first-weekend shortfall of movers because the grid reveals how a mover's new car performs. The heads are accepted only if race-day, Thursday and qualifying are each within +0.001 of the previous version (`research/state-space/ACCEPTANCE.md`); they were refitted for the shipped ratings and accepted.

## 2. Drivers in a new car, forecast from the rating posted before the move (the objective)

Race, the first 5 and 10 weekends after a move, strict prior rating (`mover-strict.mjs`): nothing at or after the move is used for the mover. Teammate duels against the new teammate (car cancels) and field duels against all other drivers (new car as forecast before that weekend).

| # | Metric | What it measures | Before | Now | Best possible |
| --- | --- | --- | --- | --- | --- |
| 7 | **Frozen teammate-duel loss of movers** (k5 / k10; windows 2002–11, 2012–15, 2016+ second look) | How well the pre-move rating forecasts the mover's duels against his new teammate | 0.711 / 0.662, 0.823 / 0.772 | **0.650 / 0.643, 0.730 / 0.700** (second look 0.644 / 0.678) | Practical: the same forecast for drivers who stayed, **0.617 / 0.630 (2002–11) and 0.619 / 0.617 (2012–15)**. We have closed 65% / 64% of the gap in 2002–11 and 47% / 50% in 2012–15. Oracle for movers in the simulator: 0.56. |
| 8 | **Frozen field-duel loss of movers** | The mover against everyone else, new car included | 0.386 / 0.366, 0.314 / 0.294 | 0.376 / 0.360, 0.309 / 0.296 | Practical: the loss of the same pairs for non-movers; not computed separately. |

## 3. Why movers are harder: the diagnostic targets (`docs/diagnosis.md`)

Movers pooled over 2002–2015 (47 moves with 10 weekends; "late" = 2012–15). Slopes are calibration slopes of the pre-move rating gap (1 = a mover's rating means what a teammate pair's does).

| # | Metric | What it measures | Before | Now (late) | Best possible |
| --- | --- | --- | --- | --- | --- |
| 9 | **Slope ratio movers / stayers** | How much of a stayer's confidence a mover's rating deserves | 0.42 (0.18) | **0.68 (0.42)** | **1** |
| 10 | **Slope ratio at large prior gaps** (≥ 25 points) | Whether the shortfall sits in the extreme ratings | 0.45 (0.25) | **0.54 (0.33)** | **1** |
| 11 | **Portability of the race-specific level** | Weight, in a duel of movers, of the part of the race rating that is not the qualifying rating, as a ratio to stayers' | 0.34 (−0.11) | **0.82 (0.02)** | **1** (the race residual would travel as well as it stays) |
| 12 | **First-weekend residual**, frozen prior and the filter's online forecast | How far movers fall short of their rating in the first weekend after the move (mover-centred outcome minus forecast) | −0.175 / −0.178 | −0.171 / −0.163 | **0**. Not improved. With the arrival-adaptation option (below): −0.053 / −0.047. |
| 13 | Residual in weekends 2–3 and 4–10 (frozen) | Does the shortfall fade | +0.037, −0.038 | +0.044, −0.033 | **0** |
| 14 | **Uncertainty informativeness**: sd of the pre-move gap, movers over stayers; and the slope gradient across sd terciles | Whether the filter's own uncertainty flags the non-portable ratings | 0.98; noisy | 0.96; noisy (−0.11) | Ratio clearly above 1 and a positive gradient. **Not improved** (the posterior sd is nearly the same for everyone; see below). |

Not a target: the movers-versus-stayers slope difference tests (z −2.2 before, −0.9 now, 47 moves) and the per-window numbers, which are too noisy to optimise on.

## 4. The earlier scorecard and truth-free guards ([history/state-space-hill-climbing-2.md](history/state-space-hill-climbing-2.md))

| # | Metric | What it measures | Before | Now | Best possible |
| --- | --- | --- | --- | --- | --- |
| 15 | **D2** (race; qualifying unchanged at 0.486) | Mean of four terms against a control group of drivers whose team did not change | 0.633 | **0.485** | 0, floor of a correct filter about 0.31 race / 0.46 qualifying. **Gameable**: it improved when the strict forecasts got worse; use rows 7–13. |
| 16 | T1 mover swing / T2 stayer swing | Do movers' / the stayers' ratings swing like the control's | 0.79 / 0.58 | **0.60 / 0.47** | 0 (ratio 1); floor of a correct filter about 0.64 / 0.35 (old dynamics) |
| 17 | T3 stayer leak | How much a stayer's rating moves with the strength of the man who joins | 0.70 | **0.33** | 0; floor about 0.08 |
| 18 | T4 frozen transfer (harness definition) | Movers' frozen calibration against stayers', harness reading | 1.05 | **0.54** | 0; floor about 0.17. Superseded by rows 9 and 7. |
| 19 | Efficiency of drivers / of cars | Can the next revision of a rating be predicted from the last (positive = reacts too slowly) | 0.030 / 0.018 | 0.002 / **0.047** | 0; limit baseline + 0.03 (cars: 0.048, **at its limit**) |
| 20 | Control swing at 5 races | The ratings of drivers who stayed must still move (not frozen) | 9.06 | 8.03 | ≥ 75% of the baseline (6.8) |
| 21 | Car-shock leaks (model-free: winter unchanged / joined / season; estimate-based: winter unchanged / season) | Do drivers' ratings move with their car's | 0.046 / 0.068 / 0.033; 0.074 / 0.113 | 0.055 / **0.095** / 0.033; 0.095 / 0.125 | 0; limit baseline + 0.03 (winter-joined: 0.095 against 0.098, **at its limit**) |
| 22 | Rookie first-5 bias | Do new drivers start where the ratings put them | −0.028 | −0.027 | 0 |
| 23 | Squared standardised 6-race revision of drivers (`z2`) and 90% coverage | Are the reported error bars the right size | 8.8, 41% at scale 1 | 9.1, 44% at scale 1 → about 1.06 with the reporting scale `varInfl` 8.55 | z2 1, coverage 90% |

## 5. Truth recovery in the simulator (both sessions simulated; 4 seeds, race)

| # | Metric | Before | Now | Best possible |
| --- | --- | --- | --- | --- |
| 24 | rmse of the driver levels | 21.2 | **16.8** | 0 (floor: the posterior sd of a correct filter, not computed) |
| 25 | rmse of the car levels | 32.9 | 33.2 | as above (**no gain**) |
| 26 | rmse of the teammate gap | 29.0 | **27.7** | as above |
| 27 | Leak against the true car swing | 0.164 | 0.165 | 0 (**no gain**) |

With the driver–car fit three times larger than the simulator's default, the oracle (which knows only the portable levels) is beaten by the filter on teammate pairs (0.525 against 0.553, 2008–11), because the filter's team-fit term learns what the oracle does not know: the oracle is a floor for portable skill only.

## What the improvement was, and what it was not

- **Done in this phase**: larger team-fit term (`sdA` 8 → 12), the only candidate of the pre-registered grid that passes every gate and improves the targets (rows 9, 10, 11, 7: strict teammate loss −0.008 pooled; ratios 0.62 → 0.68, 0.53 → 0.54, 0.65 → 0.82; field loss +0.001). Raising it further or raising the qualifying weight breaches the 2002–07 loss gate or the car-shock gates (rows 1, 19, 21); the weight of the race-specific level in the posted rating (`lambdaD`) made the large-gap ratio worse and was rejected.
- **Implemented, off by default**: arrival adaptation (`adapt`, reference dip 20 points, decay 0.5). It cuts the first-weekend residual from −0.17 to −0.05 (row 12), lowers the ratings-alone loss (0.3846 → 0.3840 in 2008–11, 0.3639 → 0.3632 in 2012–15) and the mover teammate loss (−0.007), but it is a prior keyed to a team change, it overshoots in weekends 2–3 and it does not help the 2012–15 teammate loss. Whether to ship it is a project decision.
- **Not achieved**: row 12 without the adaptation prior, row 14 (the filter's uncertainty does not tell a portable rating from a non-portable one), the car levels and the leak in the simulator (rows 25, 27), and the gap of a mover's teammate-duel loss to a stayer's is still three to six times larger in 2012–15 (0.11 / 0.08) than in 2002–11 (0.033 / 0.013). The remaining gap to the practical reference in row 7 is a driver–car interaction the data contain (`diagnosis.md`), not noise in the settings.
- **Two guards are at their limits** (rows 19 and 21), so the next change has to make room there first.
- **Noise**: 47 moves in the selection window, 15 in 2012–15. The targets of section 3 have standard errors of 0.2–0.4 in slope; a candidate is only credible when it improves them in the windows separately, which the log records.
