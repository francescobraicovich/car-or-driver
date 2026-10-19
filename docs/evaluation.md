# Evaluation harness

> **Two layers.** `packages/eval` and `npm run evaluate` (this page) are the general harness. The metrics the model is optimised against and guarded by are collected in one suite, `packages/research/node/metric-suite.mjs` (`npm run research:suite`), described in [metrics.md](metrics.md); it adds the **strict reading of drivers in a new car** (`mover-strict.mjs`), which supersedes the harness's own frozen test below for judging movers, and the diagnostics of [diagnosis.md](diagnosis.md).

`packages/eval` and `npm run evaluate` are the project's backtesting engine. They score the ratings and the forecasts, and test the properties a good split of driver and car strength must have. Every number comes with a 95% interval and, where it can be built, the value a correctly specified model would give.

```bash
npm run evaluate                                      # state-space model, 2000-2015, 3 synthetic worlds per session
npm run evaluate -- --model both --full               # also the Elo model, and the forecast layer on each
npm run evaluate -- --set race.sdC=30 --label sdC30 --json research/eval/sdC30.json
npm run evaluate -- --compare research/eval/baseline.json research/eval/sdC30.json
npm run evaluate -- --details --null 6 --null-world regMult=2.5,noise=t3     # stress the reference worlds
npm run evaluate -- --tau shipped                     # only the filter as evaluated as the null (default: both S and T)
npm run evaluate -- --runner my-model.mjs             # your own model (see "Adding a model")
node tests/test-eval.mjs                              # the harness's own tests (part of npm test)
```

A full run takes about 70 s (`--model both --full --null 4 --boot 300`). The baseline of the shipped models is `research/eval/baseline.json` (and the text report `baseline.txt`).

## Design rules

- **One shape for every model.** Each model is adapted to a *rating run* per session (`adapters.js`): ratings after every weekend (with error bars if the model has them), levels as forecast before it, and the log-odds it gave to every observation. Every metric reads only that, so a new model gets all of them by filling it in.
- **The holdout is spent.** The 2016+ window was read once for an earlier version of the shipped model and again as a second look for this one (see [state-space.md](state-space.md), [../research/eval/ACCEPTANCE-detach.md](../research/eval/ACCEPTANCE-detach.md)); anything quoted for it is labelled so and never used to choose a setting. Unless `--holdout` is given, the timeline is cut at 2015 *before any filter runs*, so no setting under test can have seen it. The filters are forward-only, so the cut loses nothing.
- **Honest intervals.** Weekends of a season are not independent, so every interval is a bootstrap over whole seasons (`stats.js`), seeded.
- **Events are exogenous.** Moves, lineup changes, rookies, regulation winters, renames and takeovers come from who raced where and from `lineage.js` and a hand-kept list of regulation years (`events.js`), never from the model's own ratings. Picking "car shocks" as the cases where the model's car moved a lot would be circular.
- **Gauge.** Ratings are centred on whoever raced that weekend, so a retiring star shifts everyone's number. Every change of a rating is measured *net of stable entities* (drivers or cars in a team with an unchanged lineup over the same weekends), and all forecast-side tests use the levels before the weekend (no look-ahead).
- **Zero is usually not the right answer.** Movers are selected on good runs, and in any filter a driver and his car have negatively correlated errors (the sum is identified, the split is not), so a perfect model does not read zero on most of these diagnostics. Each real number is therefore shown next to what the same code reads on **synthetic worlds** where the filter's assumptions hold (two versions, see below).
- **Scores sit beside the properties.** A model can satisfy every property by refusing to change its ratings. The predictive scores are the guard against that (see "Proof that the metrics discriminate").

## What is measured

All structural metrics are computed for race and qualifying separately.

### Predictive (`predictive.js`, `pipeline.js`)

