# Hill climbing the state-space ratings against the evaluation harness

> **Archived (first hill climb).** Not part of the current model. The scripts named below were removed from the repository; they are at the tag `archive/pre-tidy-2026-10-14`. The current model and metrics: [../detach.md](../detach.md), [../metrics.md](../metrics.md).


What was asked: lower the pooled ratings-alone log-loss P (race and qualifying, 2002–2011) while driving the structural deficit D from 1.0 to 0.4 or below, accept a step only if every hard gate holds, and let predictive loss win over structure. The rule, the formulas and the gates were written and committed before any candidate ran (`research/eval/history/ACCEPTANCE-hill-climbing-1.md`, with seven dated amendments); every candidate is in `research/eval/history/hill-climbing-1-log.jsonl`.

> **Superseded as the measure of structure.** The D of this climb has terms a model can satisfy by freezing its ratings, and targets that are not "like a driver whose team did not change". The second climb replaces it by a scorecard measured against a control group, with the floor a correct filter reads: [state-space-hill-climbing-2.md](state-space-hill-climbing-2.md). On that scorecard this climb's final point reads D2 0.529 (baseline 0.543) on 2002–2011 and 0.617 (0.633) on 2002–2015.

## The result, plainly

**It improves only the structure, and only one part of it, for free. It does not improve the forecasts.**

- The climb's final point (`tau` 0.05 → 0.0255, `winterC` 11.4 → 8.75, `sdNew` 20 → 15.4, `sdA` 5 → 3.3, plus the error-bar scale below) lowered P by 0.0003 on 2002–2011, which is inside the exam's noise floor (0.0005), and **cost 0.0009 on 2012–2015**, the window nothing was selected on. It failed four of the six pre-registered confirmation criteria and **was not shipped**: the settings, the fit file and the forecast heads are the ones the project had.
- D on the full run (2000–2015 events) went from 1.00 to 0.56 for that point, against a goal of 0.4. Of the 0.44, **0.24 is the calibration of the error bars** (squared standardised revision 8.8 → 1.1), 0.11 the mover step excess, and 0.09 leak and frozen slope together; the last two terms moved inside their confidence intervals. The climb itself read D = 0.41 on the 2000–2011 events it could see: the structural gains it found there did not carry to 2012–2015 (0.41 → 0.56).
- **What is shipped:** `varInfl = 7.88`, a scale on the variance the race filter reports, fitted on 2002–2007. It changes no rating, no forecast, no multiplier and no loss (every predictive and forecast number of the harness equals `baseline.json` to 1e-7) and it puts the 6-race revision test at z² = 1.12 [0.90, 1.32] (was 8.84) and the share of revisions inside the 90% bar at 0.89 (was 0.41) on the whole of 2000–2015. It is a statement about the real data: on the v1 synthetic worlds, which obey the filter's assumptions, the scaled bars are too wide (truth inside the 90% bar 0.97).
- Simulator v2 was built and calibrated. It passes most of the realism checks and fails the lap-pace fallback and retirement-snapshot sources and the teammate loss, so by the rule set for it **it was not used to judge any change**. Its recovery numbers are shown as information only.

## Predictive scorecard: the shipped baseline and the climb's final point

Ratings alone, same observations and weights, weighted log-loss, multiplier fitted on 2002–2007 and not refitted. Baseline → final point (difference). The final point was run with the project's own pipeline: `state-space-calibrate.mjs` for the multiplier, forecast heads refitted on its ratings (`export-state-space-rows.mjs --through 2015`, `finalize-state-space.py`). Report: `research/eval/history/final.txt`; comparison: `final-vs-baseline.txt`.

