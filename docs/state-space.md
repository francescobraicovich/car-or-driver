# Joint state-space ratings

The ratings on the site come from a joint state-space model of driver and car pace. This note records what it is, how its settings were chosen, what it was compared against, and what was tried and dropped. The forecast layer (form trackers and probability heads) reads the same ratings (see "The forecast layer" below). The Elo-style model it replaced is described in [elo.md](elo.md) and is kept as an alternative.

## Summary

- **Ratings are the product; forecasts check them.** The test that matters is how well the ratings alone forecast each weekend, from earlier weekends only, on the same observations and weights as the Elo benchmark's exam. The state-space ratings beat the Elo-style ratings in every window. The test that matters most is the hardest one: a driver in a new car, forecast from the rating he had before the move ([detach.md](detach.md)).
- **Every rating has an uncertainty.** The model keeps a full covariance between drivers and cars, so the site shows error bars, and the Head to head page carries them into the probability. The race variances are scaled (`varInfl`) so that a driver's rating revises over six races by about as much as its bar says (see "Error bars" below).
- **The race model reads the qualifying model.** A driver's race strength is `beta` times his qualifying level plus his own race level; a car's likewise with `gamma`. Qualifying measures a driver more cleanly and his qualifying skill travels between cars ([detach.md](detach.md)).
- **The published driver rating is the portable level.** A driver's fit with his current car is a separate term that is used to forecast but not published, so a team change moves nobody's rating ([detach.md](detach.md)).
- **One rating system.** The forecast layer takes the state-space ratings as its rating inputs, so the Head to head forecast is built on the ratings the site shows. The retirement risks are the model's own hazard statistics; the circuit offsets and wet-weather skill of the what-if still come from the Elo benchmark's simpler tracks.
- **What it does not fix.** Drivers in a new car are still forecast worse than drivers who stayed, more so since 2012, and the model does not anticipate how much a mover falls short of his rating in his first weekend ([diagnosis.md](diagnosis.md), [metrics.md](metrics.md)).

## The model

Race and qualifying are two copies of the same filter (`packages/core/src/state-space/filter.js`). Each estimates, for every driver `D`, car `C` and a driver-car fit `A`, the strength `S = D + A + C`; the race filter adds the known qualifying levels, `S = beta * Dq + D + A + C + gamma * Cq` (`state-space/qualifying-link.js`). Levels drift (cars within a season and over the winter, drivers by season), a driver who changes team gets extra variance and his fit `A` restarts at zero, a team that only changed its name keeps its car (see "Team renames"), and each weekend's pairwise observations update the estimate through a weighted Bradley–Terry likelihood (an iterated extended-Kalman step that keeps the full covariance). The published rating of a driver is `D + beta * Dq`, without `A` (`rateA: false`). Equations, settings and the reason for each part are on the site's *Methodology* page, generated from the settings so they cannot drift from the code.

Observations are the exam's own (finishing order, like-for-like lap pace, retirement snapshots, qualifying pairs) with the exam's weights (`packages/core/src/observations.js`, `exam.js`). Weights that define the score are never searched, so no setting can win by changing the test. The filter's learning weights may differ from the scoring weights (the fit lets lap pace count about as much as finishing order, where the exam gives order 16 times the weight).

`buildStateSpace` (`packages/core/src/state-space/build.js`) first collects the exam (`state-space/exam.js`): the observations of every weekend with the weight each counts (`exam.js`), the retirement hazards known before it (`hazard.js`), the retirement audit and the skeleton of the snapshots. It runs the qualifying filter and then the race filter that reads it, fills every snapshot and history with the ratings and derives combined, effective and package pace from them, and then replays the forecast layer on the state-space levels (`state-space/replay.js`). Nothing in this path reads a rating of the Elo model; with `{ benchmark: eloBenchmark }` (`elo-benchmark.js`) the Elo model's ratings on the same exam are added next to the state-space ones, for the comparison. The rating-side inputs of the forecast layer are defined once, in `state-space/inputs.js`, which training, the build and serving all call.

Two numerical safeguards keep the update stable when a prior is widened (a takeover, a long winter, a new team). The covariance update overwrites `P` in place and reads columns of it, so it reads them from a copy taken before the update: otherwise later entries of a row used already-updated values, `P` could turn indefinite, and a car level could swing by thousands of points in two races. And an iteration of the Laplace step that would raise the negative log posterior (an overshoot, which happens when a wide prior meets saturated pairs) is halved until it does not. With both, car levels stay under 300 even with car priors widened to sd 1500 (`tests/test-state-space.mjs`).

## Settings and provenance

