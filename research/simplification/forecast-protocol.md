# Forecast simplification extension

Recorded before scoring the forecast candidates on 3 November 2026.

Use the rating protocol's four chronological blocks. Fit coefficients only on years preceding each block. Select ridge strength from C = 0.003, 0.03, 0.3 using the final four complete years within the training prefix as inner validation; then refit on the full training prefix. Equal row orientation has no intercept; symmetric input signals ensure P(A>B) = 1 - P(B>A). All candidates use the fixed exam weights and standardized training-only feature scales.

Fixed candidate designs, in increasing complexity:

1. Ratings: four race/qualifying driver/car levels, with separate coefficients. No current form.
2. Pace form: the four levels plus one recent lap-pace package signal and its driver component (fast tracker only).
3. One-speed form: four levels plus fast qualifying, lap-pace and order package/driver signals. No circuit, slow tracker, trends, interactions or trees.
4. One-speed bounded form: design 3 plus tanh transformations of the same signals, allowing saturation without trees or multiple speeds.

For post-qualifying forecasts add the grid and current qualifying team/driver/gap signals. A second declared current-evidence variant additionally includes Q1/Q2/Q3 pair gaps and log grid ratio; missing gaps follow the existing censoring rules. These are available only to the post-qualifying forecast. Pre-weekend and qualifying forecasts never include them.

Compare to actual production predictions and the same production heads with form inputs zeroed (diagnostic only: zeroing a fitted model is not equivalent to retraining a no-form model). Report weighted loss/Brier by fold/session/pair type and paired season uncertainty. Apply protocol.md's forecast margins. A replacement design must satisfy the guards for all three forecast modes. The 2026 period is separate descriptive monitoring.

Feature definitions initially reuse the existing causal trackers to isolate predictive necessity. If selected, remove unused tracker states from the production forecast path and define the form display from identifiable driver contributions; do not simply expose package shifts as driver form.

## Declared extensions

After the first four designs, the bounded one-speed model with qualifying segments passed all pooled margins but exceeded the qualifying fold guard in 2021–2025 (+0.002177 versus the +0.002 margin). Keep margins unchanged. Before inspecting extension results, declare these checks:

- Fit the same design on the last eight training seasons instead of the entire prefix.
- Add same-team and refuelling-era interactions, with or without that eight-season window. A regime effect is fixed at zero until both regimes have occurred in training, so an unidentifiable duplicate feature cannot absorb the baseline coefficient.
- Expand the ridge-strength choices to C = 0.00003, 0.0003, 0.003, 0.03, 0.3, selected by the same inner chronological validation.
- Test the bounded design on the existing single slow timescale (rate 0.2) instead of the fast timescale (rate 0.6).
- If two response timescales contain distinct useful information, test a bounded linear design using both, still removing every circuit tracker, tree and ensemble. This is less simple than a single timescale and is selected only if the simpler candidates fail.

The last two designs retain qualifying segments and the original three ridge choices. They introduce no new evidence, circuit effects, trends or outcome-dependent rules. This is a bounded extension following a stated failure, not an expansion of the acceptance margins.

## Qualifying-link deletion audit

A final bounded audit followed the rounded-filter and lean-ranking selection because the initial whole-learner ablations confounded qualifying links and blend shares. Four fixed one-at-a-time deletions were declared before their rating results: driver link, car link, driver qualifying blend, and car qualifying blend. Both link deletions passed the rating point guards; both blend deletions failed. One combined link deletion was then declared and tested. Its forecast failed the 2008–2011 post-qualifying combined guard (+0.002226).

Before fitting the individual forecasts, the fallback order was fixed: test driver-link removal first because it had lower rating loss, then car-link removal only if the first failed. Both used the already selected bounded two-timescale ridge design, the same three strength choices and inner chronology, with unchanged margins. Driver-link removal failed the same fold (+0.002130); car-link removal passed (+0.001957), narrowly below +0.002. The primary pre/post forecast guards pool race and qualifying exam weights; the accepted candidate's race-only post loss in that fold rises by +0.002031. No further link variants or parameter tuning followed.

This is sequential retrospective selection motivated by earlier results, not a new independent confirmation set. The final rating rerun also corrected mover eligibility to require three appearances by the fold end and checked exact paired observation identities and common missing-rating coverage. Its rating point guards pass, but the upper season interval exceeds the practical pooled margin.
