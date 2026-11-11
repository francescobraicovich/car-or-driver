# Newcomer priors

Declared before candidate fitting and evaluation. Compare one candidate with the
current fixed-reference unified model (source `dc909062c7273b74`). Use the existing
620-weekend evidence export only; no new data, learning-rate changes or centring.

For each output, a new driver's or car's prior is the uncertain mean of the
already-known, same-kind entrants in that weekend plus an estimated entry offset.
The initial field, or a field without any known same-kind entrant, retains the
original independent zero-mean prior. Simultaneous newcomers use the same frozen
reference; their reference uncertainty is shared. The existing 20/50-point
residual standard deviations and output correlations are retained. Known entities,
including transfers, returns and car renames, are never reinitialised.

Fit six offsets (three per kind) with one regularised optimisation of first-
appearance predictive loss in 2002–2007, after replaying the 1994–2001 warm-up.
Each newcomer/output contributes one mean comparison loss, using the existing
observation weights. An offset has a zero-mean Gaussian regulariser with the same
20/50-point scale and cross-output correlation as the entrant residual prior.
Timing uses the existing uncertainty-aware logistic predictive approximation;
overall uses normal-finisher order, excluding mechanical failures as strength
evidence. Offsets remain fixed after 2007. No held-out tuning or candidate grid.

Evaluate 2008–2011, 2012–2015, 2016–2020 and 2021–2025 with calibration fitted to
earlier years only. Report 2026 separately. Reuse the existing actual-result and
timing targets and equal-weekend weighting. Report debut and first-five-appearance
slices separately for drivers and cars, full-field results, conditional grid
forecasts, and whole-season intervals. Car samples are small; disclose counts.

Acceptance: newcomer actual-result or timing performance should improve for both
kinds without materially worse companion metrics. Allow at most +0.002 full-field
historical log loss, +0.005 in any block, and +2% pooled timing MAE, reflecting the
user's preference for a principled model at a small predictive cost. Reject larger
regressions. Show all results even if a guard fails. Do not require the field mean
to equal 1,000 or treat a smaller mean as forecast validation.

Structural checks: translation equivariance, unchanged established means on entry,
reference covariance and shared-newcomer covariance, positive-definite covariance,
simultaneous-entry order invariance, no resets on transfers/returns, chronological
prefix invariance and invalid parameters. Include a constant-ability turnover
example as an anchoring diagnostic, not a substitute for real-world validation.

## Focused revision after the first comparison

The means-only candidate failed the newcomer-driver comparison: first-five
result loss and both timing errors worsened; debut loss worsened by 0.00873.
It is rejected, despite passing full-field tolerances. Its complete parameters
and results remain in `mean-offset-parameters.json` and `mean-offset-results.json`.

Before fitting the revision, extend the same prior by estimating one residual
standard deviation per kind, shared across outputs with the existing correlation.
This adds two parameters to the same pre-2008 optimisation. Regularise their log
ratios to the original 20/50-point deviations with standard deviation ln(2).
The initial field retains its original prior. All other comparisons and tolerances
remain unchanged. This revision follows a retrospective diagnostic; later scores
must not be described as an untouched confirmatory test. No further candidate
search is planned.

## Stability review and final constrained check

The estimated-spread revision met the predictive tolerances but increased driver
overall p90 movement by 37%, from 3.06 to 4.19 points, and worsened driver-debut
result loss by 0.012. Reject it because it conflicts with the original stability
objective. Its parameters and results are retained with the `estimated-spread`
prefix; passing the numerical predictive guards is not a production decision.

Make one final constrained revision before stopping: retain the original 20/50
residual deviations; fit only the six means using the first five appearances of
each entrant in the same 2002–2007 training period. Regularise offset means
independently at the original 20/50-point scales: correlation between individual
strengths does not require equally correlated uncertainty in population means.
Keep the filter's existing output correlations. This adds no production parameters
over the first candidate. In addition to the predictive tolerances, require driver
overall p90 movement to stay within 10% of the reference. Report the retrospective
revision and all rejected versions; do not present the result as an untouched test.
