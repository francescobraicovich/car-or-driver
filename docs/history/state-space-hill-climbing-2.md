# Second hill climb: a separation scorecard measured against a control

> **Archived (second hill climb).** Not part of the current model. The scripts named below were removed from the repository; they are at the tag `archive/pre-tidy-2026-10-14`. The current model and metrics: [../detach.md](../detach.md), [../metrics.md](../metrics.md).


The first climb (`state-space-hill-climbing-1.md`) optimised a deficit D whose terms a model could satisfy by not moving its ratings, and whose targets were not "like a driver whose team did not change". This climb replaces D by a scorecard in which **every term is measured relative to a control group**, keeps the predictive gates so that freezing the ratings cannot pay, and climbs it again. The rule was written and committed before any candidate ran (`research/eval/history/ACCEPTANCE-hill-climbing-2.md`, two dated amendments); every candidate is in `research/eval/history/hill-climbing-2-log.jsonl` (170 lines).

## The plain answer

- **Did the forecasts improve?** In the years the climb could see, yes by 0.001 (P 0.38693 to 0.38594, 2002–2011). In the years it could not, no: 2012–2015 is worse by **+0.0012** (limit +0.0005). Pooled over 2002–2015 the change is **−0.0002**, i.e. nothing. The point failed its confirmation (criteria 1, 2, 4 and 5 of `ACCEPTANCE-hill-climbing-1.md` Amendment 6), so **the settings were reverted and nothing was shipped.** Same outcome as the first climb.
- **Did the structure improve?** On the new scorecard, a little: D2 0.543 to 0.509 on the 2002–2011 events the climb saw, and 0.633 to 0.584 on the full 2002–2015 events (the gain is the same in the years the climb never saw, because it comes from a mechanical lever). The first climb's point scored 0.529 and 0.617 on the same scorecard: this one is better by 0.020 and 0.033 than that one, and better than the baseline by 0.034 and 0.049. All of these differences are of the size of the intervals (about 0.05 for D2).
- **Against what a correct filter can do, almost nothing.** A filter that is exactly right for a world with no dependence of a driver's strength on his team does not read the ideal either: it scores D2 about 0.31 (race) and 0.46 (qualifying) on 2002–2011. The race score of the climb's point moved up to that floor on the synthetic worlds as much as it did on the real data: the real-data excess over the floor went from 0.255 to 0.244 (2002–2011) and from 0.458 to 0.415 (2002–2015). Nothing here is a separation that was not there.
- **What the scorecard does show** is where the real separation problem is. Of the race excess over the floor, **76% is two terms**: the stayer's leak (T3) and the frozen transfer (T4). The mover and stayer swings (T1, T2) are close to what a correct filter reads. Qualifying is at its floor (excess 0.015) and no setting moved it past the gates.

## Why the old D was replaced, and what replaces it

| Old D | Problem |
| --- | --- |
| mover step against a target of 2.0 | not "movers swing like a control"; 2.0 is what a correct filter read on one synthetic null |
| error-bar calibration | a reporting scale (one constant fixes it); says nothing about the split |
| leak, frozen slope | improve when ratings freeze |

The new scorecard (`packages/research/node/separation.mjs`; everything is a function of the harness output and the events, no synthetic world needed):

| Term | Definition | Ideal |
| --- | --- | --- |
| **T1 mover swing** | mean over k = 1, 3, 5, 10 races of abs(ln R); R = rms step of drivers who changed team / rms step of the control | R = 1 |
| **T2 stayer swing** | mean over k = 3, 5, 10 of abs(ln R); R = rms step of the driver who stays when an established driver arrives / control | R = 1 |
| **T3 stayer leak** | mean over k = 3, 5, 10 of abs(slope) × sd(x) / control rms: how many control swings the stayer's rating moves because of **who** joined (slope = his step on how much stronger the newcomer is than the one he replaced) | 0 |
| **T4 frozen transfer** | mean over k = 5, 10 of abs(ln r); r = calibration slope of a mover's frozen pre-move rating against his new teammate / the same slope for teammates who stayed | r = 1 |

D_session = mean of the four, **D2 = mean of race and qualifying**. The control is the drivers in teams whose lineup did not change over the same weekends, net of how the field's centring moved (the harness's own `makeControls`). Guards that stop a model buying a score by freezing (G6 of the rule): the efficiency of drivers and of cars (can the next revision be predicted from the last: positive = reacts too slowly) may not worsen by more than 0.03, the control's own swing may not fall below 75% of the baseline's, and movers' duels must still be forecast online within +0.005; plus the loss gates of the first climb and the car-shock and rookie gates for both sessions.