- **Ratings alone**, on the exam's observations and weights: weighted log-loss, Brier and accuracy by window (2002–2007 is the fit window of the calibration multiplier, then 2008–2011, 2012–2015, and 2016+ with `--holdout`), by pair type (all, teammates, other cars), session, observation source (finishing order, lap pace, retirement snapshots), weather, the model's own uncertainty (terciles of the gap variance) and **connectivity** (cross-team pairs by teammate-graph distance in the last three seasons: former teammates, one shared teammate, two links, not linked).
- **Calibration:** slope through the origin (1 = right, less = over-confident; invariant to which driver is called x), reliability on the favourite's side, expected calibration error, and a **walk-forward** log-loss with the multiplier refitted each year.
- **Forecast layer** (`--full`): race-day, Thursday and qualifying-head log-loss of the form trackers and heads running on each rating system.

These reproduce the tables in [state-space.md](state-space.md) and [elo.md](elo.md); `tests/test-eval.mjs` fails if they stop doing so.

### Property 1: movers keep their rating (`movers.js`)

For every established driver (at least 10 earlier races, absent at most one year, at least 3 races for the new team) who changed team (lineage-aware: a renamed team is not a move):

- **step:** his rating after the k-th race for the new team minus his rating at his last race for the old one, net of stable drivers. The mean is the bias; the rms against the same quantity for stable drivers is how much *more* he moves than someone who stayed.
- **leak:** slope of that step on the car-strength difference between the new and old team (0 = the rating does not inherit the car).
- **frozen duels:** his rating from before the move, frozen at the first weekend for the new team, against the new teammate over the first 5 and 10 races: calibration slope (1 = a good proxy), log-loss against a coin flip, against the filter's own online forecast, and the same frozen forecast for teammates who stayed (the control). **Caveat:** this reads the level at his first weekend for the new team, after the filter has reset his fit with the old car, which is a step only movers take; for judging how well a rating travels use the strict reading in [metrics.md](metrics.md) (`mover-strict.mjs`), which reads the rating posted before his last weekend for the old team and nothing after.

### Property 2: the teammate who stays is not moved by the newcomer (`teammates.js`)

For lineup changes where a driver stays and established drivers arrive:

- **step** of the stayer's rating (bias and size against stable drivers);
- **leak:** slope of the stayer's step on how much stronger the incoming driver is than the one he replaced. A calibrated rating does not move with the newcomer's strength;
- **allocation:** where a revision of the pair's gap lands (mover, teammate, car). Mover minus teammate is 1 by construction; the car's share is interpretable only against the null.

### Property 3: car shocks do not move drivers (`shocks.js`)

Records of "driver stayed while his car moved", over each winter and over six-weekend windows in-season:

- **leak slope** of the driver's rating change on the car's, for lineups unchanged (where the split is set by the model's assumptions alone), with a driver joined (identified by data), in regulation winters (2009, 2014, 2017, 2022, 2026) and in normal ones;
- **model-free leak** (`leakFree`): the same slope on the team's *observed* performance change (its drivers' win share against other teams, from results alone). The estimated car can be made to hide a leak by a model that never lets the car move; this cannot;
- **drivers in regulation winters:** rms change of driver ratings in regulation winters over normal winters (should be about 1) next to the same ratio for cars (shows the shock exists);
- **teammate-gap volatility:** slope of the change in a pair's gap on the size of the car's change;
- a table of every winter in which a team changed name or hands (`--details`).

### Health, rookies and recovery

- **Efficiency** (`diagnostics.js`): slope of the next in-season revision of a rating on the last one (0 = updates unpredictable; positive = reacts too slowly, negative = chases noise).
- **Error bars:** the mean squared standardised 6-race revision should be 1 for a Bayesian filter (uses the sd before and after and the process noise), and 90% of revisions should fall inside the 90% bar. Bars should also **widen** after a move, a debut and in a regulation winter.
- **Rookies** (`rookies.js`): bias of his first duels (outcome minus forecast), their calibration slope, his rating after k races against after 40 (survivors only: a rookie who lasts 40 races is a good one), and the slope of the car's change on his own over his first five races.
- **Synthetic recovery** (`synthetic.js`): rmse of driver and car ratings, forecast error of teammate and cross-team gaps, truth inside the error bars, the **leak against the true car swing**, how much of a true winter car swing the car estimate captures, and the bias of the mover step against the true change.

## The separation scorecard (D2)

