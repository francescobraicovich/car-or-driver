# Detaching drivers from cars

The point of the ratings is to tell a driver's strength from his car's. The test that matters most is the hardest one: **a driver in a new car, forecast from the rating he had before the move, and nothing else.** This note records the model that came out of working on that test, why each part is there, what it fixed, what it did not, and every way it could be wrong. The rules were written and committed before the candidates ran ([research/eval/ACCEPTANCE-detach.md](../research/eval/ACCEPTANCE-detach.md), nine dated amendments); every candidate, accepted or not, is in `research/eval/logs`. The whole list of metrics is in [metrics.md](metrics.md), the study of what is still wrong in [diagnosis.md](diagnosis.md), and the same explanation, written for readers of the site, is the *Methodology* page.

## The plain answer

- **Forecasts of drivers in a new car, from their rating before the move, improved in every window and every test** (log-loss of the frozen duels; a coin scores 0.693; drivers who stayed score about 0.62). Against the new teammate over five weekends: 0.706 → 0.649 (2002–2011), 0.814 → 0.725 (2012–2015), 0.686 → 0.644 (2016+, second look). Pooled over 83 moves the teammate-duel gain is −0.053 [−0.084, −0.027] over five weekends and −0.031 [−0.052, −0.010] over ten (95% intervals, bootstrap over moves). Against the whole field the gain is −0.008 [−0.016, −0.001] over five.
- **It is still not clean.** A mover's frozen forecast deserves less confidence than a stayer's: calibration slope 0.84 (2002–2011), 0.30 (2012–2015) and 0.60 (2016+) against about 1.0 for stayers. In 2012–2015 the prior ratings of 15 movers forecast their duels worse than a coin flip does (0.725 against 0.693), driven by a few moves (Ricciardo to Red Bull in 2014 alone is 14% of the loss: a young driver who improved faster than any prior rating could say).
- **Ratings alone did not get worse; they got slightly better**, race and combined: 2008–2011 0.3877 → 0.3846, 2012–2015 0.3656 → 0.3639, 2016 onward 0.4007 → 0.3977 (second look). Qualifying is unchanged.
- **The model is a statement about the world, applied to every driver alike.** A driver's race skill is largely his qualifying skill (one lap, little noise from strategy or reliability, travels between cars). The race filter reads the qualifying filter. Nothing in the published rating looks at whether a driver moved.
- **Most of the measured gain comes from the retuned race settings, not from the link** (ablation below): the link adds about 0.003–0.014 to the strict teammate loss and 0.003 to the pooled 2008–2011 loss.
- **The structure scorecard**, with the published rating the portable level: D2 0.633 → 0.485 (to 2015). All four race terms improved, T1 included.

## A correction that shaped the method

An earlier version of this work scored movers with the harness's own frozen test and published the team-fit term inside the rating. Both were artifacts that let the rating adjust to a move: the harness reads a mover at his first weekend for the new team, **after** the filter has reset his old team-fit term for him (a step only movers take), and the published rating `D + A` jumped at the move (the mover swing got worse). The method was replaced: **a mover's prior rating is the rating a reader had before his last weekend for the old team, and nothing at or after the move is used for him** ([packages/research/node/mover-strict.mjs](../packages/research/node/mover-strict.mjs)), and the published rating is the portable level, so a team change moves nobody's rating.

A later study found a second flaw in the evidence: `syntheticWorld(…, 'race', …)` simulates only the race, so a first "truth recovery" test ran the linked filter on *real* qualifying results inside a simulated world. It is redone with both sessions simulated ([diagnosis.md](diagnosis.md)); the conclusion changed (below).

## What was wrong

Race and qualifying were two independent filters. Qualifying movers keep their rating (strict frozen slope 0.8 or better); race movers did not (0.43): a race rating built from finishing order, retirements and lap pace attributes part of the car to the driver. Two earlier hill climbs of the filter's own settings ([history](history/README.md)) found that the settings cannot buy this. Teammate differences within one car contain no car, and over the same car the slope of a driver's race gap to his teammate on his qualifying gap is 0.5–0.9 by season (correlation 0.6–0.9; `loading.mjs`, `research/eval/detach-loading.txt`). That is the information the independent race filter was throwing away.