| Window | Pairs | Race | Qualifying | Combined |
| --- | --- | --- | --- | --- |
| 2002–2007 (fit window) | all pairs | 0.3837 → 0.3836 (−0.0001) | 0.4042 → 0.4042 (0) | 0.3862 → 0.3861 (−0.0001) |
| | teammates | 0.6007 → 0.6012 (+0.0004) | 0.6204 → 0.6204 (0) | 0.6031 → 0.6035 (+0.0004) |
| | other cars | 0.3096 → 0.3093 (−0.0003) | 0.3293 → 0.3293 (0) | 0.3120 → 0.3117 (−0.0002) |
| 2008–2011 | all pairs | 0.3918 → 0.3913 (−0.0005) | 0.3540 → 0.3540 (0) | 0.3877 → 0.3872 (−0.0005) |
| | teammates | 0.6118 → 0.6089 (−0.0030) | 0.5759 → 0.5759 (0) | 0.6079 → 0.6053 (−0.0026) |
| | other cars | 0.3221 → 0.3224 (+0.0003) | 0.2853 → 0.2853 (0) | 0.3181 → 0.3183 (+0.0002) |
| **2012–2015** | all pairs | 0.3657 → 0.3667 (**+0.0010**) | 0.3650 → 0.3650 (0) | 0.3656 → 0.3665 (**+0.0009**) |
| | teammates | 0.6343 → 0.6346 (+0.0004) | 0.6219 → 0.6219 (0) | 0.6329 → 0.6332 (+0.0003) |
| | other cars | 0.2864 → 0.2876 (+0.0012) | 0.2848 → 0.2848 (0) | 0.2862 → 0.2873 (+0.0011) |

Pooled over 2002–2011, P went 0.386932 → 0.386654 (−0.0003, below the 0.001 a predictive win needs). The qualifying filter was not changed (nothing moved there that a gate let through).

Forecast layer, log-loss, heads trained on earlier years (baseline: the shipped heads; final point: heads refitted on its ratings):

| Window | Race-day | Thursday | Qualifying head |
| --- | --- | --- | --- |
| 2008–2011 | 0.3371 → 0.3375 (+0.0004) | 0.3819 → 0.3823 (+0.0003) | 0.3492 → 0.3490 (−0.0002) |
| 2012–2015 | 0.3252 → 0.3254 (+0.0002) | 0.3595 → 0.3605 (**+0.0010**) | 0.3617 → 0.3623 (**+0.0006**) |

Calibration and walk-forward: race calibration slope out of the fit window 1.005 → 0.979 (qualifying 1.009, unchanged), expected calibration error 0.0088 → 0.0057; walk-forward loss (multiplier refitted each year) race 2008–2011 0.3925 → 0.3922, **2012–2015 0.3658 → 0.3668 (+0.0010)**. The race multiplier moved 0.996 → 1.109: the ratings became less sharp, and the fit window set the multiplier to make up for it.

### The confirmation, against the criteria written before it (Amendment 6)

| # | Criterion | Final point | |
| --- | --- | --- | --- |
| 1 | ratings alone, combined, not worse than baseline by more than 0.0005 in any window and pooled 2008–2015 | 2002–07 −0.0001, 2008–11 −0.0005, **2012–15 +0.0009**, pooled 2008–15 +0.0002 | **fails** |
| 2 | forecast layer: race-day, Thursday not worse by more than 0.001, qualifying head by more than 0.0005 | Thursday 2012–15 **+0.0010 (0.00101)**, qualifying head 2012–15 **+0.0006** | **fails** (both by a hair) |
| 3 | no window, session or pair type worse by more than 0.002 | worst cell +0.0012 (2012–15, other cars, race) | holds |
| 4 | calibration slopes within 0.95–1.05; walk-forward not worse by more than 0.0005 | slopes 0.979 / 1.009; walk-forward race 2012–15 **+0.0010** | **fails** |
| 5 | structure not regressed (qualifying, model-free car-shock leaks, rookie bias) | unchanged / ≤ +0.006 / −0.0293 vs −0.0284 | holds |
| 6 | truth-based recovery on baseline-dynamics synthetic worlds: leak not worse by more than 0.03, errors not worse by more than 5% | errors 16–17% lower; in-season leak 0.058 → 0.092 (**+0.035**, ±0.06) | **fails** |

Four failures, so the settings were reverted. The numbers are small. None of them is a catastrophe, and the 2012–2015 window has only 77 weekends: it is evidence that the in-sample gain is not real, not that the point is bad. That is the whole finding about P: a coordinate search on 2002–2011 found −0.0003 in sample and +0.0009 out of it.

## Structural scorecard

D = mean of four terms, each 1 at the baseline and 0 when fixed (`ACCEPTANCE-hill-climbing-1.md`). The climb could not read 2012–2015, so it computed D on the 2000–2011 events (Amendment 1); the confirmation reads all of them.

