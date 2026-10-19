# Second hill climb: acceptance rule for a relative separation scorecard

> **Note (tidy, 2026-10-14).** Paths in this record are as they were when it was written. The files it names as `research/eval/{climb,climb2}-log.jsonl`, `research/eval/final*.txt`, `hill-climbing-2-*.txt` and `ACCEPTANCE-hill-climbing-1*.md` are now in `research/eval/history/`, and `docs/state-space-hill-climbing-2.md` is `docs/history/state-space-hill-climbing-2.md`. The search scripts it names were removed from the repository once their conclusions were recorded; they are at the tag `archive/pre-tidy-2026-10-14`.

Written and committed **before any candidate of the second climb was run**. It replaces the objective D of the first climb (`ACCEPTANCE-hill-climbing-1.md`)
and keeps everything else: the loss gates, the refit-heads forecast gate, the acceptance rule, the procedure. Choices not fixed by the request are
marked **[choice]**. No change after a candidate has run except as a dated amendment at the bottom.

## What is being optimised, and why D was replaced

The goal is to tell a driver's strength from his car's. The first D had four terms (leak, frozen slope, error bars, mover step against a target of
2.0), and it had two faults:

1. **Its targets were not "relative to a control".** The mover-step target of 2.0 was what a correct filter reads on a synthetic null, not "movers swing
   like drivers whose team did not change"; the error-bar term was a reporting scale (a constant fixes it) and says nothing about the split.
2. **A model that does not let drivers move scores well on every such term.** Leak, step and frozen slope all improve when ratings freeze.

So the new scorecard (below) measures every term **against a control group**, and a set of **guards** keeps the model from buying a score by freezing:
the predictive gates (unchanged), a check that the control group itself still swings and that revisions are not predictable (efficiency), and a
check that movers' duels are still forecast as well as before.

