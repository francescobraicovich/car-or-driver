# The Elo model

The site's ratings are the joint state-space ratings ([state-space.md](state-space.md)). This note describes the Elo-style model, which the site no longer offers as a choice. It is the benchmark the state-space ratings are scored against, and (through `elo-benchmark.js`) the source of the circuit offsets and wet-weather skill that the what-if reads. The state-space model does not depend on it otherwise: the exam, the retirement hazards and the scale are its own (`state-space/exam.js`, `exam.js`, `hazard.js`, `presets/model-settings.js`).

The model is two layers:

1. **The rating core** (`packages/core/src/elo-core.js`, `buildEloCore`): a chronological Elo update for race and qualifying pace, with reliability hazards, circuit affinity, wet-weather skill, a rookie boost and a grid term.
2. **The forecast layer** (`packages/core/src/elo-forecast.js`, `buildEloForecast`): form trackers and fitted probability heads that sit on top of the ratings and produce the forecasts. Its heads are frozen (`packages/core/src/elo-forecast-heads.js`).

Ratings are centred on `BASE = 1000`, and the scale is 75 points per factor of 10 in odds.

## The rating core

**Strength.**

```
RaceStrength(i) = RaceDriverᵢ + RaceCarᵢ − 1000
QualStrength(i) = QualDriverᵢ + QualCarᵢ − 1000
```

**Race.**

