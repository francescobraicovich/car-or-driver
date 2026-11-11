> Production status: the selected `refined_all` candidate is now the website baseline. Step 10 is documented in [the production specification](../../docs/unified-model.md) and [integration checks](production-integration.json). The numerical implementation and evidence definitions are shared with core; this directory preserves the original steps 1–9 study and its pre-migration artifacts. The old hybrid remains the comparison reference, not the current production model.

# Unified driver and car ratings

Research implementation of the agreed steps 1–9. Production integration (step
10) is deliberately separate. See [results](results.md), [selection](selection.json)
and the [predeclared protocol](protocol.md).

Every driver and car has qualifying, sustained race-pace and overall competitive
strength. One Gaussian state and covariance covers all three channels and all
entities. Timing margins use robust logistic errors; ordinary finishing order
uses a Bradley–Terry likelihood. Overall has its own result target and is not a
weighted average of timing ratings. The existing causal mechanical/incident
hazards convert competitive probabilities to actual-result probabilities.

For each channel an observation depends on driver A minus driver B plus car A
minus car B. Teammate car coefficients cancel exactly. The validated graph's
comparison principles enter the joint fit directly. Its standalone rating is
retained as a diagnostic reference, not counted again as independent evidence.
The joint model can disagree with the graph because cross-team results also
inform the driver/car allocation. There is no graph-rating percentage blend,
online rating learner, driver-specific tuning or automatic transfer penalty.

## Estimation

- [evidence.mjs](evidence.mjs) prepares distinct timing/order comparisons and
  independent fixed evaluation targets. Race evidence shares a bounded budget;
  cross-team pairs are normalized by field size, avoiding quadratic evidence
  growth. This remains an approximate composite likelihood.
- [model.py](model.py) performs one robust Laplace update per weekend and
  preserves correlations with inactive entities through Gaussian conditioning.
  Predictions precede the update; historical snapshots are never revised.
- [fit.py](fit.py) estimates a few global sharing, source-noise and process
  parameters using only prequential 2002–2007 training predictions. Initial
  1994–2001 observations provide warm-up. Fitted hyperparameters are fixed for
  2008 onward; training-era predictions are not untouched validation.
- [evaluate.py](evaluate.py) evaluates all candidates on identical observations,
  with calibration fitted strictly before each block. It also evaluates the
  installed Thursday head, a past-only recalibration of that head, and the
  published ratings with the same actual-result calibration as the new model.
- [simulation.py](simulation.py) tests recovery in shared-strength,
  specialization, persistent driver–car fit and heavy-noise worlds.
- [forecast.py](forecast.py) builds a reusable research state and predicts a
  pair from it. It verifies exact agreement with the selected history.

One latent unit corresponds to 0.003 fractional lap duration for timing. The
display conversion is 75/log(10) points; 1000 is added after centring drivers and
cars separately. Timing noise is fitted separately from this conversion. The
75-point odds interpretation applies to the raw overall link, before uncertainty,
calibration and retirement hazards; timing ratings do not share that interpretation.

The selected evidence refinements compare Q2/Q1 in the race-fuel qualifying era
2006–2009, match retained race laps before aggregating window differences, and
omit retirement-position snapshots from overall strength. The personal-fastest
105% lap filter is retained. Matching numbered laps does not guarantee equal
tyres, wall-clock conditions for lapped cars, traffic or undamaged machinery.
Race pace is an approximation to comparable-condition speed, not an identified
causal effect independent of starting position.

## Reproduction

Use the repository Node dependencies and its existing Python NumPy/SciPy
research environment. From the repository root:

```sh
node research/unified-ratings/run.mjs
```

This regenerates the graph reference if absent, exports data, estimates the
small training-only parameter set, fits nine research comparisons, evaluates
them, runs simulations, writes the report/selection, builds the reusable state,
and runs the focused tests. It does not rebuild website data. Intermediate
histories are under `tmp/unified-ratings`; the protocol and compact results are
under this directory. Numerical versions and input/source hashes are recorded.

Individual commands:

```sh
node research/unified-ratings/export.mjs
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 research/unified-ratings/fit.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 research/unified-ratings/evaluate.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 research/unified-ratings/simulation.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 research/unified-ratings/report.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 research/unified-ratings/forecast.py build
python3 research/unified-ratings/test_model.py
node tests/test-unified-ratings.mjs
```

For a research forecast, pass the future date and driver/car identities:

```sh
python3 research/unified-ratings/forecast.py predict --date 2026-11-15 --driver-a 830 --car-a 9 --driver-b 1 --car-b 6
```

Without `--hazard-a` and `--hazard-b`, the command reports timing predictions and
conditional competitive probability, leaving actual-result probability null.
Actual-result forecasts require explicit pre-weekend per-lap hazards. The saved
forecast calibration is the past-only 2026 monitoring calibration (through 2025),
not a fit to the monitoring outcomes. Car identities respect repository lineage.

## Interpretation limits

The real-world driver/car separation still relies on priors, transfer connections
and assumed evolution rates. Same-team evidence is better controlled but not
free of unequal equipment or strategy. A finite composite likelihood and Laplace
covariance do not establish calibrated rating intervals. Three simulation seeds
per world are exploratory; systematic driver–car interaction is deliberately
tested and remains a misspecification risk.

Actual-result targets exclude nonstarters, administrative disqualifications and
races shorter than two laps. Archived entrant identities are treated as known
before the weekend; surprise withdrawals or substitutions are not forecast.
Hazards use a fixed 60-lap horizon, never the realized race distance. Finishing
strength is learned from normal finishers, while retirement risk is estimated
separately; this does not fully solve informative missingness or assign collision
fault. Existing source status mappings are preserved.

All historical periods have informed earlier project development. Chronological
tests and clustered intervals are retrospective, not independent confirmation.
2026 is monitoring. The report keeps theoretical preference, statistical evidence,
and failed predictive/stability guards separate. No website replacement is claimed.