## Baseline against the first climb against this one

Race ratings; qualifying did not move (every qualifying step that lowers its terms is refused by G3 on teammate pairs, G5 or G7: see below). Values are the terms (lower is better) with the raw reading behind T1 and T4 (mover swing ratio R at 1 and 5 races; frozen ratio r).

**2002–2011 (what the climb saw)**

| | Baseline | First climb's final point | This climb's final point |
| --- | --- | --- | --- |
| P (ratings alone, pooled) | 0.38693 | 0.38665 | **0.38594** |
| **D2** | 0.543 | 0.529 | **0.509** |
| D race / D qualifying | 0.621 / 0.465 | 0.592 / 0.465 | **0.553** / 0.465 |
| T1 mover swing (R at 1 race; at 5) | 0.712 (2.74; 1.80) | 0.674 (2.33; 1.70) | **0.585** (2.02; 1.63) |
| T2 stayer swing | 0.493 | 0.514 | **0.463** |
| T3 stayer leak | 0.535 | 0.498 | 0.500 |
| T4 frozen transfer (r at 5 races) | 0.741 (0.46) | 0.682 (0.51) | **0.665** (0.54) |
| qualifying T1 / T2 / T3 / T4 | 1.076 / 0.454 / 0.121 / 0.210 | same | same |

**2002–2015 (the full run, 2012–2015 included)**

| | Baseline | First climb's final point | This climb's final point |
| --- | --- | --- | --- |
| **D2** | 0.633 | 0.617 | **0.584** |
| D race / D qualifying | 0.780 / 0.486 | 0.749 / 0.486 | **0.683** / 0.486 |
| T1 mover swing (R at 1 race; at 5) | 0.792 (2.84; 1.98) | 0.775 (2.46; 1.93) | **0.657** (2.09; 1.78) |
| T2 stayer swing | 0.577 | 0.610 | **0.538** |
| T3 stayer leak | 0.701 | 0.673 | **0.629** |
| T4 frozen transfer (r at 5 races) | 1.050 (0.35) | 0.937 (0.39) | **0.907** (0.39) |

(`research/eval/history/hill-climbing-2-scorecard-cut.txt` and `-full.txt` hold the readings behind every term.)

## The floor: what a correct filter reads

The ideal of every term is R = 1, but a filter that is right for the world it is run on does not read 1: it is less sure of a driver in a new car, so each result moves him more. `separation-null.mjs` draws worlds on the real calendar from the baseline's own dynamics (drivers' strength does not depend on the team, apart from the jump and fading transient the baseline assumes), runs each candidate on them and scores the same terms. "Correct" is the baseline's settings with the likelihood weight tuned to the world.

| Race, mean of 4 worlds | D_session | T1 | T2 | T3 | T4 | mover swing R at 1 race | frozen r |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline filter | 0.366 | 0.656 | 0.376 | 0.161 | 0.270 | 2.71 | 1.13 |
| first climb's point | 0.351 | 0.681 | 0.384 | 0.114 | 0.226 | 2.43 | 1.12 |
| this climb's point | 0.309 | 0.571 | 0.311 | 0.113 | 0.242 | 2.14 | 1.15 |
| **correct filter** | **0.311** | 0.640 | 0.353 | 0.081 | 0.168 | 1.95 | 1.04 |
| *real data, baseline / this climb* | 0.621 / 0.553 | 0.712 / 0.585 | 0.493 / 0.463 | 0.535 / 0.500 | 0.741 / 0.665 | 2.74 / 2.02 | 0.46 / 0.54 |

(2002–2011. Qualifying: the correct filter reads 0.461 and all three points 0.450; the real data reads 0.465. Full 2002–2015: correct 0.290 race and 0.481 qualifying; `hill-climbing-2-floor-cut.txt`, `-full.txt`.)

Read it as: **the real-data excess over the floor** is `real − the same filter on the worlds`. Race, 2002–2011: baseline 0.255, first climb 0.241, this climb 0.244. Full: 0.458, 0.433, 0.415. The climb's gain in D2 is mostly the filter moving to what a correct filter reads (its own score on the worlds fell by 0.057, the real score by 0.068). What is left is almost all T3 and T4: on the full events the baseline's race excess by term is T1 0.17, T2 0.25, **T3 0.60, T4 0.81**; this climb's is 0.12, 0.27, **0.56, 0.70**.