**Control group:** drivers in teams whose lineup was identical at the two weekends compared, over the same weekends, net of how the field's centring
moved (the harness's `makeControls`). "Swing" = root-mean-square change of a rating over k races.

## The scorecard (per session; race and qualifying)

| Term | Definition | Ideal |
| --- | --- | --- |
| **T1 mover swing** | mean over k = 1, 3, 5, 10 races of `abs(ln R)`, R = rms step of drivers who changed team / rms step of the control | R = 1: a driver who changes team swings no more and no less than one who did not |
| **T2 stayer swing** | mean over k = 3, 5, 10 of `abs(ln R)`, R = rms step of the driver who stays when an established driver arrives / control | R = 1 |
| **T3 stayer leak** | mean over k = 3, 5, 10 of `abs(slope) * sd(x) / control rms`; slope = the stayer's step on how much stronger the incoming driver is than the one he replaced (points per point), sd(x) = spread of that gap | 0: who joined moves the stayer's rating by no control swings |
| **T4 frozen transfer** | mean over k = 5, 10 of `abs(ln r)`, r = calibration slope of a mover's frozen pre-move rating against his new teammate / the same slope for teammates who stayed (floored at 0.1) | r = 1: a move costs a rating no predictive power |

`D_session = (T1 + T2 + T3 + T4) / 4` and **D2 = mean of D_race and D_qual** **[choice: equal weights, both sessions]**. Terms are in "log-fold" units: a
ratio of 2 reads 0.69, of 1.5 reads 0.41, of 4 reads 1.39. T3 is in control swings, comparable for small values. All inputs are harness
point estimates; `packages/research/node/separation.mjs` computes them (the slope reproduces the harness's `leakVsReplaced` to the last digit).

A caution that belongs with the target: on the harness's synthetic nulls a *correct* filter reads R of about 1.8 to 2.7 at one race for movers (it is less sure
of a driver in a new car, so each result moves him more), so R = 1 is **below what a correct filter reads there**. It is the target asked for. Whether
it can be approached without giving up forecast loss is what the gates decide, and the trade-off curve is reported either way.

## Reference values (the baseline settings, timeline cut at 2011; `separation-report.mjs`)

| | D2 | race | qualifying | T1 | T2 | T3 | T4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **baseline** | **0.543** | 0.621 | 0.465 | race 0.712, qual 1.076 | 0.493, 0.454 | 0.535, 0.121 | 0.741, 0.210 |
| first climb's final point (not shipped) | 0.529 | 0.592 | 0.465 | 0.674, 1.076 | 0.514, 0.454 | 0.498, 0.121 | 0.682, 0.210 |

Raw readings at the baseline (race): mover swing ratio k1/3/5/10 = 2.74 / 2.27 / 1.80 / 1.55; stayer swing k3/5/10 = 1.93 / 1.34 / 1.70; leak slope
0.102 / 0.100 / 0.180; frozen slope movers/stayers k5 = 0.46 / 1.01. Qualifying: mover swing 3.94 / 3.05 / 2.54 / 2.42; stayer 1.85 / 1.32 / 1.61; leak 0.014 / 0.025 / 0.041 (about 0.1
control swings); frozen 0.94 / 1.11. The first climb's final point moves D2 by 0.014 only: its apparent gain was mostly the error-bar term and a target of 2.0.

P (pooled 2002-2011 ratings-alone loss) and the loss references are those of `ACCEPTANCE-hill-climbing-1.md`: P0 = 0.386932.

## Hard gates (a step is rejected if any fails; evaluated on 2002-2011, reference = the baseline settings)

| Gate | Rule |
| --- | --- |
| G1 | ratings-alone combined, all pairs: each of 2002-2007 and 2008-2011 <= ref + 0.0005 |
| G2 | forecast layer 2008-2011 with heads **refitted on the candidate** (30 s; lazily, only for a step that would otherwise be accepted): race-day <= ref + 0.001, Thursday <= ref + 0.001, qualifying head <= ref + 0.0005 **[choice: the first climb used +1e-6 and found it a coin flip; +0.0005 is the exam's noise floor]** |
| G3 | every cell {2002-2007, 2008-2011} x {race, qual, combined} x {all, teammates, other cars} <= ref + 0.002 |
| G4 | calibration slope out of the fit window, race and qual: `abs(slope - 1) <= max(0.05, abs(ref - 1) + 0.02)` |
| G5 | walk-forward loss, race and qual, 2008-2011 <= ref + 0.0005 |
| G6 **no freezing** | for race and qual: efficiency of drivers and of cars (the next revision on the last; positive = reacts too slowly) <= ref + 0.03; the control's own swing (`controlRms` at 5 races) >= 0.75 x ref; movers' own online duel loss at 5 races <= ref + 0.005 |
| G7 car shocks | race and qual: model-free leaks (winter unchanged, winter joined, in-season) `abs <= abs(ref) + 0.03`; estimate-based leaks (winter unchanged, in-season) <= ref + 0.03 |
| G8 | rookie first-5 bias, race and qual: `abs <= abs(ref) + 0.02` |

The error-bar calibration is no longer a term or a gate: it is a reporting scale, fitted last on 2002-2007 (`varInfl`), as in the first climb.

## Acceptance of a step

Unchanged: with `P_best` the lowest P accepted so far and `(P_cur, D2_cur)` the last accepted point (start: the baseline), accept if every gate holds and

1. `P <= P_best - 0.0003` and `D2 <= 1.10 * D2_cur`, or
2. `abs(P - P_best) < 0.0003` and `D2 <= 0.90 * D2_cur`.

## Procedure

Candidate = baseline settings plus overrides for one session at a time; the cheap harness run on the timeline cut at 2011 (boot 50); coordinate search with
multiplicative steps as in `state-space-fit.mjs`: phase 1 `tau`, `thetaT`, `mPace`, `mPart` (race only for the last two); phase 2 `sdJ`, `sdA`, `rhoA`, `sdNew`,
`winterC`, `raceC`, `yearD`; phase 3 `sdC`, `rho`, `sdD`; race and qualifying separately; stop a phase after 3 quiet rounds or 60 evaluations. After the phases,
**compound steps** (the single steps judged at the current point that cost less than 0.0003 in P and lowered D2, combined; the combination and each prefix are
ordinary candidates) **[choice: part of the procedure from the start; the first climb needed it]**. Every candidate is logged to `research/eval/hill-climbing-2-log.jsonl`.

## Confirmation, and what it is worth

2012-2015 has already been read twice (the first climb's confirmation and a mistaken variant of it), so it is **no longer an untouched window**. It is used
once more for the final point, on the same criteria as before (1-6 of Amendment 6 of `ACCEPTANCE-hill-climbing-1.md`: ratings alone per window and pooled, forecast layer with
refit heads, no cell worse by 0.002, calibration and walk-forward, structure not regressed, truth-based recovery on baseline-dynamics worlds), and the
point is shipped only if all hold. It is reported as a sanity check, not as independent evidence of generalisation; the earlier look informed what to suspect
(steps that lower `winterC` and `sdNew` at no loss in sample). The full-run D2 of the baseline, the first climb's point and the final point are reported together then.

## Amendments

### Amendment 1 (2026-10-07): a structural phase, after phases 1-3 found nothing

**What had run when this was written.** The coordinate search of phases 1-3 with compound steps, both sessions (`climb2.mjs search --sessions race,qual --phases 1,2,3
--compound`, 53 candidates, `research/eval/hill-climbing-2-log.jsonl` ids 1-53). It accepted **one** step, race `tau` 0.05 to 0.0357 (P 0.386932 to 0.386573, D2 0.543 to 0.548: a
loss gain at a 1% worse D2). Every step that lowered D2 by more than 0.02 either cost P (`yearD` up: D2 0.518 at P +0.0004) or was refused by a gate (the car-shock leaks of
G7 or the car's efficiency of G6: `winterC` down, `yearD` up), and the compound steps lowered D2 by 3-4% at tied P, below the 10% the rule asks for. The coordinate search over
the existing settings is therefore finished and its result is "no step".

**Noise.** The baseline's own 95% intervals (B = 300, `research/eval/baseline.json`) put one term's `abs(ln R)` about 0.2 wide on either side (mover swing at one race: R 2.84, [2.21, 3.76]);
averaged over four terms and two sessions D2 is uncertain by about 0.05. A D2 difference below 0.05 is **inside the intervals**: it is reported and it is not counted as a gain.

**Phase 4, structural options of the filter (all default-off, so every earlier number reproduces and the golden hashes did not change).** As the TODO orders, after the
settings come the structural changes. Candidates are single steps from the current point, race and qualifying separately, judged by the same gates and the same acceptance rule:

| Option | Meaning | Steps |
| --- | --- | --- |
| `mMover` (new; `moverN` = 5 weekends) | likelihood weight of every pair that involves a driver in his first 5 weekends after a team change, times this; below 1 a move swings his rating less | x1.5 or /1.5 from 1 |
| `sdCL` | extra sd of a car's level when an established driver arrives | from 0 to 5, then x1.5 |
| `carShrinkL` | the car's variance is multiplied by this when an established driver arrives | /1.5 from 1 |
| `tauWet` | likelihood weight of wet weekends | x1.4 either way from 1 |

`mMover` is the one lever aimed directly at T1 and T2 (what a move does to the swing of the mover and of the driver who stays). It is a deliberately blunt one: it makes the
filter learn more slowly from exactly the drivers whose ratings are least certain, which is what the guards G3, G6 (movers' duels) and the refit-heads gate are there to catch.
Then, as in phases 1-3, compound steps over the single steps that cost less than 0.0003 in P and lowered D2.

**Reported, not decided on.** After the climb, three one-parameter sweeps show how far D2 can be bought and what it costs, whatever the gates say (logged with phase `sweep`):
`yearD` (the setting that lowers D2 most), `mMover` and `sdJ` on qualifying. They are the P-against-D2 trade-off curve the first section promised if R = 1 were not reachable;
a sweep point is accepted only if the ordinary rule accepts it.

### Amendment 2 (2026-10-07, before 2012-2015 is touched): what the climb found, the final point, and the floor

**The climb (log ids 0-170, `research/eval/hill-climbing-2-log.jsonl`).** Phases 1-3 with compound steps accepted one step (id 3, race `tau` 0.0357). Phase 4 accepted none by
single steps; the sweeps and 15 hand-built combinations that followed (phases `sweep` and `explore`, all logged, none adopted when run) found two that the rule accepts. One
of them, race `mMover` 0.5 with `sdNew` 15.3846 and `sdC` 35 (id 93; adopted as id 101 with a tag of its own, the log refusing to write the same candidate twice), lowers P by
0.0003 and D2 by 0.048 at once and passes every gate including the refit-heads gate. The coordinate search then restarted from it in all four phases (ids 102-169) and accepted
one more step: race `tauWet` 0.714 (id 134; P better by 0.0003, D2 worse by 0.009, which rule 1 allows: predictive loss wins). The qualifying filter did not move: every
qualifying step that lowers its D2 term is refused by G3 (teammate pairs, +0.002 to +0.007), G5 (walk-forward) or G7 (unchanged-winter leak).

**Final point (id 134), cut timeline 2002-2011:** race `tau` 0.03571428571428572, `mMover` 0.5, `sdNew` 15.3846, `sdC` 35, `tauWet` 0.7142857142857143, everything else
as the baseline; qualifying as the baseline. P 0.385937 (baseline 0.386932), D2 0.509 (baseline 0.543; race 0.553, qualifying 0.465 unchanged). The report-only `varInfl` is
fitted last on 2002-2007 for this point (`climb2.mjs varinfl`): **4.812** (the baseline's was 7.88).

**The floor, found after the climb and before the confirmation (`separation-null.mjs`).** The ideal of every term is R = 1, but a correct filter does not read R = 1
on a world with no dependence of a driver's strength on his team beyond the jump and transient the baseline assumes: on 4 such worlds (drawn from the baseline's own settings,
2002-2011, the likelihood weight tuned to the world) the race scorecard reads D_session 0.311 and the qualifying one 0.461. The real-data readings are to be read against
those: `excess = real D_session - the same filter's reading on the worlds`. This is reported next to D2 for the baseline, the first climb's point and the final point. It was
not part of the objective that was climbed (the objective is D2 as defined at the top), so a change in the excess is reported but is not a result of the climb.

**Confirmation.** Unchanged from Amendment 6 of `ACCEPTANCE-hill-climbing-1.md` (criteria 1-6, the same tolerances, the same mechanics: presets, `state-space-calibrate.mjs --write`, refit heads
through 2015, one full run `--model both --full --null 4 --boot 300`, ship only if all six hold, otherwise revert). Reported whatever happens: the full-run D2 with its
terms for the baseline, the first climb's point and the final point (the first two are read on the full timeline after the fact: both were already read), the excess over
the floor, the predictive table, the weak slices and the recovery. 2012-2015 has now been looked at three times (two runs of the first climb, one of the baseline's own
report); the result is a sanity check, not independent evidence.

### Amendment 3 (2026-10-07): what the confirmation showed

The protocol of Amendment 2 was run once, in the order written: presets, `state-space-calibrate.mjs --write`, heads refit through 2015, `--model both --full --null 4 --boot 300`. **The point failed criteria
1 (ratings alone, 2012-2015: +0.0012 against a limit of +0.0005), 2 (forecast layer, 2012-2015: Thursday +0.0011, qualifying head +0.0006), 4 (walk-forward, race, 2012-2015: +0.0014) and 5
(G6, the car's efficiency on the full run: +0.032 against +0.03)**; criteria 3 and 6 hold. Presets, fit and heads were reverted to the committed state; the climb's code, the log, the scorecard
files and the write-up (`docs/state-space-hill-climbing-2.md`) stay. Nothing was shipped; the golden hashes did not change (the new filter option is default off).

Deviations and things to know about the run:

- The climb scripts' `PRE_CLIMB` (and `separation-report.mjs`'s `BASELINE`) were extended with `sdC`, `mMover` and `tauWet` at their baseline values when the presets were changed for the confirmation, so that the baseline
  reproduces after the preset change (a change of presets does not change the climb: D2 of the baseline reads 0.543 again, id 170 re-measures the final point).
- The full run's synthetic worlds are drawn from the SHIPPED settings at the time of the run (this climb's point), the baseline's from the baseline: the nulls in `final2.txt` and `baseline.txt` are not the same worlds.
  The floor of the scorecard (`separation-null.mjs`) is always drawn from the baseline's dynamics.
- The full-timeline D2 of the baseline and of the first climb's point were computed after the fact (both were already read).
- Candidate 93 was adopted under the tag "adopt #93" (id 101) because the log does not write the same candidate twice.
- The report-only `varInfl` was fitted for the point (4.812) and would have shipped with it; it was reverted with the rest (the baseline's 7.88 stays).
