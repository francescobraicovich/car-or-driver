# Detaching drivers from cars: acceptance rule for the final project phase

> **Note (tidy, 2026-10-14).** The search scripts named in this record (`detach-search.mjs`, `strict-search.mjs`, `suite-search.mjs`, `qual-variants.mjs`, `xsession-years.mjs`, `mover-windows.mjs`) were removed from the repository once their conclusions were recorded; they are at the tag `archive/pre-tidy-2026-10-14`. The candidate logs are in `research/eval/logs`. The scripts that remain (`suite.mjs`, `strict-eval.mjs`, `cross-session.mjs`, ...) are described in `docs/metrics.md`.


Written and committed **after one exploratory run of the cross-session link at beta 0, 0.5 and 1 on the 2002-2011 cut (8 s, nothing logged
as a candidate) and before any logged candidate**. Choices not fixed by the request are marked **[choice]**. Changes after a logged candidate
only as dated amendments at the bottom.

## Goal

Ratings that tell a driver's strength from his car's, **judged first by how well they forecast drivers in a new car** (movers against their new
teammate; stayers against a newcomer), then by the structure scorecard, and never by a trick that helps only those slices (a rule applied to
movers only, a freeze, a rating that does not move). Anything added must be a model of the world (a shared driver skill across sessions, a
car-by-driver term, ...), run on every driver identically.

## Primary target (reported on every candidate; not climbed on alone because there are only ~70 moves)