- **T4, frozen transfer, is the clean signal of a driver rating that carries the car.** A mover's rating from before the move predicts his duels against his new teammate with a calibration slope about **0.4** of the slope for teammates who stayed (race, 2002–2015: 0.35 for the baseline, 0.39 here); on worlds where the driver's strength does not depend on the car it reads about 1. Qualifying reads 0.8, at its floor (0.84). Nothing in this climb's family moved the race number past about 0.6, and that only at the end of the `yearD` sweep, where P is 0.002 worse.
- **T3, the stayer leak,** says about **10%** of how much stronger the newcomer is than the man he replaced shows up in the stayer's rating (slope 0.10 at five races for the baseline; the climb brought it to 0.07). In control swings the term reads 0.5 to 0.7 on the real data against 0.06 to 0.16 on the worlds.

## What the climb did

170 lines: 163 rejected, 3 accepted, 2 would-be-accepted, the reference and its refit-heads twin. `climb2.mjs`, the same machinery as the first climb with D2 as objective: cheap run on the timeline cut at 2011, the gates evaluated on 2002–2011, the refit-heads forecast gate for any step that would otherwise be accepted.

1. **Coordinate search of the existing settings** (phases 1–3 and compound steps, both sessions, ids 1–53): **one accepted step**, race `tau` 0.05 to 0.0357 (P better by 0.0004, D2 worse by 0.005). Every step that lowered D2 by more than 0.02 either cost P (`yearD` up) or was refused by a gate (the car-shock leaks of G7, the car's efficiency of G6: `winterC` down, `yearD` up). The settings of the filter do not buy separation.
2. **A structural phase, pre-registered after step 1** (Amendment 1): a likelihood weight on the pairs of a recent mover (`mMover`, new, default off; the golden hashes did not change), `sdCL`, `carShrinkL`, `tauWet`. `mMover` is the lever aimed at T1 and T2: below 1, a driver's first 5 weekends after a move teach the filter less, so his rating swings less. Its sweep is the trade-off curve below. No single step reached the 10% in D2 the rule asks for at tied loss; hand-built combinations of the sweep's steps did: `mMover` 0.5 with `sdNew` 15.4 and `sdC` 35 (ids 93, adopted as 101) lowers P by 0.0003 and D2 by 0.048 at once.
3. **The coordinate search again from there** (ids 102–169): one more accepted step, race `tauWet` 0.714 (P better by 0.0003, D2 worse by 0.009, which rule 1 allows: predictive loss wins). Qualifying did not move.

**The trade-off curve** (race `mMover`, 2002–2011, the other settings as at id 3; P is the pooled score, "gate" the first one that refuses the step):

| `mMover` | P | D race | D2 | gate that refuses it |
| --- | --- | --- | --- | --- |
| 1 (id 3) | 0.38657 | 0.631 | 0.548 | |
| 0.8 | 0.38647 | 0.613 | 0.539 | none |
| 0.5 | 0.38659 | 0.565 | 0.515 | G7 car shock, season (0.146 against a limit of 0.143) |
| 0.35 | 0.38696 | 0.520 | 0.493 | G1 2008–2011, G5 walk-forward |
| 0.25 | 0.38748 | 0.474 | 0.469 | G1, G5 |
| 0.15 | 0.38849 | 0.400 | 0.433 | G1, G3 |

`yearD` (the setting that lowers D most) is steeper: 4.5 → D2 0.531 at P +0.0003; 7 → 0.475 at P +0.0015. Qualifying, `mMover` 0.15 or `sdJ` 0 take D_qual from 0.465 to 0.29 or 0.41 and cost only +0.0001 to +0.0005 of P, but +0.005 to +0.008 on teammate pairs (G3) and about +0.002 on the walk-forward loss (G5): **the pooled number hides it; the guards are what show it.** The curve says: D race 0.63 to 0.55 is free of loss in the years seen, below that every point of D costs P and the car-shock leak.

## Predictive scorecard, baseline against the first climb against this one

Ratings alone, weighted log-loss, multiplier fitted on 2002–2007 and not refitted. This climb's point was run with the project's pipeline: `state-space-calibrate.mjs`, heads refitted on its ratings (`export-state-space-rows.mjs --through 2015`, `finalize-state-space.py --ship`), then reverted after the confirmation.

| Window | Pairs | Session | Baseline | First climb | This climb | Δ this climb |
| --- | --- | --- | --- | --- | --- | --- |
| 2002–2007 (fit) | all | combined | 0.3862 | 0.3861 | 0.3852 | −0.0010 |
| | all | race | 0.3837 | 0.3836 | 0.3826 | −0.0011 |
| | all | qual | 0.4042 | 0.4042 | 0.4042 | 0.0000 |
| | teammates | combined | 0.6031 | 0.6035 | 0.6031 | 0.0000 |
| | other cars | combined | 0.3120 | 0.3117 | 0.3107 | −0.0013 |
| 2008–2011 | all | combined | 0.3877 | 0.3872 | 0.3867 | −0.0010 |
| | all | race | 0.3918 | 0.3913 | 0.3907 | −0.0011 |
| | teammates | combined | 0.6079 | 0.6053 | 0.6069 | −0.0011 |
| | other cars | combined | 0.3181 | 0.3183 | 0.3171 | −0.0010 |
| **2012–2015** | all | combined | 0.3656 | 0.3665 | **0.3669** | **+0.0012** |
| | all | race | 0.3657 | 0.3667 | 0.3671 | +0.0013 |
| | teammates | combined | 0.6329 | 0.6332 | 0.6346 | +0.0016 |
| | other cars | combined | 0.2862 | 0.2873 | 0.2873 | +0.0011 |
| pooled 2002–2011 | all | combined | 0.3869 | 0.3867 | 0.3859 | −0.0010 |
| pooled 2008–2015 | all | combined | 0.3763 | 0.3765 | 0.3764 | +0.0001 |
| pooled 2002–2015 | all | combined | 0.3794 | 0.3796 | 0.3792 | −0.0002 |

Forecast layer (heads refitted on each point; race-day / Thursday / qualifying): 2008–2011 0.33715 / 0.38195 / 0.34918 (baseline), 0.33733 / 0.38196 / 0.34886 (this climb); 2012–2015 0.32520 / 0.35948 / 0.36172 and 0.32584 / 0.36057 / 0.36236.

**Weak slices** (race, 2008–2015, baseline to this climb): wet races 0.4326 to 0.4350 (**+0.0025**, although `tauWet` was the step meant to help them), partial-race observations +0.0044, the pairs the model is least sure of (top tercile of the gap variance) **+0.0100**; the other two terciles improved by 0.003 and 0.007. Qualifying did not change.

## Did it freeze? The guards

| Race | Baseline | First climb | This climb | Guard |
| --- | --- | --- | --- | --- |
| control swing at 5 races (points) | 9.06 | 7.31 | **6.89** | at least 75% of the baseline (6.80) |
| mover swing at 5 races (points) | 18.0 | 14.1 | 12.3 | |
| efficiency, driver (0 = revisions unpredictable) | 0.030 | 0.058 | 0.033 | + 0.03 |
| efficiency, **car** | 0.018 | 0.095 | **0.050** | **+ 0.03: fails on the full run** (0.032) |
| movers' online duel loss, 5 races | 0.631 | 0.632 | 0.636 | + 0.005 |
| car-shock leaks, estimate-based (winter unchanged / season) | 0.074 / 0.113 | 0.116 / 0.194 | 0.078 / 0.121 | + 0.03 |
| rookie first-5 bias | −0.028 | −0.029 | −0.031 | |

**Both the controls and the movers swing less; the ratio improved more than the absolute swing did.** The filter is smoother overall (lower `tau`, fewer weight on a mover's pairs): the control fell by 24%, the movers by 32%. The guard held in the climb's years and refuses the point on the full run through the car's efficiency: the car rating reacts too slowly to what the next races show. That is the freezing signature the guards exist for, and the in-sample gate was not tight enough to see it.

## Confirmation (the pre-registered criteria, one run: `--model both --full --null 4 --boot 300`)

| # | Criterion | Result |
| --- | --- | --- |
| 1 | ratings alone, combined, not worse than +0.0005 in any window and pooled 2008–2015 | **FAIL**: 2012–2015 +0.0012; 2002–2007 −0.0010, 2008–2011 −0.0010, pooled 2008–2015 +0.0001 |
| 2 | forecast layer with refit heads, 2008–2011 and 2012–2015 (+0.001, qualifying +0.0005) | **FAIL** 2012–2015: Thursday +0.0011, qualifying head +0.0006 (race-day +0.0006 passes) |
| 3 | no window, session or pair type worse by more than 0.002 | holds (worst: teammates, race, 2012–2015, +0.0018) |
| 4 | calibration slopes in 0.95–1.05; walk-forward not worse than +0.0005 | slopes hold (race 0.993); **FAIL** walk-forward race 2012–2015 +0.0014 |
| 5 | structure not regressed (G6, G7, G8 on the full run) | **FAIL** G6 car efficiency +0.032 (limit +0.03); everything else holds |
| 6 | truth-based recovery on baseline-dynamics worlds | holds: driver error 15.1 to 13.3, car 15.2 to 14.0, leak against the true car swing 0.122 to 0.091 (winter unchanged), the other two no worse by more than 0.01 (`hill-climbing-2-recovery.txt`) |

Reported as the first climb's were: the full report `research/eval/history/final2.txt`, its comparison with the baseline `final2-vs-baseline.txt`, and the headline `final2-headline.json`.

Criterion 6 holds because the worlds are the v1 worlds where a smoother filter is simply right (the tuned likelihood weight there is 0.003): the recovery gain is the same smoothness that the real 2012–2015 data refuses. This is the second time it happens.

## Caveats and negative results

- **R = 1 is below what a correct filter reads.** The targets of T1 and T2 cannot be reached without making the filter less certain than it should be of a driver in a new car. The point of the first section stands: the old D's target of 2.0 was wrong, and so is any target of 1 as an ideal. The floor above is the honest reference, and by it nothing was gained that was not there.
- **Qualifying already reads like a correct filter** (excess 0.015), with the large mover swing (R about 3.9 at one race) that its fitted `sdJ` = 30 implies: real qualifying levels do change at a team change by that much. A target of R = 1 there contradicts the fit.
- **The gain of the first phase is the filter moving to the null's reading**, and the structural lever `mMover` is blunt: it makes the filter learn less from exactly the pairs it is least sure of. The slice that pays is the high-variance tercile (+0.0100).
- **2012–2015 is not an untouched window.** It was read repeatedly for the first climb and once more for this confirmation, and the pre-registration said so. The confirmation criteria are a sanity check; the in-sample gain not holding out is the second repetition of the same pattern, which is evidence about the procedure (lowering `tau` and the new-car variances improves 2002–2011 and not 2012–2015) rather than about this one point.
- **Selection:** 15 hand-built combinations (`ph` `explore`) were tried after the sweeps and two of them were accepted by the rule; all are logged. The log refuses to write the same candidate twice, so adopting #93 needed a different tag (id 101). Rule 1 let D2 worsen by 1.8% for the last step (`tauWet`): it does not count a D2 change smaller than the noise.
- **Not tried:** a change that targets T3 and T4 directly (a persistent driver–car term, a prior on a car's winter jump that depends on who signed), a higher `rhoA` with a larger `sdA`, and Simulator v2 for judging (it still fails the pace fallback, partial and teammate checks of `evaluation.md`).
- `state-space-calibrate.mjs` prints a 2016-onward line every time it runs (its own script; nothing was decided on it).
- `npm test` passes on Node 24 with the golden hashes unchanged (the new option is default off); `npm run lint` passes.

## What to do with it

- **Keep the new scorecard**, not the old D: it cannot be satisfied by freezing, it is read against a control, and it comes with a floor. Report D2 with its floor and the excess.
- **Do not lower `tau`, `sdNew` or the car variances for structure again**, and do not use `mMover`: the pattern repeated, and the one gain that holds out (the mechanical swing ratio of movers) is paid for in the pairs the model is least sure of.
- The question this scorecard asks of the next model is T3 and T4: a mover's rating must carry to a new car (race ratio about 0.4 now, 1 on a world without the car in the driver) and a newcomer's strength must not show up in the stayer's rating (10% now, 1% on the worlds). A tuning of the present filter did not move either; they probably need a different structure, not a different setting.

## Reproduce

```bash
node packages/research/node/climb2.mjs status                                       # the log's current point (id 134)
node packages/research/node/climb2.mjs eval --quiet                                 # re-measure it (P 0.385937, D2 0.5093)
node packages/research/node/separation-report.mjs --points baseline,prev-final,new-final --last 2011   # the scorecard of the three points
node packages/research/node/separation-null.mjs --seeds 4 --last 2011               # the floor
node packages/research/node/climb2.mjs search --sessions race,qual --phases 1,2,3,4 --compound          # the search, from the log's point
npm run evaluate -- --model both --full --null 4 --boot 300 --set race.tau=0.0357143 --set race.mMover=0.5 --set race.sdNew=15.3846 --set race.sdC=35 --set race.tauWet=0.714286   # the final point's scorecard (shipped heads and fit are for the baseline)
```