| Term (input) | Baseline, 2000–2011 | Final, 2000–2011 | Baseline, 2000–2015 | Final, 2000–2015 | Shipped (varInfl only), 2000–2015 |
| --- | --- | --- | --- | --- | --- |
| d1 stayer leak (slope, 5 races) | 0.77 (0.100) | 0.61 (0.079) | 0.99 (0.128 [0.019, 0.241]) | 0.81 (0.105 [−0.017, 0.213]) | 0.99 |
| d2 frozen-rating slope of movers (5 races) | 0.80 (0.46) | 0.61 (0.56) | 1.01 (0.346 [0.135, 0.710]) | 0.84 (0.438 [0.182, 0.894]) | 1.01 |
| d3 error bars (z² of the 6-race revision) | 0.96 (8.12) | 0.01 (0.98) | 1.00 (8.84 [7.08, 10.40]) | 0.06 (1.13 [0.84, 1.41]) | 0.05 (1.12) |
| d4 mover step at 1 race, ratio to stable drivers | 0.88 (2.74) | 0.40 (2.33) | 1.00 (2.84 [2.21, 3.76]) | 0.55 (2.46 [2.00, 3.16]) | 1.00 |
| **D** | **0.853** | **0.406** | **1.000** | **0.563** | **0.763** |

Only d3 moves beyond its interval, and it moves because a reporting scale was fitted: the filter's error bars are tempered by the same `tau` that makes it forecast well, which also makes them about 2.8 times too narrow. d1, d2 and d4 improve in the climb's own window by amounts the confidence intervals (about 70 movers, 45 lineup changes) cannot distinguish from noise, and about half of the improvement is gone on the full run. Other race numbers of the final point on the full run, baseline → final:

| | Baseline | Final point |
| --- | --- | --- |
| share of driver revisions inside the 90% bar | 0.41 | 0.86 |
| car squared standardised revision / inside the bar | 11.1 / 0.35 | 2.4 / 0.73 (car bars are still narrow) |
| efficiency, driver / car (0 = updates unpredictable; positive = reacts too slowly) | 0.030 / 0.018 | 0.058 / 0.095 (**the filter now reacts too slowly**) |
| model-free car-shock leak, winter unchanged / joined / in-season | 0.046 / 0.068 / 0.033 | 0.050 / 0.068 / 0.039 |
| estimate-based car-shock leak, winter unchanged / in-season | 0.074 / 0.113 | **0.116 / 0.194** (the T null reads 0.15 / 0.24, the S null 0.13 / 0.09) |
| rookie first-5 bias / slope | −0.028 / 1.16 | −0.029 / 1.25 |
| frozen duel loss of movers (5 races) / the filter's own online forecast | 0.730 / 0.631 | 0.714 / 0.632 |

Two regressions are worth stating: the filter became slower (a positive efficiency means its next revision is predictable from the last), and the estimate-based leak of the car into the driver's rating rose in-season and over unchanged winters, while the model-free version, which a model that never moves its cars cannot hide, is flat. A smaller `tau` makes the ratings smoother and the driver level a little more stable, and with it the car level a little more able to absorb team-wide shifts.

## What the climb did

Settings: `tau`, `thetaT`, `mPace`, `mPart`, then `sdJ`, `sdA`, `rhoA`, `sdNew`, `winterC`, `raceC`, `yearD`, and `sdC`, `rho`, `sdD`, race and qualifying separately, multiplicative steps as in `state-space-fit.mjs`, each step run through the gates on 2002–2011 (cheap harness run, boot 50) and the forecast layer. 163 candidates were logged: 154 rejected, 4 would-be-accepted scans, 4 accepted, plus the reference and the confirmation.

**The specified coordinate search accepted nothing.** In its first 42 evaluations (race phases 1–3, qualifying phases 1–2) two steps met the margins on P and D (`tau` ÷1.4: P −0.0004, D −7%; `mPace` ÷1.5: P −0.0004, D −4%) and both were stopped by the forecast-layer gate, which with the shipped heads read +0.0001 on the qualifying head (Amendment 2 below). The others lowered P by 0.0002–0.0004 and were below the 0.0003 margin (`winterC`, `raceC`, `yearD`, `sdNew`) or cost more than 10% of D, which they could not make up. The qualifying filter is flat: every step moved P by at most 0.0001 and no step moved D (D is a race number).

What was accepted, and in what order, with the amendments that made it possible:

| Step | Change | P | D (2000–2011) | Rule |
| --- | --- | --- | --- | --- |
| 55 | `varInfl` 1 → 7.88 (reported error bars only) | 0.386932 (unchanged) | 0.853 → 0.616 | P tied, D −28% |
| 62 | `tau` 0.05 → 0.0357 (`varInfl` re-fitted to 6.0) | 0.386574 | 0.586 | P −0.00036 |
| 96 | compound of `winterC` 11.4 → 8.75, `sdNew` 20 → 15.4, `tau` → 0.0255 | 0.386595 | 0.455 | P tied, D −22% |
| 106 | `sdA` 5 → 3.33 | 0.386654 | 0.406 | P tied, D −11% |

- **Amendment 2:** the forecast-layer gate was first evaluated with the shipped heads, which were fitted on the shipped ratings and are stale for any candidate that moves them. Refitting heads takes 30 s and reproduces the shipped forecast layer to 1e-8, so the gate was moved to refit heads. This was done after four candidates (`tau` 0.0357, 0.0255, 0.0182 and `mPace` 17) had failed it by 0.0001 to 0.0005 on the qualifying head, and the table of stale and refit figures is in the amendment. Without it nothing but the error-bar scale would have been accepted.
- **Amendment 4:** compound steps. A step that moves P by less than 0.0003 and D by less than 10% is rejected however many of them point the same way. After a phase stopped, the single steps judged against the current point that cost less than 0.0003 and lowered D were combined (the combination and each prefix are ordinary candidates). Step 96 is the only compound; steps 55, 62 and 106 are single. **This extension produced the P-tied D gains that did not generalise.** The first confirmation run, which by mistake lacked `winterC` and `sdNew` (the two settings of step 96 that the single steps did not carry; see the process notes) and had `tau` 0.0255, `sdA` 3.33 and `varInfl`, passed every criterion; adding those two settings turned it into the final point that fails. That is two runs, not an experiment, but it points at `winterC` and `sdNew`.

Negative results (all judged at the point they were tried; the full numbers are in the log):

| Tried | Result |
| --- | --- |
| `thetaT` ×1.4 / ÷1.4, `mPart` ÷1.5, `rhoA` ±0.05, `raceC`, `yearD`, `sdC`, `rho`, `sdD` | no step either lowered P by 0.0003 or lowered D by 10% at tied P. `yearD` 3.85 → 5 lowers d4 from 0.88 to 0.40 and costs +0.0005 to +0.0006 in P (gate G1 fails at the original point) |
| `mPace` 25.6 → 38.4 | P +0.0008 to +0.0014 (gate fails). ÷1.5 lowers P by 0.0004 and D by 4% (qualifying head +0.0001 with refit heads: gate fails) |
| qualifying: every setting | |ΔP| ≤ 0.0001 and gates G3/G5 fail for `sdJ` ×1.5 (teammates +0.0032) and `raceC` ÷1.3; nothing accepted |
| lineup-specific **extra** car variance at an arrival (`sdCL`, TODO step 3) | makes d1 worse: 0.60 → 0.63 (sd 3 points), 0.78 (sd 10), 1.02 (sd 32) and costs P up to +0.0016. More room for the car to absorb a team-wide surprise gives the stayer more of it, not less |
| lineup-specific **less** car variance (`carShrinkL`) | lowers the leak (d1 0.60 → 0.57, 0.53, 0.47 at factors 0.8, 0.6, 0.4) and costs P +0.0002 to +0.0011. d2 (frozen slope) does not move at all (0.59–0.62) |
| `tauWet` (wet weekends teach less or more) | ×0.25, ×0.5, ×0.7, ×1.4: P +0.0001 to +0.0014 in every case. Wet races carry as much information per pair as dry ones |
| variance folded into the forecast (`varInflPred`) | ×0.25 … ×2.5: P within −0.00006 and +0.0002; the variance-aware probability does not improve with a "calibrated" variance (the multiplier absorbs it) |
| `tau` alone, scanned | see the trade-off below |

The frozen-slope term (d2) is the stubborn one. No setting or structure tried moved it beyond 0.56 (slope), against a target of 0.9; on the synthetic nulls it reads 0.72–0.78 (S) and 0.93–0.95 (T). A mover's pre-move rating predicts his duel against the new teammate badly even where the filter is correct, and in a world where drivers also change when they move (the v2 worlds have a true change at a team move and a driver–car fit) it should. Part of d2 may be real heterogeneity the harness's target does not allow for rather than something a better filter could remove.