1. **Frozen-rating loss of movers**, race, first 5 and 10 races at the new team: `movers.race.frozenLoss.k5` / `.k10` (the pre-move rating, with the
   stayers' calibration slope, against the new teammate; a coin is 0.6931). Baseline 0.6979 / 0.6890. This is the number that says whether the driver's
   rating survived a change of car with no adaptation.
2. **Frozen slope ratio** movers / stayers (T4 reads |ln r|), baseline 0.46 / 1.01 at k5.
3. **Online loss of movers** `movers.race.onlineLoss.k5` / `.k10` (0.6239 / 0.6167) and **teammate pairs** loss (race, 2008-2011 0.6118; combined 0.6079).
4. **Stayer leak T3** (0.535) and D2 (0.543 on 2002-2011).

## Hard gates on the pooled number P and no-freezing guards (a candidate is rejected if any fails)

Unchanged from `ACCEPTANCE-hill-climbing-2.md` (G1 to G8), with P0 = 0.386932 and the baseline of `baseline.txt`, **except**:
- G1 stays: ratings-alone combined, all pairs, each of 2002-2007 and 2008-2011 <= ref + 0.0005.
- G6 efficiency guards stay (driver and car, +0.03).
- **Added G9:** teammate-pair loss (combined, race) in 2008-2011 not worse than ref + 0.002, and the online loss of movers at k5 and k10 not worse than ref + 0.005.
- A candidate that improves the primary target (1) by >= 0.01 at tied P (within G1) is a **win for detachment** and is carried forward even if D2 is flat.
- Structural gain bought with a P loss above G1 is rejected and reported as a point on the trade-off curve.

## Selection protocol

- Candidates are scored on 2002-2011 (`cross-session.mjs --last 2011`). Every logged candidate goes to `research/eval/logs/detach-log.jsonl`, accepted or not.
- **Windows.** 2002-2007 fit, 2008-2011 validation. 2012-2015 is the second validation (read repeatedly in earlier climbs: **weak** evidence) and is read only for the final shortlist.
- **One read of 2016+** (`--holdout`) for the single final candidate, after its settings are fixed **[choice, approved by the user]**. Its criteria are the gates above with the 2016+ numbers of the baseline (0.4000 ratings alone), plus: frozen-rating loss of movers not worse than baseline, T4 not worse than baseline. The result is reported whatever it is.
- No setting is tuned on the movers' slices alone. Settings are tuned on P and D2 jointly under the gates; the mover slices are read after.
- Truth check: a candidate that is carried forward is also run on the synthetic worlds (`separation-null.mjs`, v1c and v2) to confirm that its truth recovery and leak against the true car swing are no worse than the baseline's (a rating that carries the car would show there).

## Stop rule

Stop when (a) a candidate passes all gates, wins on the primary target on 2008-2011 and on 2012-2015, and the 2016+ read confirms it, or (b) three families of candidates
in a row (cross-session link variants, joint session fits, driver-car interaction state) fail the gates. Then report the trade-off curve honestly; the user has allowed that outcome.

## Exploratory reading that motivates the first family (2002-2011, race, baseline settings; beta = weight of the qualifying driver rating as a known offset of the race strength)

| beta | P race 2008-11 | frozenLoss k5 | onlineLoss k5 | T3 | T4 | D2 | effDriver |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0.3918 | 0.6979 | 0.6239 | 0.535 | 0.741 | 0.543 | 0.025 |
| 0.5 | 0.3928 | 0.6770 | 0.6038 | 0.455 | 0.612 | 0.514 | 0.077 (fails G6) |
| 1 | 0.3973 | 0.6600 | 0.5958 | 0.409 | 0.515 | 0.488 | 0.069 |

Rationale: qualifying is a one-lap measure with little noise from strategy, reliability or traffic, and its movers' frozen slope is 0.86; race driver level should
share most of its variance with it. beta is a physical quantity (the loading of race skill on qualifying skill), not a mover-only knob.

## Amendment 1 (2026-10-13, before the first logged candidate): the family, the search and the selection rule

**Family 1, cross-session link** (`filter.js` `ctx.offsets*`, `ctx.carOffsets*`; `cross-session.mjs`). The race filter's driver strength is `beta * Dq + D + A + C` and its car strength is
`gamma * Cq + C`, where `Dq`, `Cq` are the qualifying filter's levels (the same pass run with the shipped qualifying settings, unchanged). A forecast of weekend k reads the qualifying
levels through weekend k-1; the update with the weekend's results and the posted rating also read weekend k's own qualifying (known before the race). The unlagged variant for forecasts
was run once as a diagnostic (race 2008-2011 0.3865) and **rejected as a candidate: it uses the grid.** Nothing about movers enters: every driver and car gets the same terms.

**Search** (`detach-search.mjs`): coordinate search on the race settings `beta, gamma` (additive steps +-0.15, clamped to [0, 1.2]) and `tau, sdNew, sdC, winterC, yearD, sdJ, sdA, rho`
(multiplicative steps x/ 1.3), race only (qualifying stays at its shipped settings), timeline cut at 2011, boot 50. Stop a phase after 3 quiet rounds or 60 evaluations.

**Accept a step** only if all hard gates hold (G1 each of 2002-2007 and 2008-2011 combined all-pairs <= ref + 0.0005; G3-like: no teammates/other-cars cell worse than ref + 0.002; calibration
slope race in [0.95, 1.05]; efficiency of drivers and cars <= ref + 0.03; control swing at 5 races >= 75% of the baseline's; movers' online loss at k5, k10 <= ref + 0.005) and one of:
1. P improves by at least 0.0003; or
2. |dP| < 0.0003 and the mean of the movers' frozen-rating loss at k5 and k10 improves by at least 0.005; or
3. |dP| < 0.0003, the frozen loss is not worse by more than 0.002, and D2 improves by at least 10% relative.

P is the pooled (2002-2011, both sessions, weights as climb2) ratings-alone loss. The frozen loss is a **tie-breaker, never a way to give up P** (rule 2 needs |dP| < 0.0003).
Reference (the baseline, `separation-report.mjs --points baseline`): P 0.386932, D2 0.543, frozen loss k5/k10 0.6979/0.6890.

## Amendment 2 (2026-10-13, after the first search of family 1, before the second)

The first search (ids 1-33 of `logs/detach-log.jsonl`, timeline through 2011) accepted lower `tau` and `winterC` steps, the direction of both earlier climbs, which improved 2002-2011 and not 2012-2015
(checked afterwards: beta 0.5, gamma 0.3 with tau 0.0296 and winterC 8.75 reads 2012-2015 combined 0.3658 against 0.3656 with the link alone, and 2008-2011 improves by 0.002). So:

1. **2012-2015 becomes a hard gate in the search (G10), not an objective:** combined all-pairs <= ref + 0.0005, teammates (combined) <= ref + 0.002, race all <= ref + 0.001. P stays 2002-2011 only. 2012-2015 is no longer a validation window afterwards; **the only confirmation left is the single 2016+ read** (approved).
2. **Family 2, a persistent driver-team term:** the filter's new-stint transient A with `rhoA` near 1 (it is reset at a team change, so a driver's portable level D never carries the old team's fit). Added to the search as `sdA` (x/1.3) and `1 - rhoA` (x/1.5). First readings (through 2015, beta 0): sdA 8, rhoA 0.97 lowers the movers' frozen loss 0.7298 to 0.7137 with 2012-2015 unchanged (0.3656) and 2008-2011 +0.0006.
3. The search start is `beta 0.3, gamma 0.3, sdA 8, rhoA 0.97` (read before the search: P-windows 2008-2011 combined 0.3859, 2012-2015 0.3655, frozen k5 0.7001, D2 0.590 through 2015).

## Amendment 3 (2026-10-13): the model is frozen; the 2016+ read happened

The shipped point is frozen as committed in `packages/core/src/presets/state-space.js`: `link {beta 0.3, gamma 0.3}` and race `tau 0.038462, sdNew 9.1033, winterC 8.7532, sdA 8, rhoA 0.97`
(all other settings unchanged; qualifying unchanged; `varInfl` 7.64 from the 6-race revision test on 2002-2007; selection: ids 1-72 of `logs/detach-log.jsonl`, 2002-2011 with 2012-2015 as a gate).
`state-space-calibrate.mjs` prints a 2016-onward line on every run (an old behaviour of that script), so the 2016+ ratings-alone loss of the frozen point was seen when the multipliers were refitted:
**combined 0.3968 against 0.4000 for the baseline (race 0.3962, qualifying 0.4026 unchanged; teammates 0.5981 against 0.6020)**. The settings were fixed before that print and **nothing
that touches the model has been changed since**; this is the one read. Anything changed after this line voids it. What remains is calibration constants (race multiplier, what-if constants) and head refits,
which are fitted on data through 2015 only, and documentation. The movers' 2016+ slices are computed from the same frozen run, as the criteria above say, and reported whatever they are.

## Amendment 4 (2026-10-14): the objective is the strict prior rating; the displayed rating is the portable level

Requested by the project owner after Amendment 3: the aim is the best possible forecast of a mover's results **given his rating from before the move**, and a model that gains by
letting a rating jump after the move (adjusting it with the first races) defeats the project. Two consequences.

1. **What was wrong in the earlier reading.** The harness's frozen test reads the mover at his first weekend for the new team, after the filter has reset his old team-fit term `A` (a step only movers take),
   and the posted rating `D + A` jumped at the move (T1 got worse: 0.71 to 0.96). Both are artifacts. From now on:
   - the **posted rating is the portable level** `D + beta*Dq` (`rateA: false`); `A` stays inside the filter as a nuisance term that keeps `D` clean (it is judged by what it does for `D`, below), it is not displayed and not a rating;
   - the **strict prior rating** of a mover is the rating a reader had before his last weekend for the old team (`pre[ell].rated`), nothing at or after the move is used for him (`mover-strict.mjs`).
2. **Primary objective (selection on moves of 2002-2011):** the log-loss of the strict frozen forecast of movers' duels, in their first 5 and 10 weekends, against the new teammate (`tm`: mean of k5 and k10; the stayers' slope as in
   the harness; the lowest-noise test of the driver rating, car cancels) and against the field (`fd`: mover's prior rating + the new car as forecast before that weekend, against any other driver; ~25 times more duels; the model's own
   multiplier fitted on 2002-2007 non-mover cross-team pairs). No online adaptation can enter either.
   **Accept a step** if every gate below holds and `tm` improves by >= 0.003 with `fd` not worse by more than 0.001, or `fd` improves by >= 0.001 with `tm` not worse by more than 0.003.
