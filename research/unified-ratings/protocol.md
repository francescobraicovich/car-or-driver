# Unified driver and car ratings

Declared on 11 November 2026 before candidate scoring. Scope is research steps
1–9; production sources and saved website models remain unchanged. Only the
existing local data are used. The user prefers a sound, simpler model even at
a small predictive cost and requests a practical comparison rather than a
large ablation search.

Each driver and car has qualifying, race-pace and overall strength. Qualifying
and pace observe signed fractional time differences (positive means faster).
Overall observes finishing order between normal finishers; retirement causes
update the existing independent reliability/incident estimates. Those causal
hazards enter actual-result forecasts, including retired competitors. Overall
is therefore competitive result strength, with survival risk explicit in its
forecast, rather than a weighted average of the two timing ratings.

One Gaussian state and covariance covers all entities and channels. A robust
logistic timing likelihood and a Bradley–Terry order likelihood update that
state together. Teammate edges cancel the car term exactly. The new graph's
timing/order evidence principles are incorporated, not its posterior as a
second independent observation. Its standalone output is a diagnostic reference.
All cross-team comparisons can update drivers and cars; driver estimates are
not constrained to equal the graph. The covariance remains a Laplace/composite
likelihood approximation, not proof of causal identification or coverage.

Timing units are fixed: 0.003 fractional lap duration per latent unit; one
latent overall unit is natural log odds, displayed as 75/log(10) points. Timing
noise is learned separately from these units. Correlated three-channel priors
and innovations provide partial pooling without defining overall as an average.
Initial SDs are 20 driver and 50 car points. Driver process SD is initially
4 points per square-root year; cars have 3 points per weekend and 15 per winter.
There is no automatic driver change on a team transfer. One forward update is
made per weekend; later observations never revise stored earlier snapshots.

The fixed control uses correlation 0.5 and timing logistic scale 1. Source
counts are normalized: cross-team pairs have weight 1/(field size-1), teammate
pairs weight 1. Finish and pace share a race budget of 1.5 per pair; qualifying
has budget 1. Coverage decreases pace information with diminishing returns.
This controls repeated pairs but does not assert exact within-weekend independence.

Use 1994–2001 for warm-up and prequential 2002–2007 predictions for small global
parameter estimation. Fit driver and car sharing from {0, 0.5, 0.85} with one
coordinate pass; estimate the two timing noise scales from training prediction
residuals with latent predictive uncertainty; select driver/car process
multipliers from {0.5, 1, 2} with one coordinate pass. No search on scored eras.
Compare control, pooling, noise, adaptation, and their combination. The user
authorizes retaining a theoretically cleaner combination with a small measured
cost; report this as a trade-off, not a statistically demonstrated improvement.

Separate evidence checks: Q2 preference in 2006–2009, exact retained-lap matching
before aggregation, and omission of unreliable retirement snapshots. Each is
tested on the combined candidate; compare each on BOTH unchanged targets and
the revised measurement target. Keep changes only with a defensible measurement
interpretation and no material outcome deterioration. Ties provide zero timing
margin rather than disappearing. No new incident annotations or tyre data.

Primary evaluation: mean per-race log-loss on distinct actual finishing-order
pairs, including retirements, with forecasts before any weekend session. Exclude
nonstarters, administrative disqualifications, invalid positions and races with
less than two completed laps. These are explicit benchmark coverage limits.
Use a fixed 60-lap hazard horizon, not realized race length. Report both normal
finisher and retirement slices. Qualifying and pace use fractional-margin MAE,
predictive log score, interval coverage, and teammate/all-field slices. Calibrate
predictions on seasons strictly before each evaluation block. No current grid
or qualifying enters Thursday predictions; known entrant identities are treated
as the pre-weekend lineup, an archival limitation.

Blocks: 2008–2011, 2012–2015, 2016–2020, 2021–2025; 2026 monitoring only. Compare
published ratings and actual installed Thursday heads on the same new outcome
exam. Current heads were trained on a different weighted composite target;
report that limitation. Compare timing predictions after identical past-only
unit/noise calibration. Resample whole seasons for primary intervals, whole
moves for transfer comparisons; do not resample dependent pairs as independent.

Decision tolerances declared now: combined overall log-loss cost <=0.005 pooled
and <=0.015 in any block versus published Thursday heads is an acceptable small
research trade-off; margin MAE costs <=5% pooled and <=10% per block. Frozen
transfer and normalized stability remain separate reported guards (0.01 loss
and 1.25 p90 movement ratio respectively). A failed guard is never relabelled a
pass. Larger costs leave a working research model with explicit deficiencies,
not an automatic production candidate. Intervals report uncertainty; lack of
significance is not equivalence. Simulated recovery tests several fixed worlds
including misspecification and cannot establish real-world attribution truth.

Required verification: gradient accuracy, reversal, deduplication, invalid
inputs, bounded influence, covariance validity, cross-channel learning, exact
teammate cancellation, chronological prefix invariance, no transfer jump,
mechanical-failure treatment, weak connections, and frozen prediction invariance.
Record fingerprints, numerical runtime, parameter choices, all comparison results,
latest research ratings and limitations. Production migration is step 10 and is
outside this request.