## The trade-off between forecast loss and D

`tau` is the master knob: every D term falls as it falls and P rises. Scanned alone on the baseline settings with the error bars re-calibrated (d3 ≈ 0), and for the cut-timeline D:

| `tau` | 0.05 | 0.0357 | 0.0255 | 0.0182 | 0.0130 | 0.0093 | 0.0066 | 0.0047 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P − P0 | 0 | −0.0004 | −0.0004 | −0.0000 | +0.0007 | +0.0019 | +0.0036 | +0.0058 |
| D | 0.62 | 0.59 | 0.54 | 0.49 | 0.43 | 0.35 | 0.28 | 0.20 |

On this curve D ≤ 0.4 costs about +0.0012 of P (`tau` ≈ 0.011), more than the exam's noise floor and more than the 0.001 a win would have to be. The climb's final point has D = 0.406 on the same events at −0.0003: the other settings (`winterC`, `sdNew`, `sdA`) are worth about 0.0015 of P at that D in sample, and none of it held out (+0.0009 on 2012–2015).

## Guarding against gaming

Loss by slice, race, 2008–2015 (the full-run `predictive.slices`), baseline → final point:

| Slice | n | Loss | Calibration slope |
| --- | --- | --- | --- |
| by source: finishing order | 22 251 | 0.3780 → 0.3783 | 1.01 → 0.98 |
| lap pace (like for like) | 30 524 | 0.3668 → 0.3675 | 1.04 → 1.01 |
| lap pace (fallback medians) | 947 | 0.8247 → 0.8202 | 2.02 → 2.06 |
| retirement snapshots (`partial`) | 1 100 | 0.5877 → 0.5970 | 0.50 → 0.48 |
| dry | 47 563 | 0.3706 → 0.3705 | 1.04 → 1.02 |
| wet | 7 259 | 0.4326 → 0.4348 | 0.80 → 0.78 |
| variance tercile: low / mid / high | 18 275 each | 0.5034 → 0.4957 / 0.3144 → 0.3197 / 0.2692 → 0.2711 | 1.06 → 1.02 / 0.97 → 0.92 / 0.98 → 1.00 |
| link, former teammates / one shared teammate | 1 381 / 3 579 | 0.3195 → 0.3256 / 0.2910 → 0.2976 | 1.02 → 1.01 / 1.03 → 1.00 |
| link, two / three or more / not connected | 4 455 / 11 781 / 31 015 | 0.3027 → 0.3011 / 0.2916 → 0.2914 / 0.3088 → 0.3093 | 0.95 → 0.94 / 1.01 → 0.99 / 1.03 → 0.99 |

Nothing improves anywhere beyond noise; the weak slices of the TODO (wet, retirement pairs, movers, rookies) show no gain: wet +0.0022, `partial` +0.0093, movers' frozen duels −0.016 (0.730 → 0.714) with the filter's own online forecast of the same duels unchanged (0.631 → 0.632), rookies' first-five bias unchanged.

Truth-based recovery, race, 4 synthetic worlds (calendar through 2015) drawn from the **baseline** dynamics, baseline settings → final point (mean over worlds):

| | v1 worlds | v2 worlds (information only, not used) |
| --- | --- | --- |
| recovery error, driver / car (points) | 15.1 / 15.2 → 12.8 / 12.5 | 21.3 / 32.7 → 17.8 / 27.0 |
| truth inside the 90% bar, driver / car | 0.56 / 0.56 → 0.95 / 0.96 | 0.43 / 0.29 → 0.85 / 0.68 |
| forecast error of the gap, teammates / other cars | 20.4 / 24.7 → 17.2 / 21.0 | 29.3 / 59.3 → 24.7 / 50.6 |
| leak against the TRUE car swing: winter unchanged / joined / in-season | 0.122 / 0.122 / 0.058 → 0.124 / 0.100 / 0.092 | 0.164 / 0.087 / 0.237 → 0.161 / 0.073 / 0.217 |
| share of a true winter car swing the car estimate captures | 0.83 → 0.62 | 1.58 → 1.22 |

So the gain in the simulated worlds is real recovery (smoother ratings are closer to the truth when the truth is a stationary random walk), not the car or the driver absorbing the split: the truth-based leak does not rise (except in-season on the v1 worlds, by 0.035 ± 0.06). It is exactly what a small `tau` should do in a world that obeys the filter's assumptions, and it is what the real data did not reward in 2012–2015.