- Observations are pairwise: finishing order among classified finishers, and like-for-like lap pace (`lap-pace.js`: the median of laps within 105% of a driver's best, compared inside shared 8-lap windows so fuel loads and track state match). Pace covers retirees too; where lap coverage is missing, a retiree is compared with every other driver on their last completed lap, weighted by `(lap/maxLaps)^β` (`partialExp`), otherwise pace is censored (the reliability process still learns from the retirement).
- A pair's weight is `min(cap, 1 + α·log2(gap))`, with `gap` the position gap, or the gap in seconds for pace pairs. Finishing-order pairs carry `orderW`, pace pairs `paceW`.
- The same-team driver gradient is multiplied by `tmBoost` when scoring and by `tmBoost·tmLearn` when learning. Cars learn only from cross-team pairs.
- `carCarry` is the winter reset, `C ← 1000 + carry·(C − 1000)`. A car also learns faster early in a season (`kcEarly`, `kcTau`). Ratings are re-centred on 1000 among the active entrants after each weekend.
- Optional mechanisms, all no-ops at their defaults: rookie prior (`rookieStart`, `rookieAge`, `rookieTau`), team continuity across renames (`lineage`), regulation-year carry (`regCarry`).

**Qualifying** (`qualifying.js`). For each pair, the latest segment where both set valid times (Q3 > Q2 > Q1) is compared, with weights from the time gap. Disrupted sessions (an expected Q2 or Q3 time missing, or no Q1 time) are censored, never treated as slow. The same-team gradient is multiplied by `qTmBoost`, and `qCarCarry` is the winter reset.

**Combined.**

```
CombinedDriver = 1000 + (1−wq)(RaceDriver−1000) + wq(QualDriver−1000)
CombinedCar    = 1000 + (1−wq)(RaceCar−1000)    + wq(QualCar−1000)
PackagePace    = 1000 + (CombinedDriver−1000)   + (CombinedCar−1000)
```

It falls back to race pace when qualifying is off or unseen. `wq` is `qualWeight` and only changes the displayed combined rating, never a scored prediction.

**Reliability and incidents** (`status.js`, `hazard.js`). `status.csv` gives `{mech, driver}` attribution weights, a fixed table (the site offers no editor for it). Per-lap hazards decay exponentially (`relHalf`, `incHalf`), start from Laplace priors (`relPrior`, `incPrior` laps) and are damped each winter (`relWinter`). `postHaz` and `fieldHaz` give an entity's and the field's per-lap retirement rates, and the effective rating folds them into the pace probability over `stdLaps` laps (`headToHeadWithHazard`). `hazardW` mixes the hazard-adjusted probability with the plain one.

**Track and weather.**

- Circuit affinity (`circK`, `circCarry`): a per-driver, per-circuit offset with a small K, zero-sum per weekend and decayed each winter.
- Grid advantage (`gridAdv`, `gridAdvRefuel` up to 2009): used in the pre-race prediction only. It never leaks into a rating update.
- Wet-weather skill (`wetK`): a zero-sum per-driver offset, updated only on the curated wet weekends in `wet-races.js` (each entry is checked against `races.csv` by `packages/research/node/verify-wet.mjs`).
- Home advantage (`homeAdv`, driver nationality against the circuit's country, `geography.js`).

**Caveats.** `qualifying.csv` has no cause field, so a no-time session is censored and never attributed to a crash or a failure. Attribution weights are judgements, not ground truth.

## Backtesting

Each weekend's `diag` records the prediction quality of the pre-update ratings: weighted log-loss, Brier score and favourite accuracy over that weekend's pairs (race and qualifying separately). `backtest.js` aggregates them per season against a coin flip (log-loss ln 2 ≈ 0.693, Brier 0.25), with a burn-in (default 20 weekends) to skip the cold start.

## The exam

The benchmark's scoring weights (`packages/core/src/exam.js`: `alpha`, `cap`, `tmBoost`, `qTmBoost`, `orderW`, `paceW`, `partialExp`, `qualOn`) decide which observations exist and how much each counts. They are frozen during every search, so a candidate has to win by predicting better, never by making the test easier. `npm run verify:exam` hashes the whole observation stream across random parameter draws and fails if any of them changes it, and moves each frozen key to check the freeze is not vacuous.

Teammate pairs are weighted 8: they are the hardest subset (loss about 0.52 against 0.28 for pairs from different cars), and this weighting makes them 25.7% of the score. The state-space ratings are scored on the same exam.

## Settings

`packages/core/src/presets/tuned-elo.js` holds the settings, chosen on 2008–2011 walk-forward combined log-loss with 2012–2015 as a pre-registered gate (0.342687 → 0.338212; `research/backbone/protocol-4.json`). The tuning window matters more than the search budget: scoring 120 random parameter sets per era shows backbone quality correlates 0.96–0.98 between any two windows from 2008 and −0.16 to 0.00 between 2000–2007 and anything later (`research/backbone/era-transfer.json`), so the settings are tuned on the modern era only.

`npm run research:backbone` runs an annealed parallel search (8 chains; about 80 s on a 10-core laptop; `--evals 300` takes about 27 s) and `npm run research:gate` scores a candidate on the held-out window. The tool is fast because the pairwise hazard probability has a closed form (`headToHeadWithHazard`, checked against the per-lap loop to 1e-14), and because a lean build with a parameter-independent cache scores a candidate in about 67 ms.

The latest search found 0.350305 on 2008–2011 against the shipped 0.351997, and then scored 0.339432 against 0.338212 on 2012–2015, so it failed the gate and the shipped settings stayed. The four-season objective is the limit here, not the optimiser.

What moves the score (a sweep of each of the 28 searchable parameters across its range, 2008–2011): `scale` (0.119), `gridAdv` (0.053), `kd` (0.048), `gridAdvRefuel`, `kc`, `kcEarly`. Moderate: `hazardW`, `homeAdv`, `qkc`, `qTmLearn`, `stdLaps`, `carCarry`, `tmLearn`. About thirteen others, including `circK`, `wetK` and the reliability shape parameters, are negligible, and `qualWeight` and `relPrior` have no effect on a scored prediction.

## The forecast layer

Form trackers (`forecast/form.js`) keep fast and slow estimates of recent form from qualifying gaps, shared-window lap pace and finishing order, with separate driver and car estimates and shrunk circuit residuals. They update only after a weekend's predictions are scored, and they do not read the ratings.

The heads (`forecast/inference.js`, `elo-forecast-heads.js`) are ensembles of a regularised logistic model and boosted trees, in four modes: **post** (after qualifying: adds the common-session gap, the Q1/Q2/Q3 gaps, team qualifying form and the grid), **pre** (Thursday: no current-weekend evidence), **qual** and **grid** (grid slots only). Driver reversal is enforced, so P(A beats B) + P(B beats A) = 1. Inputs use binary32 precision with magnitudes below 1e-7 set to zero, identically in Python and JavaScript, because JSON parsers differed by about 1e-15 and a boosted tree split on that noise.

The designs (`research/selection.json`) were selected on two chronological folds (fit through 2007, validate 2008–2011; fit through 2011, validate 2012–2015), with no random pair split. They are refitted through 2007, 2011 and 2015 for forecasts from 2008, 2012 and 2016, and frozen after that.

| Forecast | Selected design | Mean validation loss |
|---|---|---:|
| post | segment trees + robust linear, 50/50 | 0.3284 |
| pre | medium trees + segment linear, 50/50 | 0.3739 |
| qual | recent-8 trees + robust linear, 50/50 | 0.3635 |

Results (weighted log-loss, lower is better; the 2008–2015 rows are selection validation, not an independent test):

| Window | Combined | Thursday |
|---|---:|---:|
| 2008–2011 | 0.3380 | 0.3839 |
| 2012–2015 | 0.3262 | 0.3615 |
| 2016 onward | 0.3368 | 0.3929 |

Rating-side serving must reproduce training: the heads' `baseline` input is computed at the core's own scale, hazard weight and standard race length (`forecast/prepare.js`, checked by `tests/test-forecast-parity.mjs`). Forecasts exclude the curated realised-wet flag. No current-race finish, lap time or retirement enters a forecast.

## What-if matchups

`forecast/scenario.js` builds a matchup from any driver at any moment, any car at any moment, dry or wet. There is no form and no qualifying, so the probability is the rating model's own, stretched by one fitted constant: `RATINGS_SCALE` 1.23 for different cars and 1.17 for teammates (stable across eras at 1.22–1.25 for different cars; fitted to 2011 and scored on 2012–15 it takes loss 0.3762 → 0.3728), and `WET_RATIO` 0.81 (on 33 wet weekends the best scale is 1.01 against 1.25 dry, and loss is 0.441 against 0.384). The heads are not used there: with the form signals emptied they under-state large gaps (a 120-point car gap came out near 88% instead of 99%), because form normally agrees with the ratings.

## Rookies and team continuity

The rookie prior (`rookieStart` −6, `rookieAge` −4, `rookieTau` 10, `rookieBoost` 2) was fitted on 2002–2007 with the core's own walk-forward score and improved the 2008–2015 Thursday head by 0.0020 on average. It ships as no-ops in the Elo settings, because adopting it means refitting the heads.

Team continuity (`lineage`, `lineage.js`): the data gives a renamed team a new constructor id, which used to restart it at 1000 (Force India → Racing Point → Aston Martin, Toro Rosso → AlphaTauri → RB, Renault → Alpine). 25 transitions are listed. Inheriting across renames helped (a 2006 change of −0.0037 and 2015 −0.0037, nothing worse than +0.0006), while inheriting across ownership takeovers hurt (Honda → Brawn in 2009 +0.0048), because a new owner changes the car. The rule is renames only.

## What did not help

- Better form trackers: a Kalman filter added or replacing the exponential ones, constants fitted on ≤2007, a regulation-year reset, a surprise term against the Elo forecast, a car × circuit residual. All within the ±0.0005 noise floor or worse. Dropping every form feature costs +0.006 (Thursday) and +0.009 (qualifying), and nothing on race day.
- Whole-field projection (+0.003 to +0.008) and an additive-utility network (−0.0006 to −0.0011 blended in, not worth a network).
- Recalibrating the head probabilities (a single logit scalar fits at 0.9903 for race day, worth 0.00001) and longer boosting (worse monotonically from 200 to 2000 iterations).
- A weaker winter carry in regulation-reset years, which the data contradicts (2011, 2014, 2017 and 2021 all want the maximum carry), and a decaying early-season rate beyond what the shipped `kcEarly` does.
- Mean reversion to a team's long-run level, trend carry and refitted winter sets.

**The residual.** Race-day loss is 0.3293 against 0.3242 expected if its own probabilities were true, so it is calibrated. An out-of-sample regression of the residual on about 100 features has R² between −0.002 and 0. Teammate pairs are 23% of the weight and 39% of the loss. Adding the same race's own lap pace as a hindsight feature would cut finishing-pair loss from 0.329 to 0.267, so a large share of the error is strategy, reliability and safety cars. Improving the rating layer alone does not improve the forecast, because the heads already extract what the Elo dynamics extract. These results do not establish an irreducible loss floor; they establish what this search achieved.

## Reproduce

```bash
npm run verify:exam                                   # the exam is identical across every search draw
npm run research:backbone                             # parallel search of the core's settings
npm run research:gate                                 # score a candidate on the held-out window
node tests/test-elo.mjs                               # head fixtures, no look-ahead, symmetry, backtest parity
```

The heads' fixtures are in `research/inference-fixtures.json` and the frozen results in `research/final-results.json`. The head designs are refitted by `packages/research/python/finalize-state-space.py` (see [state-space.md](state-space.md)) using `packages/research/python/heads.py`.