Four terms per session, each measured **relative to a control group** (drivers in teams whose lineup did not change over the same weekends, net of the field's centring: `makeControls`), so that a model that does not let drivers move cannot score well: **T1** mover swing (rms step of drivers who changed team over the control's, abs(ln R), k = 1, 3, 5, 10 races), **T2** stayer swing (the same for the driver who stays when an established driver arrives), **T3** stayer leak (his step on the newcomer's strength gap, in control swings), **T4** frozen transfer (calibration slope of a mover's frozen rating against his new teammate over the stayers'). D2 is the mean of the four, over race and qualifying. They are pure functions of the harness output and the events (`packages/research/node/separation.mjs`), and each is read next to the floor a correct filter scores on a synthetic world of the real calendar (`separation-null.mjs`): a correct filter does not read R = 1 (it reads about 2 at one race), so the number to look at is the real reading minus the floor. Definition, guards and the first use: [state-space-hill-climbing-2.md](history/state-space-hill-climbing-2.md).

## The synthetic worlds

`syntheticWorld` keeps the real schedule (who raced for which team, the moves, renames, takeovers and the exact pair structure of the observations) and replaces what is unknown. True driver and car levels follow the **shipped** settings' dynamics, including the new-team transient and the rookie debut adjustment (`worldFromHyper`). Each weekend draws **one performance per driver** (true level plus Gumbel noise, so every pair has exactly the odds the filter assumes, or `noise=t3` for heavy tails) and derives all observations from the ranking. Independent coin flips per pair would be far too informative.

The world is drawn from the shipped settings, not from the filter under test (`--null-self` does that, deliberately): a candidate with rigid cars and drifting drivers run on a world with rigid cars and drifting drivers would certify itself. A candidate is run on the same world as the baseline, so its recovery numbers are comparable.

**Version 2** (`world.version = 2`, opt-in; v1 and its tests are unchanged) adds what the real data have and these worlds leave out: lap pace in stints, retirements and snapshots, rain, strategy luck, a qualifying session related to the race, career curves, car development steps, a driver–car fit. It builds the observations with the exam's own code from simulated results and lap files. See "Simulator v2" below for what it reproduces and what it does not: **it does not pass its realism checks, so nothing in this repository was judged with it.**

Two things are read from these worlds.

**The null of each real-data diagnostic.** The same code, the same filter, on a world where the filter's dynamics hold. Two versions are reported, because the filter's likelihood weight `tau` (fitted on real data, 0.05 in the race session) matters:

- **S** (same filter): the filter exactly as evaluated on the real data. This is the fair comparison for "do the real data behave as this filter's assumptions imply?".
- **T** (tuned): the filter with `tau` tuned to the world (`--tau auto`), as the project did for its earlier synthetic tests. In a world whose observations all derive from one ranking per weekend, the real-data `tau` over-weights the data and gives over-confident bars (race z² about 15); a tuned filter shows what a well-behaved filter reads (z² about 1).

When a verdict differs between S and T, the diagnosis is the filter's own over-reactivity, not the data. A `tau` given with `--set` is the filter under test and is kept in both.

**Recovery of the truth** (printed after the scorecard): the filter's *absolute* quality where the answer is known. This does not depend on the real data at all: rmse of drivers and cars, forecast error of teammate and cross-team gaps, truth inside the error bars, the **leak against the true car swing** and how much of a true winter car swing the car estimate captures. A leaky filter reads high here whatever the real data are, which the S/T verdicts cannot tell you (a leaky filter leaks on the null world too, so it can read `ok` against itself).

Stress worlds (`--null-world regMult=2.5,noise=t3,moveSd=10`) test whether a conclusion survives bigger regulation shocks, heavy tails, or true changes at a move.

Limits of the null: it assumes the filter's own dynamics, so it says what a *correct* filter reads, not what the true F1 process does; it has no pace/retirement observation noise of the real data; and four worlds give a rough spread (the `±` is the spread of the estimate across worlds).

## Proof that the metrics discriminate

`tests/test-eval.mjs` runs three filters on synthetic worlds with known truth:

| Filter | Leak vs true car swing | Model-free leak | Forecast loss | Error bars (z²) |
| --- | --- | --- | --- | --- |
| matched to the world | 0.02 | 0.02 | best | about 1 |
| **leaky** (rigid car, drifting drivers) | **0.35** | **0.40** | worse | far too narrow |
| **frozen drivers** | 0.01 | 0.01 | **worse** | too narrow |

The frozen filter passes both leak tests, and only the predictive score and the error bars catch it. That is why they are part of the same report.

## Baseline

> **This section is the baseline of the filter before the detachment work** (independent race filter, `research/eval/baseline.*`), kept as the reference every later change is compared with. The shipped model's full report is `research/eval/shipped-harness.txt` (regenerated by `research/eval/regenerate.sh`); `evaluate --no-link` with the settings of `separation-report.mjs`'s `BASELINE` reproduces the baseline.

*After the hill climb (docs/history/state-space-hill-climbing-1.md) the shipped race error bars are scaled (`varInfl`): the row "Error bars: squared standardised 6-race revision, race" now reads 1.12 [0.90, 1.32] instead of 8.8 (the filter in the nulls carries the scale too, so S reads 1.9 instead of 15.0 and T 0.15 instead of 1.14, and on the v1 worlds the scaled bars are too wide: truth inside the 90% bar 0.97, squared error over sd 0.6, because those worlds obey the filter's assumptions and the scale was fitted on the real revisions); every other number here is as in `baseline.json` to 1e-7.*

Shipped state-space model against the Elo model, 2000–2015 (holdout excluded), race session unless noted. Real values are [95% CI over seasons]; **S** and **T** are the synthetic nulls of the state-space filter (mean ± spread over 4 worlds): S the filter as evaluated, T tuned to the world. Full tables: `research/eval/baseline.txt`; the same file has qualifying and the detail tables.

| Question | State-space | Elo | S | T |
| --- | --- | --- | --- | --- |
| Ratings-alone log-loss 2008–11 / 2012–15 (combined) | 0.3877 / 0.3656 | 0.4018 / 0.3731 | | |
| Forecast layer, race-day 2008–11 / 2012–15 | 0.3372 / 0.3252 | 0.3380 / 0.3262 | | |
| **1.** Mover step after 5 races, mean (points) | −2.0 [−5.4, 1.9] | −0.7 [−1.9, 0.5] | 1.0 ± 1.9 | 0.6 ± 0.9 |
| 1. Mover step on car-strength change (slope, 5 races) | −0.00 [−0.09, 0.10] | −0.04 [−0.07, −0.01] | −0.14 ± 0.15 | −0.05 ± 0.05 |
| 1. Mover step size vs stable drivers, after 1 / 3 races | 2.84 [2.21, 3.76] / 2.37 [2.06, 2.81] | 0.86 [0.72, 1.02] / 1.06 [0.84, 1.27] | 2.68 ± 0.10 / 2.13 ± 0.36 | 1.93 ± 0.06 / 2.07 ± 0.22 |
| 1. Frozen pre-move rating vs new teammate, slope (5 races) | **0.35 [0.13, 0.71]** | 0.44 [−0.01, 1.04] | 0.76 ± 0.21 | 0.97 ± 0.26 |
| (same forecast for teammates who stayed) | 1.04 [0.88, 1.18] | 1.17 [0.98, 1.34] | 0.79 ± 0.09 | 1.03 ± 0.05 |
| 1. Same, qualifying | 0.86 [0.54, 1.28] | 0.42 [0.19, 0.75] | 0.88 ± 0.22 | 0.84 ± 0.21 |
| **2.** Stayer's step on (incoming − replaced) strength, 3 races | **0.12 [0.01, 0.21]** | 0.01 [−0.07, 0.06] | −0.00 ± 0.02 | −0.00 ± 0.01 |
| 2. Same, 5 races | **0.13 [0.02, 0.24]** | 0.00 [−0.11, 0.09] | 0.02 ± 0.01 | −0.00 ± 0.01 |
| 2. Same, 10 races | 0.21 [0.03, 0.30] | 0.04 [−0.10, 0.15] | 0.05 ± 0.03 | 0.00 ± 0.01 |
| 2. Same, qualifying, 5 races | 0.02 [−0.15, 0.13] | 0.04 [−0.11, 0.17] | 0.01 ± 0.02 | 0.01 ± 0.02 |
| **3.** Driver change on observed team-performance change, winter, lineup unchanged | 0.05 [0.02, 0.07] | 0.03 [0.02, 0.04] | 0.06 ± 0.01 | 0.03 ± 0.00 |
| 3. Same, in-season windows | 0.03 [0.02, 0.05] | 0.04 [0.03, 0.04] | 0.03 ± 0.01 | 0.03 ± 0.00 |
| 3. Same, qualifying, winter | 0.02 [0.01, 0.03] | **0.14 [0.09, 0.18]** | 0.02 ± 0.01 | 0.03 ± 0.01 |
| 3. Driver rms change, regulation winters vs normal (cars: 1.26 [1.05, 1.64]) | 0.97 [0.73, 1.28] | 0.95 [0.67, 1.40] | 0.88 ± 0.18 | 0.91 ± 0.07 |
| Error bars: squared standardised 6-race revision, race | **8.8 [7.1, 10.4]** | | 15.0 ± 2.6 | 1.14 ± 0.25 |
| Error bars: same, qualifying | 1.04 [0.62, 1.63] | | 0.95 ± 0.08 | 1.18 ± 0.10 |
| Rookie first-5-race bias (outcome − forecast), race | −0.03 [−0.04, −0.01] | −0.08 [−0.10, −0.05] | −0.01 ± 0.02 | −0.01 ± 0.02 |
| Rookie first-5-race bias, qualifying | −0.01 [−0.03, 0.01] | −0.10 [−0.12, −0.08] | −0.00 ± 0.01 | −0.01 ± 0.01 |

Recovery on the synthetic worlds (the shipped filter, race / qualifying): the truth lies inside the driver's 90% bar **56% / 90%** of the time as evaluated (89% / 90% once `tau` is tuned); the leak against the *true* car swing over a winter with an unchanged lineup is **0.12 ± 0.08 / 0.01 ± 0.01** (the price of the prior, since no data separates driver from car there); the car estimate captures 83% / 48% of a true winter car swing.

What this says about the three properties (state-space model):

1. **Movers.** The rating does not jump up or down on average (all means are inside their intervals) and does not inherit the new car. It moves 2.4–2.8 times as much as a stayer's in the first races; a correct filter also moves them more (about 2 to 2.7 times, since it is less sure of a newcomer), so this is consistent with S. The frozen pre-move rating is a poor guide to the duel with the new teammate in the race session (slope 0.35 against 0.76 under S and 0.97 under T): this survives both nulls. Qualifying is fine.
2. **Teammates of movers.** In the race session the stayer's rating rises when the newcomer is stronger than the driver he replaced (0.12 and 0.13 per point after 3 and 5 races against 0.00 and 0.02 under S, 0.00 under T), on about 40 events, while the Elo model is at 0. This survives S at 3 and 5 races. At 10 races it is borderline against S (0.05 ± 0.03: a more reactive filter produces some of it mechanically) and clear against T. The cause is not isolated here: it is consistent with part of the newcomer's quality being credited to the shared car and then the teammate. Qualifying is clean.
3. **Car shocks.** Nothing here departs from the nulls. Drivers do not move more in regulation winters than in normal ones (0.97) although cars do (1.26), and the model-free leak (0.03–0.05 per point of team performance) is at its null. The estimate-based leak (0.07 in winters, 0.11 in-season) is at or below its null (S: 0.13 and 0.09; T: 0.15 and 0.24). The Elo model's qualifying ratings do leak (0.14 against 0.02).

Other findings: the race error bars are about three times too narrow (squared standardised revision 8.8; 41% of revisions inside the 90% bar), and the same filter reads 15 on a world built to its own assumptions, so this is the over-reactivity of the likelihood weight fitted for forecasting, not a feature of the real data; qualifying's are right. The race rookie start is slightly too generous (first five duels −0.03 against −0.01), much better than the Elo's (−0.08).

## Simulator v2

> **Both sessions.** `syntheticWorld(…, session, …)` simulates only the requested session's observations; the other session's observations in the returned timeline are the real ones. A race filter that reads qualifying (the shipped one) must be tested on `simulation-both.mjs`'s `bothSessions`, which simulates both from the same latent state. A first version of the truth-recovery check ran on race-only worlds and was invalid for this reason (see [diagnosis.md](diagnosis.md)).

`packages/eval/src/synthetic-v2.js`; `syntheticWorld(timeline, idx, session, { version: 2, ... }, seed)`, `syntheticStudy(..., { world: { version: 2 } })`, or `--null-world version=2`. Races: per-lap times from true pace, tyre age, fuel burn, traffic and pit stops, a lap-to-lap pace offset that wanders, the grid deciding the early order (qualifying plus noise), strategy luck shared by a team and a driver's own weekend form, car reliability and driver incidents (the real distribution of retirement laps, slow laps before a stop, rookies and rain raising the rate, slow cars failing more), rain from the calendar's wet flags with a per-driver wet skill. Qualifying: Q1/Q2/Q3 times with elimination. Race and qualifying share their latent world (innovations correlated, 0.8 for cars and 0.7 for drivers) and have their own noise. Latent world: the baseline dynamics of the shipped settings (fixed in the module, so the same world tests any settings) with spreads chosen by calibration, career curves, rookie learning, development steps of cars in season, a number-one driver effect, a persistent driver–car fit and a true change at a team move. The observations come from `buildRaceObservations`, `parseLapPace`, `buildQualObservations` and the weights of `elo-core.js` applied to the simulated results, lap files and snapshots. Calibration: `packages/research/node/simulation-calibrate.mjs` (noise parameters against the real 2008–2011 numbers); the check: `simulation-check.mjs`, `simulation-table.mjs`; tests: `tests/test-synthetic-v2.mjs`.

Realism check: the shipped filter (settings before the hill climb), on 6 worlds of the real calendar through 2011 against the real results of the same weekends, 2008–2011 (mean [min, max] over worlds; the real column is computed with the same code):

**Race**

| | real | v2 worlds |
| --- | --- | --- |
| ratings-alone loss, all pairs | 0.3918 | 0.3882 [0.3231, 0.4500] |
| teammate pairs | 0.6118 | 0.5364 [0.4646, 0.5972] |
| other cars | 0.3221 | 0.3378 [0.2669, 0.4179] |
| calibration multiplier (fitted 2002–07) | 0.996 | 0.928 [0.878, 0.982] |
| loss, source finish | 0.3918 | 0.3875 [0.3219, 0.4495] |
| share of o = 1, finish | 1.000 | 1.000 |
| calibration slope, finish | 1.00 | 1.06 [0.99, 1.10] |
| loss, source paceW | 0.3723 | 0.3948 [0.3361, 0.4541] |
| share of o = 1, paceW | 0.820 | 0.808 [0.791, 0.820] |
| calibration slope, paceW | 1.06 | 1.02 [0.99, 1.08] |
| loss, source pace (fallback) | 0.8036 | 0.4332 [0.3043, 0.5277] |
| share of o = 1, pace | 0.950 | 0.797 [0.752, 0.846] |
| calibration slope, pace | 2.14 | 0.92 [0.65, 1.11] |
| pairs, pace | 639 | 588 [421, 778] |
| loss, source partial | 0.4478 | 0.6262 [0.5316, 0.7185] |
| share of o = 1, partial | 0.211 | 0.221 [0.132, 0.308] |
| calibration slope, partial | 0.73 | 0.52 [0.39, 0.74] |
| pairs, partial | 578 | 511 [386, 640] |
| loss, dry / wet | 0.3794 / 0.4507 | 0.3763 [0.3118, 0.4229] / 0.4450 [0.3782, 0.5652] |

| tau | 0.003 | 0.01 | 0.025 | 0.05 | 0.1 | 0.2 | best |
| --- | --- | --- | --- | --- | --- | --- | --- |
| real | 0.4024 | 0.3938 | 0.3916 | 0.3918 | 0.3934 | 0.3961 | 0.025 |
| v2 worlds (mean of 4) | 0.3878 | 0.3803 | 0.3798 | 0.3818 | 0.3853 | 0.3900 | 0.025 |

**Qualifying**

| | real | v2 worlds |
| --- | --- | --- |
| ratings-alone loss, all / teammates / other cars | 0.3540 / 0.5759 / 0.2853 | 0.3651 / 0.5469 / 0.2999 |
| calibration multiplier | 1.149 | 1.114 [1.060, 1.206] |
| share of o = 1, calibration slope | 0.995, 1.06 | 1.000, 1.01 |

| tau | 0.003 | 0.01 | 0.025 | 0.05 | 0.1 | 0.2 | best |
| --- | --- | --- | --- | --- | --- | --- | --- |
| real | 0.3939 | 0.3691 | 0.3589 | 0.3549 | 0.3535 | 0.3544 | 0.1 |
| v2 worlds (mean of 4) | 0.3845 | 0.3668 | 0.3607 | 0.3595 | 0.3608 | 0.3638 | 0.05 |

Verdict against the criteria written when the simulator was designed (within roughly 0.02 in loss, best `tau` within a factor of two of the shipped one): **loss by source** passes for `finish`, `paceW` (0.02) and `qual`, **fails** for `pace` and `partial`; **share of o = 1** passes except the fallback source (0.80 against 0.95); **calibration slopes** pass for `finish`, `paceW` and `qual`, not for `pace` and `partial`; **wet against dry** passes; **best `tau`** passes (0.025 and 0.05, shipped 0.05 and 0.07). Also off: teammate pairs (0.54 against 0.61: a simulated driver spread that does not make the filter's teammate duels as hard as the real ones is a driver spread near zero, so teammates cannot be reproduced without making drivers all alike) and the race multiplier (0.93 against 1.00). The `pace` and `partial` sources are 4% and 2% of the exam's race pairs and come from 30 or so events a window, so their per-world spread is large (partial 0.53–0.72), and the real figure for `pace` lies outside the simulated range. **So v2 is not trusted to judge anything.** It is shown as information (recovery of the truth by the shipped filter and by the hill climb's final point: [state-space-hill-climbing-1.md](history/state-space-hill-climbing-1.md)), and the v2 baseline run was not committed beside the v1 baseline.

## Reading a result

- **S / T verdicts.** `ok` when the real interval contains the null, `high` / `low` when it lies above / below it. The null is the same diagnostic of the same filter on a synthetic world, so a verdict says whether the *real data* behave as the filter's assumptions imply. It does not say the filter is free of leaks: use the recovery section for that. A finding that holds against both S and T is about the data and the model; one that holds only against T is the filter's own over-reactivity.
- Models without a synthetic runner (Elo) get no verdict column; read the comparison table (`--model both`) and the targets.
- With roughly 70 movers and 45 lineup changes the intervals are wide, and many metrics are *consistent with* either the null or a modest problem. Use `--compare` between two runs and look for changes beyond the intervals.
- Several rows are different views of the same events (steps at 1, 3, 5, 10 races; the two leak versions), so do not count them as independent confirmations.
- The race and qualifying filters are independent; a problem in one says nothing about the other.

## Adding a model

A runner is a default export `(timeline, session, ctx) => run`. The run is the shape documented at the top of `packages/eval/src/adapters.js`: `post`, `pre`, `z`, and optionally `drift` (for the error-bar tests). `--runner file.mjs` evaluates it against the same timeline and prints its scorecard; compare it with `--compare`. To give it a synthetic null, call `syntheticWorld(...)` yourself and run it on `world.timeline` (see `syntheticStudy` in `index.js`).

## Limits

- The Elo model has no synthetic runner (its core is not callable on an arbitrary timeline), so it is read against targets and the state-space nulls only informally.
- The synthetic null has no lap-pace or retirement observation noise and no true F1 structure beyond what the shipped settings assume.
- The estimate-based leak is ill-conditioned when a model barely lets the car move (slopes of 100+ in the leaky test filter); trust `leakFree` and the truth-based leak then.
- Rookie "rating after k races minus after 40" counts survivors only.
- The forecast layer is scored by aggregate log-loss, Brier and accuracy per window (race-day, Thursday, qualifying head). The calibration, the teammate/cross-team split and the link-strength slices cover the *ratings-alone* forecast, not the heads' probabilities.
- Cross-team pairs are bucketed by teammate-graph distance up to six links in the last three seasons.
- `2016+` is spent for the shipped model; `--holdout` should be used once per pre-registered candidate.