## Simulator v2

`syntheticWorld(..., { version: 2 })` (opt-in; v1 and its tests are unchanged). On the real calendar it simulates: per-lap lap times from true pace, tyre age, fuel burn, traffic, pit stops and a stint-and-lap pace offset that wanders; the grid (qualifying plus noise) deciding the early order; car reliability and driver incidents with the real distribution of retirement laps, slow laps before a retirement, rookies and the wet raising the incident rate, and failure rate correlated with pace; rain (the calendar's wet flags) with a per-driver wet skill, a narrower pace spread and more noise; strategy and safety-car luck shared by a team's cars and a driver's own weekend form; a race and a qualifying session that share their latent world (correlated, not equal); career curves, rookie learning, development steps of cars in season (upgrades, not only a random walk), a number-one driver effect, a persistent driver–car fit and a true change at a team move. The observations are then **built by the exam's own code** (`buildRaceObservations`, `parseLapPace`, `buildQualObservations`, the weights of `elo-core.js`) from the simulated results, lap files and snapshots, so `finish`, `paceW`, `pace`, `partial` and `qual` observations come out of simulated events, not of a derived ranking.

Its free noise parameters were calibrated (`packages/research/node/simulation-calibrate.mjs`) so that the shipped filter forecasts the world the way it forecasts the real data in 2008–2011. The comparison, mean and range over 6 worlds, race (the real column is computed from the real results of the same weekends; the full table, qualifying and the likelihood-weight scan are in `docs/evaluation.md`):

| | Real 2008–11 | v2 worlds | |
| --- | --- | --- | --- |
| ratings-alone loss, all pairs | 0.3918 | 0.388 [0.323, 0.450] | passes |
| loss, finishing order | 0.3918 | 0.388 [0.322, 0.450] | passes |
| loss, lap pace (like for like) | 0.3723 | 0.395 [0.336, 0.454] | passes (0.02) |
| share of o = 1, finish / lap pace / retirement snapshots | 1.00 / 0.82 / 0.21 | 1.00 / 0.81 / 0.22 | passes |
| calibration slope, finish / lap pace | 1.00 / 1.06 | 1.06 / 1.02 | passes |
| loss, dry / wet | 0.3794 / 0.4507 | 0.376 / 0.445 | passes |
| best likelihood weight (shipped 0.05) | 0.025–0.05 | 0.025 | passes |
| qualifying: loss, slope, best likelihood weight (shipped 0.07) | 0.354, 1.06, 0.1 | 0.365, 1.01, 0.05 | passes |
| loss, lap-pace fallback (`pace`) | 0.804 | 0.433 [0.304, 0.528] | **fails** |
| loss and slope, retirement snapshots (`partial`) | 0.448, 0.73 | 0.626 [0.53, 0.72], 0.52 | **fails** (about 500 pairs, 20 events a world) |
| teammate pairs | 0.612 | 0.536 | **fails** |
| calibration multiplier (fitted on 2002–2007) | 0.996 | 0.928 | off by 0.07 |

**v2 therefore does not pass its own checks.** Two of the real data's small sources are not reproduced (the `pace` fallback pairs are much worse in the real data than anything the simulator produces, its `partial` pairs are worse than the real ones) and real teammates are less predictable than any simulated driver spread that is not close to zero, which is the single most important thing it does not capture (the calibration drove the driver spread to a fraction of the filter's prior). By the rule in the TODO it was not used to select or reject anything, and the v2 baseline run was not committed next to the v1 baseline. The v1 worlds, which the harness uses, are untouched.

## Process notes, deviations, mistakes