3. **Gates** (the model must remain a good rating system; reference = the baseline, i.e. before the link): ratings-alone combined, each of 2002-2007 and 2008-2011, <= ref + 0.0005; 2012-2015 combined <= ref + 0.0005, teammates <= ref + 0.002;
   every window x session x pair-type cell <= ref + 0.002; race calibration slope 0.95-1.05; efficiency of drivers and of cars <= ref + 0.03; control swing >= 75%; the movers' **strict** `tm` and `fd` for 2012-2015 not worse than the current best by more than 0.005 / 0.001.
4. **Windows.** 2016+ was read in Amendment 3 and is **no longer independent for any model selected after it**. Anything reported on 2016+ below is a second look, labelled so, never a selection criterion and never a confirmation. 2012-2015 is a gate, as before.
   The only claim this phase can make for a final model is therefore: selected on 2002-2011, not worse than the gates on 2012-2015, and (second look, contaminated by the earlier read of a neighbour model) the 2016+ numbers.
5. **Stop** when the search finds no accepted step in three rounds or after 120 evaluations. Families: settings of the link and race filter; then, only if the strict gap to stayers (slope 0.8 against 1.1) remains large,
   structural variants that apply to every driver alike (never a rule keyed on movers).

## Amendment 5 (2026-10-14): outcome of the strict search; the model is frozen again