`packages/core/src/presets/state-space.js` holds the settings; `state-space-fit.js` (generated by `packages/research/node/state-space-calibrate.mjs`) holds the multipliers fitted on 2002–2007 (one per system and session, so the live diagnostics need no refitting) and the what-if constants fitted on finishing-order pairs of 2002–2015.

| Stage | Window | What | Script |
| --- | --- | --- | --- |
| Main settings | 2002–2007 | Coordinate search of 11 settings per session on the ratings-alone loss | `state-space-fit.mjs` |
| New-team settings | 2002–2011 | `sdJ`, `sdA`, `rhoA`, `shrinkM` (the race values were later changed, next row) | `state-space-fit.mjs --stint` |
| Rookie debut | 2002–2011 | `dipR`, `sdR`, `rhoR` (qualifying) | `state-space-rookies.mjs` |
| Cross-session link, driver-car fit, retuned race priors (`beta`, `gamma`, `sdA`, `rhoA`, `sdNew`, `tau`, `winterC`) | moves through 2011, with 2012–2015 as a gate | Candidates judged by the metric suite under a rule written before they ran ([../research/eval/ACCEPTANCE-detach.md](../research/eval/ACCEPTANCE-detach.md)); every candidate logged in `research/eval/logs` | `metric-suite.mjs`, `suite.mjs` |
| Multipliers and what-if constants | 2002–2007 / 2002–2015 | Calibration | `state-space-calibrate.mjs --write` |
| Reported error bars (`varInfl`, race) | 2002–2007 | One variance scale: the 6-race revision test at 1 | see "Error bars" |

The searches are coordinate searches with fixed multiplicative steps, so settings that never helped stayed at their starting values: these are good values, not proven optima. Two later hill climbs of the settings against structural scorecards found points that gained in the years they could see and lost on 2012–2015 and were not shipped ([history](history/README.md)); that is why 2012–2015 is a gate for any later change and not an objective.

`STATE_SPACE_FIT`: race multiplier 0.9993, qualifying 1.149 (Elo: 1.060 and 0.930). What-if stretch: 0.993 for different cars and 0.987 for teammates, wet ratio 0.754.

## Results

Ratings alone, same observations and weights, weighted log-loss (lower is better), multiplier fitted on 2002–2007 and not refitted:

| Window | Elo-style | State-space | Difference |
| --- | --- | --- | --- |
| 2002–2007 (fit window) | 0.4055 | 0.3866 | −0.0189 |
| 2008–2011 | 0.4018 | 0.3846 | −0.0172 |
| 2012–2015 | 0.3731 | 0.3639 | −0.0092 |
| 2016 onward (second look) | 0.4085 | 0.3977 | −0.0108 |

By pair type the gain holds in teammate duels (0.6159 → 0.5981 on 2016+) and in comparisons across cars (0.3368 → 0.3285), race and qualifying. The noise floor is about 0.0005. The state-space settings were fitted on 2002–2007 and the Elo's on 2008–2011, and it still wins on 2008–2011. The 2016-onward window was read once for an earlier version of the model: it is a second look, not an untouched test.

Drivers in a new car, the hardest test, are in [detach.md](detach.md) and [metrics.md](metrics.md). The full list of metrics with values and the best possible for each is [metrics.md](metrics.md).

## Early investigation (before the detachment work)

1. **Is the driver/car split identified?** Teammate pairs identify only within-team gaps; how a team-wide swing is divided between drivers and car is set by how much each is expected to change. In the Elo update the driver share of a shared swing was 13% on average (5% for a veteran in round 1, 21% for rookies). Measured leakage of car pace into driver ratings was small (about 0.06 driver points per true car point on synthetic data), and moves showed no inflation of ratings.
2. **A joint filter, with known answers.** On synthetic worlds with known drivers and cars, tuned fairly on forecast loss, the filter recovered driver pace 13–15% and cross-team gaps 13–15% more accurately than the Elo update, with roughly calibrated uncertainty (z² 1.2–1.3). With heavy-tailed noise it was worse and its uncertainty far too small (z² 2.6–2.8); capping each result's influence did not fix that.
3. **On real data, finishing order only,** with settings fitted on 2002–2007, it was not better than the Elo (+0.004 to +0.008 loss). The Elo also uses lap pace and retirement pairs, so this was a handicapped comparison.
4. **On the exam's own observations** (pace, retirements, qualifying included) it won: −0.010 to −0.014 on race and −0.009 to −0.011 on qualifying on 2008–2015, against the shipped and a re-tuned Elo. About half of the race gain came from letting lap-pace and retirement pairs count for more in learning, which the Elo cannot do (the exam-weights ablation keeps −0.005).
5. **New-team forecasts** were the weak point: with ratings frozen at a move, both systems forecast the duel with the new teammate only slightly better than a coin flip (calibration slope 0.43 for movers against 1.05 for stayers). Optimising directly for that loss, alone or mixed with the main score, improved the years it was fitted on and got worse on the years it was not (30 moves in the fit window), and a hill climb of the settings did the same ([history](history/README.md)). What changed this is structural, not a setting: the race model reads qualifying and a driver's fit with his car is kept out of his rating ([detach.md](detach.md)).
6. **The exam's pre-registered look at 2016 onward** of the model of that time ended in a rule that its candidate failed; the later work is governed by `research/eval/ACCEPTANCE-detach.md`.