- **Cut timeline.** To keep 2012–2015 unread while climbing, `climb.mjs` cut the timeline at 2011 before any filter ran (the filters are forward-only, so 2002–2011 numbers equal the full run's: candidate 0 reproduces `baseline.json` to 1e-6). D was therefore computed on the 2000–2011 events: D0 = 0.853, not 1.0 (Amendment 1). The same amendment replaced the calibration gate (the shipped qualifying slope is 1.059 on 2008–2011 alone, outside 0.95–1.05) by one relative to the reference.
- **The confirmation was read twice, and the first read was of the wrong model.** A transcription slip left `sdNew` and `winterC` at their old values in the preset, so the first confirmation (`research/eval/variant-first-confirmation*.txt`, log line `CONFIRM-A`) was of `tau` 0.0255, `sdA` 3.33 and `varInfl` 4.953 only. That variant passed every criterion (2012–2015 ratings alone +0.0004, Thursday +0.0006, qualifying head +0.0003). It was not what the climb selected, so it was not shipped, and which model to confirm was fixed before the second run; but it was shipped for one commit (`218d6e0`) and reverted in the next, and it is the best evidence in this work that the three-setting compound of step 96 is where the out-of-sample cost came from. The rule "touch 2012–2015 exactly once" was not kept; Amendment 7 says so.
- **A third, mechanical run.** The shipped state (`varInfl` only) was run through the harness once more to verify that it equals the baseline's predictive and forecast numbers to 1e-7 (it does, 21 rows differ at the 1e-8 level, which is a Node/platform difference with the committed `baseline.json`, and the error-bar rows that were meant to change).
- **`state-space-calibrate.mjs` prints a 2016-onward line** whenever it runs (the project's own script). It ran twice for the final point. The first run's output showed that line (the combined loss read 0.4000, as in `docs/state-space.md`); nothing was decided on it.
- **The forecast gate changed** (Amendment 2, above); the compound extension (Amendment 4) and the `tauWet` candidate (Amendment 5) were added after the first pass. Candidates 1–42 are the specified procedure; everything after is labelled in the log (`ph`).
- **Golden hashes.** `tests/golden.json` does not reproduce on this machine at the project's starting commit, on Node 22 or on Node 24 (the Elo-only score differs in the last place on Node 22), including the Elo core this work never touches: the committed hashes come from another platform or Node version. `npm test` stops at the first test, so under Node 22 it stops at `golden.mjs` before the climb's changes are reached. The hashes were regenerated on Node 24.21 (CI's major) with `golden.mjs --update`: the Elo entries changed for that reason only; the state-space entry changed because `varInfl` changes the reported standard deviations. With Node 24 `npm test` and `npm run lint` pass. The `varInfl` change touches `latest.scale`, `ratings[].sd` and `predictions[].vari` only when it is not 1.
- **New default-off options** in `packages/core/src/state-space/filter.js`: `varInfl` / `varInflPred` (uncertainty scales), `sdCL` / `carShrinkL` (car variance at a lineup change), `tauWet`. The harness's `stateSpaceRun` passes the weekend's wet flag to the filter. `ratingsAlone` (site what-if) reads `latest.scale` so that a probability folds in the forecast variance and a bar shows the reported one.
- **Not done:** a learned gain network (TODO step 3, last resort and only after the simulator work: the simulator did not pass, and the structure the climb could reach did not need it); a refit of `rhoA`, `shrinkM` beyond the steps listed; the qualifying filter, which no step improved.

## What to do next

- Keep `varInfl`. It is the only change that survived, it is free, and it is calibrated on 2002–2007 and holds out (z² 1.12 on 2000–2015). Car bars in the race are still about 1.6 times too narrow; a separate car scale (the car test has process noise the driver test does not) would fix that and was not tried.
- Do not lower `tau` for structure. The structural measures it improves are mostly inside their intervals and the forecast cost shows up out of sample. If a smoother filter is wanted, the evidence says to accept about 0.001 of P for D ≈ 0.4 knowingly, and to get there with `tau` alone rather than the compound.
- A realistic simulator is worth finishing: it needs the teammate-gap predictability and the `pace` / `partial` sources to match, and driver and car spreads that are not degenerate. Until then the harness's v1 worlds are the only nulls, and both of them say a smoother filter is right, which the real data does not.

## Reproduce

```bash
node packages/research/node/climb.mjs status                                  # the log's current point (the climb's final point)
node packages/research/node/climb.mjs eval --quiet                            # re-measure it (reproduces P 0.386654, D 0.4055)
node packages/research/node/climb.mjs search --sessions race --phases 1,2,3 --compound   # the search, from the log's point
node packages/research/node/climb-recovery.mjs --settings '{}' --world 1 --last 2015      # truth-based recovery
node packages/research/node/simulation-table.mjs                                     # the realism table of Simulator v2
npm run evaluate -- --model both --full --null 4 --boot 300 --set race.tau=0.0255102 --set race.winterC=8.7532 --set race.sdNew=15.3846 --set race.sdA=3.3333   # the final point's scorecard (shipped heads and fit are stale for it)
```