`strict-search.mjs` (Amendment 4; `logs/strict-log.jsonl`) accepted one step from the start point (`beta` 0.3 to 0.4; teammate gain 0.003, within noise) and then no other: the settings are exhausted as a lever for the strict objective.
Frozen: `link {beta 0.4, gamma 0.3}`, race `tau 0.038462, sdNew 9.1033, winterC 8.7532, sdA 8, rhoA 0.97, rateA false`, `varInfl` 8.79 (6-race revision test, 2002-2007), race multiplier 1.003 (2002-2007).
`state-space-calibrate.mjs` printed the 2016-onward line again (0.3966 combined); with Amendment 4 point 4 every 2016+ number for this model is a second look.
A comparator error was found and fixed before any result was reported: the baseline configurations did not pin `rateA`, so after the preset changed the "baseline" hid the team-fit term too; they now pin `rateA: true` and all comparisons were rerun.

## Amendment 6 (2026-10-14): principled ideas after the strict model; no model change

Request: try principled ideas aiming at about 10% on the metrics, at similar overall predictability. Reading fixed before the runs: the 10% applies to what can be resolved; the strict frozen losses of movers sit about 0.04 below a coin with a
bootstrap spread of about 0.025 over 82 moves, so a 10% change in them is not measurable, and D2 can be improved without improving the strict forecasts (found below), so it is not a target. The tests, all on the frozen final model,
selection on moves of 2002-2011 and 2012-2015 as a gate, 2016+ untouched (second look only for the final model):

| Idea (applies to every driver alike) | Result |
| --- | --- |
| career curve: age difference (and a concave age effect) as an extra term in teammate duels, fitted on 2002-2011 | coefficient -0.02 per year (sign unstable across 2002-06 / 2007-11 / 2012-15); 2012-2015 loss 0.6326 -> 0.6354: **no** |
| forecast variance: the frozen forecast with the posted uncertainty (+ the unknown team fit sdA^2) | posted sd is about 2 points for movers and stayers alike, changes nothing (0.6549 -> 0.6541): **no**. The slope below 1 is a bias, not sampling error |
| persistent, hidden team-fit term in **qualifying** (sdJ 0 / 5 / 15 with sdA 10-25) | D2 improves (0.523 -> 0.487 at best) while the strict qualifying teammate loss gets worse (0.664 -> 0.719, slope 0.83 -> 0.25) and the race forecasts read it worse (0.655 -> 0.667): **no, and the scorecard is gameable** |
| leak diagnostic: forecast error of movers on (old car - new car): coefficient +0.14 per log-odds of car gap, i.e. movers leaving a stronger car do slightly better than their prior says (the car absorbs a little too much) | not significant with 82 moves; no setting that acts on it (`sdCL`, `carShrinkL`) improved the strict loss |
| unscored filter options: `sdCL`, `carShrinkL`, `tauWet`, `raceD`, `shrinkM`, `relStart`, `sdRel`, `mRookieCross`, `sdJ` | all within +-0.005 of the strict loss in 2002-2011 except `raceD` (-0.009 at 1, 2012-15 +0.019) and `sdJ` 15 (-0.010, 2012-15 +0.010): the known era pattern; none passes the 2012-2015 gate. **no** |

Conclusion recorded: at this data size the strict objective is at its noise floor for settings and small structural changes. Further gains cannot be claimed from 82 moves; they need either a structural idea that moves the
calibration slope of movers (0.3-0.8 against 1.1) by much more than the noise, or truth-based evaluation on simulated worlds. The scorecard's T4 should be recomputed on the strict prior rating if D2 is used again.

## Amendment 7 (2026-10-14): diagnosis, and corrections to earlier claims