## The model

`packages/core/src/state-space/qualifying-link.js`, `filter.js` (`ctx.offsets`, `ctx.carOffsets`, `rateA`), `build.js` (`runSession`: qualifying first, then race):

```
race strength of driver i in car c:   S = beta * Dq_i + D_i + A_i + C_c + gamma * Cq_c
published driver rating:               D_i + beta * Dq_i        (not A_i)
published car rating:                  C_c + gamma * Cq_c
```

`Dq`, `Cq` are the qualifying filter's levels (unchanged), read as known inputs; `D`, `C` are the race filter's own states, now the race-specific residual of the driver and the car; `A` is the driver's fit with the car he is in. Shipped: `beta` 0.4, `gamma` 0.3, `sdA` 12, `rhoA` 0.97.

1. **No look-ahead.** A forecast of weekend k reads qualifying through weekend k−1. The update with that weekend's results and the rating posted after it also read that weekend's own qualifying, set before the race. (Forecasting the race with the same weekend's qualifying scored better and was rejected: it uses the grid.) `tests/test-state-space.mjs` checks that the link is a no-op when off, that later qualifying changes no earlier forecast or posted rating, and that a common shift of the qualifying levels moves no gap.
2. **A driver–team fit term, internal.** `A` is zero when a driver arrives at a team and keeps whatever the data say about his fit with that car until he leaves (it fades by 0.97 per weekend); it is **not part of the published rating**. It exists so that what a driver does in one particular car is not absorbed by `D`. It is judged by what it does for `D`: on the strict test, with `A` internal the teammate duels of movers score better than with no `A` at all and better than with `A` published. In forecasts of an actual matchup it is used (it is part of how a driver does in his car); in what-if matchups across cars the published portable level is used.
3. **Retuned race settings**: `sdNew` 9.1, `tau` 0.0385, `winterC` 8.75 (the qualifying link carries most of a driver's level, so the race residual starts tighter and learns slower); `sdA` 12 (the larger fit improved the diagnostics of [diagnosis.md](diagnosis.md) and was the only candidate of the last grid that passed every gate); `varInfl` 8.55 (the 6-race revision test on 2002–2007, same procedure). The multiplier (0.9993) and what-if constants were refit by `state-space-calibrate.mjs`, and the forecast heads by `finalize-state-space.py` (accepted by its rule: race-day 0.3372, Thursday 0.3817 on 2008–2011, a tie with the previous heads).
4. **An option that is off.** Arrival adaptation (`STATE_SPACE.adapt`, `dip` 0; reference value 20 points, halving each weekend): a known offset after a team change. It removes most of the first-weekend shortfall of movers and lowers the pooled loss a little, but it is a prior keyed to a team change, it overshoots in weekends 2–3 and it does not help every period. Whether to ship it is a project decision.

## How it was chosen

- **First phase** (`research/eval/logs/detach-log.jsonl`, 106 candidates): gates on ratings-alone loss in every window and pair type, on calibration and on no-freezing guards, with 2012–2015 as a gate (not an objective) after the first search drifted to lower `tau` as both earlier climbs had. This fixed the link, the persistent `A` and the retuned settings.
- **Second phase** (`research/eval/logs/strict-log.jsonl`): objective = the strict prior-rating loss of movers against the new teammate and against the field, selection on moves of 2002–2011, gates as before. Settings turned out to be exhausted as a lever (one step accepted, inside the noise).
- **Third phase** (`research/eval/logs/suite-log.jsonl`; Amendments 8 and 9): after the diagnosis, the targets became the diagnostics of [metrics.md](metrics.md) with a pre-registered grid of candidates; `sdA` 8 → 12 was the only one to pass every gate.
- **What did not work**: lower `tau`/`winterC` alone (better in the years seen, worse in 2012–2015); the same-weekend qualifying (a leak); a walk-forward estimated `beta`; a persistent team-fit in qualifying; variants of the qualifying filter as the source; no team-fit term at all; career curves; variance-aware forecasts; a lower weight of the race-specific level in the published rating (`lambdaD`); larger `sdA` or `beta` than shipped (each breached a gate).

## Results

**Drivers in a new car, the rating from before the move only** (race; `strict-eval.mjs`, `strict-paired.mjs`; first 5 weekends at the new team; "before" = the filter before this phase; teammates = against his new teammate with the stayers' slope, field = against any other driver, new car as forecast before that weekend; timeline through 2023, so the 2012–2015 row differs by up to 0.01 from the suite's through-2015 convention used in [metrics.md](metrics.md)):

| Window of the move  | Teammate duels (moves) | Before → now    | Difference [95%]            | Field duels (moves) | Before → now    | Difference [95%]        |
| ------------------- | ---------------------- | --------------- | --------------------------- | ------------------- | --------------- | ----------------------- |
| 2002–2011           | 220 (32)               | 0.7064 → 0.6492 | −0.057 [−0.123, +0.004]     | 6176 (46)           | 0.3863 → 0.3757 | −0.011 [−0.023, −0.001] |
| 2012–2015           | 116 (15)               | 0.8144 → 0.7246 | −0.090 [−0.165, −0.033]     | 2949 (19)           | 0.3141 → 0.3092 | −0.005 [−0.025, +0.013] |
| 2016+ (second look) | 250 (31)               | 0.6860 → 0.6442 | −0.042 [−0.074, −0.015]     | 5675 (39)           | 0.3670 → 0.3582 | −0.009 [−0.018, −0.001] |
| **all**             | 609 (83)               |                 | **−0.053 [−0.084, −0.027]** | 15525 (110)         |                 | −0.008 [−0.016, −0.001] |

Ten weekends: teammates −0.016 [−0.054, +0.028] (2002–11), −0.068 [−0.131, −0.026] (2012–15), −0.028 [−0.058, −0.003] (2016+), −0.031 [−0.052, −0.010] pooled; field −0.006 / +0.002 / +0.001 / −0.002 (pooled interval includes zero). Calibration slope of a mover's frozen forecast, five weekends: 0.43 → 0.84 (2002–11), 0.07 → 0.30 (2012–15), 0.49 → 0.60 (2016+); stayers 0.95–1.05.

**Attribution** (`ablation-strict.txt`; strict teammate loss, mean of 5 and 10 weekends; windows 2002–11 / 2012–15 / 2016+ second look):

| | Teammate loss | Pooled loss 2008–11 / 2012–15 |
| --- | --- | --- |
| before (independent race filter) | 0.682 / 0.789 / 0.696 | 0.3877 / 0.3656 |
| retuned settings only, no link | 0.649 / 0.724 / 0.666 | 0.3878 / 0.3651 |
| link only, old settings | 0.664 / 0.767 / 0.679 | 0.3854 / 0.3660 |
| link + retuned, no fit term | 0.651 / 0.741 / 0.672 | 0.3836 / 0.3641 |
| **shipped: link + retuned + fit term** | **0.646 / 0.710 / 0.661** | **0.3846 / 0.3639** |

**Ratings alone, weighted log-loss, combined (race multiplier refit on 2002–2007; qualifying unchanged):**

| Window                    | Pairs           | Before          | Now                 |
| ------------------------- | --------------- | --------------- | ------------------- |
| 2002–2007 (fit)           | all             | 0.3862          | 0.3866              |
| 2008–2011                 | all / teammates | 0.3877 / 0.6079 | **0.3846 / 0.6075** |
| 2012–2015                 | all / teammates | 0.3656 / 0.6329 | **0.3639 / 0.6310** |
| 2016 onward (second look; data through 2026 round 17) | all / teammates | 0.4007 / 0.6022 | **0.3977 / 0.5981** |

**Separation scorecard** (`state-space-hill-climbing-2.md` definition, in [history](history/state-space-hill-climbing-2.md); race, lower is better; the published rating is the portable level; qualifying unchanged at 0.486), through 2015: D2 0.633 → 0.485 (race 0.780 → 0.484); T1 mover swing 0.79 → 0.60, T2 stayer swing 0.58 → 0.47, T3 stayer leak 0.70 → 0.33, T4 frozen transfer 1.05 → 0.54. The floors a filter that is exactly right on a world with no car in the driver reads (T3 ≈ 0.08, T4 ≈ 0.17 for the old dynamics, indicative only) are still well below T3 and T4. D2 is a diagnostic, not a target: it improved once when the strict forecasts got worse.

**Truth recovery on Simulator v2** (both sessions simulated, 4 seeds, race, to 2015; [diagnosis.md](diagnosis.md) explains why the first version of this table was invalid): rmse of the driver levels 21.2 → 16.8, of the car levels 32.9 → 33.2, teammate gap 29.0 → 27.7, leak against the true car swing 0.164 → 0.165. The retuned priors, not the link, improve the driver levels in that world; cars do not improve. The simulator lacks the real data's regulation and tyre effects, and gives race and qualifying skills a correlation (0.7 for drivers) that the real data may not.

**Guards** (race, through 2015). The search enforced the loss, calibration, efficiency, control-swing and mover-loss gates; the car-shock, rookie and walk-forward guards were read afterwards and all pass:

| Guard | Before | Now | Limit |
| --- | --- | --- | --- |
| walk-forward loss, race, 2008–2011 | 0.3925 | 0.3888 | ≤ +0.0005 |
| efficiency of drivers / of cars | 0.030 / 0.018 | 0.002 / **0.047** | ≤ +0.03 (cars: 0.048, **at its limit**) |
| calibration slope, race | 1.005 | 1.010 | 0.95–1.05 |
| rookie first-5 bias | −0.028 | −0.027 | abs ≤ +0.02 |
| car-shock leaks, model-free (winter unchanged / joined / season) | 0.046 / 0.068 / 0.033 | 0.055 / **0.095** / 0.033 | abs ≤ +0.03 (joined: 0.098, **at its limit**) |
| car-shock leaks, estimate-based (winter unchanged / season) | 0.074 / 0.113 | 0.095 / 0.125 | ≤ +0.03 |

## What can still be wrong

- **2016+ is not a clean confirmation.** It was read once for the first version of this model (a printout of `state-space-calibrate.mjs`, after the settings were fixed) and again as a second look for this one. 2012–2015 was a gate and was read by earlier climbs; it validates nothing. The claim that stands is: selected on moves of 2002–2011, gated on 2012–2015, improvement in the same direction in all three windows.
- **Few moves.** 83 moves with enough history. Single moves dominate a window. The pooled interval excludes zero; individual windows' intervals often do not. The remaining finding that movers' calibration slope is 0.30–0.84 (stayers about 1.0) is the honest size of what is not detached: a driver in a new car is forecast less well than one in his old car, partly real driver–car interaction, partly selection (drivers move to improving or declining teams), partly chance.
- **The settings are a local optimum under a rule.** `sdA` 12 passed the gates; larger values improved the movers' diagnostics and breached the gates on overall loss or on the guards. Two guards are at their limits.
- **Combined rating spread understated.** The race rating reads qualifying; the combined bar treats them as independent. Race car bars remain too narrow (squared standardised revision 2.7).
- **The learned filters did not help** ([history](history/neural-filter.md)). The link is a two-parameter version of what they tried to learn.

## Reproduce

```bash
node packages/research/node/suite.mjs --configs base,final                  # the metric suite for the baseline and the shipped model
node packages/research/node/strict-eval.mjs --last 9999 --configs base,final  # strict mover scores by window (2016+ rows: second look)
node packages/research/node/strict-paired.mjs --holdout                     # paired differences with move-level bootstrap
node packages/research/node/ablate.mjs                                      # retune only / link only / both
node packages/research/node/simulation-optimum.mjs                                 # truth recovery and oracle losses on Simulator v2 (both sessions)
npm run evaluate -- --model state-space --full --null 4 --boot 300                   # the full harness on the shipped model
bash research/eval/regenerate.sh                                            # all of the above, and the methodology page's figures
```

The ratings on the site are the shipped model, built once by `tools/build-model.mjs` (qualifying first, then the race filter reading it) and downloaded by the site as `data/model.json`.