## Error bars

The race filter's likelihood is tempered by `tau` because the pairs of a weekend are dependent, and that leaves its posterior variances too small: over six races a driver's rating revised by about 3 times the distance its bar said (squared standardised revision 9.1, 44% of revisions inside the 90% bar, before the scale). `varInfl` (8.55, race) multiplies the variance the filter **reports** (the sd of each rating and the pair covariance of the Head to head page) and nothing else: no rating, no multiplier and no forecast changes (`varInflPred`, the scale of the variance a forecast folds into its probability, stays 1; it was tried at 0.25 to 2.5 and none helped). It is the squared standardised 6-race revision of drivers on 2002–2007, so it is a calibration constant of the same kind as the multipliers. On the full run it reads 1.06 [0.80, 1.31] with 88% of revisions inside the 90% bar (2000–2015). Car bars in the race are still too narrow (squared standardised revision 2.7) and qualifying's were right and are untouched (`varInfl` 1). The bars describe how much the data constrain a level, not how well it transfers to another car: a mover's rating before a move carries almost the same bar as a stayer's ([diagnosis.md](diagnosis.md)). On the v1 synthetic worlds, which obey the filter's own assumptions, the scaled bars are too wide (truth inside the 90% bar 0.97): the scale describes the real data's revisions, not those worlds.

## Rookies

A rookie starts with no history, so the first races depend on the starting level. Levels have no absolute zero, so a "fixed" start only means something relative to the field; the shipped race start already sits about 25 points under the current field average.

Tried, with settings chosen on data through 2011 and checked on 2012–2015:

- **Start from the teammate** (the newcomer begins at the teammate's level, then learns the gap) and **teammate-only evidence** for the first five races (cross-team pairs down-weighted): neither beat the existing start. Forecasts in a rookie's first five races and duels against other teams got worse.
- **A deeper permanent start** helped the first five races and hurt races six to ten.
- **A fading debut dip** (temporary penalty that decays) fixed qualifying and is shipped for qualifying only (`dipR` 45, `sdR` 6.5536, `rhoR` 0.85, fitted on 2002–2011). For race pace a fitted dip did not hold up on 2012–2015, so it is off.

Drivers within their first five races are tagged "new" on the Ratings page.

```bash
node packages/research/node/state-space-rookies.mjs scan        # also scan2..scan4: start and anchor variants
node packages/research/node/state-space-rookies.mjs fit dip 2011
node packages/research/node/state-space-rookies.mjs report
```

## Team renames

The data gives a team a new constructor id when it changes its name, and the filter used to treat each id as a separate car: Racing Point became Aston Martin, Toro Rosso became AlphaTauri and then RB, and each restarted from a blank, average car with wide uncertainty and no history. The filter now takes a car identity (`ctx.carOf`, `carLineage` in `state-space/build.js`) from `lineage.js`: across the 11 renames in the data (Spyker 2006–07, Marussia 2012 and 2015, Racing Point and Alfa Romeo 2019, AlphaTauri 2020, Aston Martin and Alpine 2021, RB and Sauber 2024) the car carries on, winter drift included, exactly as if the name had not changed. A takeover (Jaguar → Red Bull, Honda → Brawn, Sauber → Audi, ...) still starts a fresh car, the rule the Elo core uses for the same reason (see "Rookies and team continuity" in [elo.md](elo.md)): carrying the car across takeovers cost 0.0013 on race 2002–2011, mostly 2009 (Honda → Brawn), 2005 and 2002. The same identity also merges the two ids under which some 2015 qualifying rows list Manor's drivers. Ratings, histories and every other output stay keyed by the id the team raced under. Driver team changes were already lineage-aware.

Effect on the ratings-alone exam (the table above is after the change): 2002–2007 −0.0002, 2008–2011 −0.0001, 2012–2015 −0.0008, 2016 onward −0.0001; by session the gains are in qualifying (−0.0013 on 2012–2015) and race 2012–2015 (−0.0007), with nothing worse than +0.0004 (qualifying 2008–2011). No setting was refitted; `state-space-calibrate.mjs --write` regenerated the multipliers.

## The forecast layer

The form trackers do not read ratings. The probability heads take six rating inputs (`baseline*`, `race_driver`, `race_car`, `qual_driver`, `qual_car`); these come from the state-space levels as forecast before each weekend (after the time update, before that weekend's pairs). The race baseline is the fitted slope on the gap, mixed with retirement risk; qualifying has no hazard mix; there is no circuit term (`state-space/inputs.js`).

The designs of the heads were not searched again: the selected ensembles (`research/selection.json`, the same designs as the Elo heads) were refitted on rows exported with the state-space inputs (`export-state-space-rows.mjs`, which also fails unless every non-rating column equals the Elo feature path row for row), for forecasts from 2008, 2012 and 2016 on data through 2007, 2011 and 2015. The acceptance rule was written before fitting (`research/state-space/ACCEPTANCE.md`): not worse than the Elo-input heads by more than 0.001 pooled, 0.002 in either window.

| Weighted log-loss | Window | Elo inputs | State-space inputs |
| --- | --- | --- | --- |
| Race-day (combined) | 2008–2011 | 0.3380 | 0.3372 |
| | 2012–2015 | 0.3262 | 0.3254 |
| Thursday (combined) | 2008–2011 | 0.3839 | 0.3817 |
| | 2012–2015 | 0.3615 | 0.3597 |
| Qualifying head | 2008–2011 | 0.3599 | 0.3495 |
| | 2012–2015 | 0.3672 | 0.3622 |

The heads are refitted whenever the ratings change (the table is for the shipped ratings). How they behave on the metric suite, including for drivers in a new car, is in [metrics.md](metrics.md) and `research/eval/heads-metrics.txt` (`npm run research:heads-metrics`).

```bash
node packages/research/node/export-state-space-rows.mjs                        # rows + invariance check -> research/state-space/pairs.jsonl
python packages/research/python/finalize-state-space.py [--ship] [--second-look]  # fit, acceptance rule, write state-space/forecast-heads.js
node tests/test-state-space-forecast.mjs                                       # fixtures and serving-vs-training parity
```

## Limits

- **Uncertainty is approximate.** Race driver bars are scaled to the revision test (above); race car bars are still about 1.6 times too narrow; with heavy-tailed noise bars were too small by more than half on synthetic data. The site says so beside the bars and shows ratings without decimals.
- **Drivers in a new car are the weak point of the ratings.** Forecast from the rating before the move, they are still less predictable than drivers who stayed ([detach.md](detach.md), [diagnosis.md](diagnosis.md)).
- **Cross-team driver comparisons are the weak point.** A teammate gap is known to roughly ±12, a cross-team driver gap to roughly ±18 in the finishing-order tests (from ±28 before any data); the production model also uses lap pace, so its bars are somewhat tighter.
- **Some inputs are not state-space.** The circuit offsets and the wet-weather skill added in a what-if come from the Elo benchmark's simpler tracks (`elo-benchmark.js`); they were not re-estimated against the state-space expectations. (The retirement risks are the model's own hazard statistics, `hazard.js`; they never depended on a rating.)
- **Cost.** A first load takes about 5 seconds longer than the Elo model (about 14 s against 8 s in headless Chrome), mostly the two filters, which now run one after the other (the race filter reads the qualifying one). Entities unseen for 100 weekends stop carrying correlations, which changes no reported number to four decimals and keeps the update fast.
- **The 2016-onward window is spent.** It was read for an earlier version of the model and again as a second look for this one; figures for it are labelled so and never used to choose anything.

## Reproduce

```bash
node packages/research/node/state-space-calibrate.mjs            # exam by window, multipliers, what-if constants (the race filter reads the qualifying filter)
node packages/research/node/state-space-calibrate.mjs --write    # regenerate presets/state-space-fit.js
node packages/research/node/suite.mjs                   # every metric of docs/metrics.md for the shipped model and the baseline
node packages/research/node/state-space-fit.mjs                  # a coordinate search of one session's settings WITHOUT the cross-session link
node packages/research/node/state-space-fit.mjs --stint          # (qualifying's settings come from here; the shipped race settings were chosen with the link, see the table above)
node tests/test-state-space.mjs                                  # filter, link, no look-ahead, forecast-layer invariants
bash research/eval/regenerate.sh                        # every output quoted in docs/ (about 20 minutes)
```