A diagnostic study (`docs/diagnosis.md`; no model change; hypotheses formed on moves of 2002-2011, verified on 2012-2015 and 2016+, which are not independent windows) found:
(1) the Simulator v2 truth-recovery check in `docs/detach.md` was invalid because the qualifying observations of a race-only world are the real ones; corrected with `simulation-both.mjs` (both sessions simulated): the retuned settings, not the link, improve truth recovery; the link is neutral to harmful there;
(2) on real data the retune gives most of the strict gain (`ablation-strict.txt`), the link adds 0.005-0.015;
(3) the exam lists the winner as `x` in teammate observations: losses and slopes are orientation-free, residual analyses must be oriented explicitly.
The model, its settings and the windows used are unchanged.

## Amendment 8 (2026-10-14): the metric suite, and improving the model against it

Request: put every metric (old and new) into the analysis and backtesting, improve the model against them, and list each with its meaning, value and theoretical optimum (`docs/metrics.md`).
Suite: `packages/research/node/metric-suite.mjs`, `suite.mjs`. Groups: **P** overall predictive loss and calibration (guards: the model must stay a good rating system), **S** strict forecasts of movers from the rating posted before the move,
**M** the diagnostics of `docs/diagnosis.md`, **T** the earlier scorecard and truth-free guards (**G**). Real data through 2015 (moves 2002-2015 pooled = `sel`, 47 moves; 2012-2015 = `late`); 2016+ only as a labelled second look; Simulator v2 (both sessions) for truth metrics.

**Targets** (what is optimised; value to optimum 1 or 0): slope ratio movers/stayers (`M.slope.ratio.sel`, 1), large-gap slope ratio (`M.largeGap.ratio.sel`, 1), race-residual portability ratio (`M.resid.weight.ratio.sel`, 1),
the mover-centred residual at the first weekend, frozen and online (`M.early.frozen.w1`, `M.early.online.w1`, 0). Strict teammate and field losses (`S.tm`, `S.fd`) are both targets (lower) and the guard of the others.
Reported, not optimised: uncertainty informativeness (`M.sd.*`, too noisy), the T-terms, D2 (gameable).
**Objective** J = mean over the five targets of the normalised progress (current - candidate) / (current - optimum), each clipped to [-1, 1], current = the shipped model.
**Gates** (all must hold): ratings-alone loss in 2002-2007 and 2008-2011 within +0.0005 of the baseline and 2012-2015 within +0.0005, no pair-type cell worse than +0.002, `S.tm` and `S.fd` pooled over 2002-2015 not worse than the shipped model by more than 0.002,
efficiency of drivers and cars within +0.03 of the baseline, calibration slope within 0.95-1.05, rookie bias and car-shock leaks within the climb2 limits.
**Candidates** (fixed before running, none searched afterwards): `sdA` {12, 16, 24} x `rhoA` {0.97, 0.99}; `lambdaD` {0.8, 0.6, 0.4} (weight of the race-specific level in the posted rating; a definition of the portable rating, applied to every driver);
arrival adaptation `dip` {10, 20} points x `rho` {0.5, 0.7} (a prior about team changes in general, a known offset in forecasts and the update, not in the posted rating, uses nothing of the mover's results at the new team; it is keyed to a team change by construction and is a design decision for the project owner, so it is adopted only if it passes the gates and is reported separately);
`beta` {0.5, 0.6}, `gamma` {0.5}. Combinations of the single winners are evaluated once. Accept the best J > 0.05 that passes the gates.

## Amendment 9 (2026-10-14): outcome of Amendment 8

Of the registered candidates (`logs/suite-log.jsonl`, `suite-search-*.txt`) only `sdA` 12 (rhoA 0.97) passed every gate and improved the targets (J 0.132; strict teammate loss -0.008, field +0.001); `sdA` 16 / 24, `rhoA` 0.99, `beta` 0.5 / 0.6 and `gamma` 0.5 each breached a gate
(2002-07 loss, teammate cell, field loss, efficiency of cars or the winter-joined leak); `lambdaD` made the large-gap ratio worse (J < 0). The arrival adaptation (dip 20, rho 0.5) passed the gates and gave the largest single-change J among the passing ones (0.38) and the best combination
with `sdA` 12 and `beta` 0.5 reached J 0.54, but it is keyed to a team change, mixed in the windows (2012-15 teammate loss worse), and overshoots in weekends 2-3; it is implemented (`STATE_SPACE.adapt`, default off, `arrivalOffsets`) and left as a project decision.
Shipped: `sdA` 12, `varInfl` 8.55, race multiplier 0.9993, forecast heads refit (accepted by their rule). Windows: 2016+ remains a second look. Full list of metrics, values and optima: `docs/metrics.md`.
