# Recent form and conditional forecasts

Declared 11 November 2026 before scoring this study. Use the existing local data
and the selected unified production model. Preserve the original unified study.
The decision is among no form, a separately fitted residual-form correction,
and a joint slow/fast filter. Adopt a supported improvement; otherwise retain
the simpler incumbent. No new data collection or large model search.

## Form comparison

The control is the exact current model, measurements, hazards and calibration.
The external correction leaves its ratings unchanged and fits a mean-reverting
three-channel driver/car residual state after each ordinary model update.
Its uncertainty is conditional: adding it to baseline uncertainty omits their
correlation and is not a new calibrated strength interval.

The embedded candidate has six states per driver and car: slow and fast values
for qualifying, race pace and overall. Observations depend on their sum. Slow
states follow the existing random walk; fast states follow a zero-mean AR(1)
process with calendar-time decay. Shared car contributions cancel in both
components. Retain the full joint covariance, including slow/fast covariance.
Transfers introduce no special reset or penalty. Fast values are deviations,
not a second independently observed measure of ability.

Choose global form parameters using only 2002–2007 prequential scores, after
1994–2001 warm-up. One coordinate pass: half-life 28 or 84 days; stationary
driver SD 8 or 16 points; car SD 12 or 24 points. For the embedded candidate,
also compare the original slow-process rate with half that rate. Share those
parameters across outputs; keep the established cross-output correlations and
timing noise. This is a bounded practical comparison, not an exhaustive search.

All variants predict before reading the weekend. Use identical actual-result
pairs, including retirements, and identical qualifying/race-margin exams.
Calibrate on earlier years only, preserving 2008–2011, 2012–2015, 2016–2020 and
2021–2025 blocks. Report 2026 separately as monitoring. Give each race equal
weight. Report log loss, Brier, reliability, timing MAE, normal-finisher and
retirement slices, teammate pairs, and initial appearances after transfers.

Require an overall historical log-loss reduction of at least 0.001, no block
cost above 0.003, and no timing MAE deterioration above 2% to add form. Prefer
the simpler candidate within 0.001. Use paired whole-season bootstrap intervals
to describe uncertainty, not to relabel small samples as proof. Check slow
stability, fast decay, cancellation and recovery on a small synthetic example
before presenting fast values as interpretable indicators. A known grid must
not rescue a failed pre-weekend form candidate.

## Forecast layers

On the selected form representation, compare the existing positive-slope
calibration with a ridge-regularized linear predictor from all driver/car
channels, a contextual linear predictor, and one small nonlinear basis
extension. Retain exact A/B reversal; no unconstrained intercept or large
neural network. Context means circuit-specific shrinkage of rating effects and,
in a separate grid-known mode, valid starting-position differences. Missing
grid data must fall back to the pre-weekend forecast. Never encode missing
grid as pole position or use race observations as forecast features.

Optimize observed future outcomes or measured margins, not subsequently fitted
ratings. Preserve explicit retirement risks. Scaling, regularization and any
probability recalibration use past data only. Choose regularization from a
small fixed set using the last four training seasons; fit each outer block on
earlier seasons. Report an inner, past-only family-selection diagnostic as
well as the retrospectively preferred family. A candidate must improve its
information-matched control by 0.001 pooled, avoid block costs above 0.003 and
justify each additional contextual/nonlinear stage over its simpler parent.

Existing wet labels cover 2000–2025 and describe realized conditions. They can
support a separately labelled known-weather scenario check, never a claim of
improved unconditional Thursday predictions. Unknown weather is not dry.

After the direct form comparison, and before inspecting head results, add one
bounded interaction check: refit the selected pre-weekend head family with each
of the other two form representations. This addresses the user's fitted-on-top
proposal: a learned prediction layer may use transient states more effectively
than adding them with coefficient one. Require the same 0.001 gain and 0.003
block guard against the same head without form. Do not search additional form
parameters or let grid-conditioned performance select the form architecture.
If no pre-weekend head is retained, use the minimal ratings head for this
interaction diagnostic, requiring improvement over both that head and production.
Also report the already fitted heads before and after temperature calibration:
an additional calibration stage must earn its place against the raw fitted head
under the same gain and block guards. This adds no new parameter search.
If a grid-known head passes, compare it with an overall-gap-plus-grid-only
head before adoption. This necessary simplicity check distinguishes the value
of new grid information from the value of reweighting all six rating outputs.
The final minimal implementation uses exactly two predictors: the joint-
uncertainty-tempered overall gap and the grid difference. Select its penalty on
raw inner-validation loss, since extra temperature calibration was rejected.
Validate this explicit implementation before integration, excluding duplicate
positive grid slots as invalid. The first exploratory grid comparison contained
four such pairs; retain its record and report the corrected production exam.

## Verification and delivery

Check baseline parity, chronology, future-evidence invariance, outcome reversal,
shared-car cancellation, valid covariance, bounded influence, form decay,
transfer behavior, missing-grid fallback and train/serve parity. Retain scores,
source/data fingerprints, selected parameters, model limitations and a readable
decision report. Integrate only supported winners, then rebuild affected
production artifacts and verify website explanations and inference. These are
retrospective model comparisons; previous development used these historical eras.

References for the design: [Stan time-series documentation](https://mc-stan.org/docs/stan-users-guide/time-series.html)
and [scikit-learn probability calibration documentation](https://scikit-learn.org/stable/modules/calibration.html).
