# Joint-evidence teammate graph

Declared before scoring on 11 November 2026. This study uses the existing local
tables only. Historical periods have informed earlier work; all results remain
retrospective. The partial 2026 season is monitoring, never selection data.

## Model and scope

The requested research baseline jointly observes finishing order, overlapping
race-lap pace margins, and qualifying margins. Shared-car teammate comparisons
remain the only driver evidence. Finishing positions are ordinal: an extra
position is not a constant amount of ability. Time margins are signed fractions
of the compared lap durations. Existing mechanical-failure, short-race,
qualifying-censoring and overlapping-window exclusions are preserved.

Keep the current driver-season topology, initial precision 2, annual Brownian
drift 4 points, three-year outcome half-life and 75-point odds scale. A binary
order observation uses Bradley–Terry loss. A continuous margin uses
`log(cosh((driver_gap - standardized_margin) / 2))`. This is half the negative
log-density of logistic measurement error (up to constants), with bounded
influence and the same maximum curvature, 1/4, as one binary comparison.
There is one latent ability scale. This is a tempered composite likelihood,
not a claim that the weekend measurements are independent.

Qualifying has weight 1. Race evidence has total weight at most 1.5 per pair
and weekend. Finish and pace share this budget in proportion to their coverage;
partial order is a fallback only when neither is available. With one signal,
its coverage still reduces the budget. Duplicate records never add evidence.
The margin's sign is not also added as a binary observation.

For each source, estimate the logistic scale from the median absolute residual
around each completed driver-pair-season's median, divided by log(3). Groups
need at least three observations; a scale needs at least 20 residuals. Refresh
only at a season boundary using completed earlier seasons. Before a scale is
available, use the observation's sign. Freeze each observation's scale when
received, so future observations cannot alter earlier snapshots. This is a
robust empirical scale estimate, not a fitted claim about true noise variance.

## Fixed candidate families

1. `current`: exact production graph, also independently reproduced by the
   research solver before comparisons are accepted.
2. `joint`: the requested combined evidence model above.
3. `uncertainty`: unchanged joint means; approximate joint covariance from the
   inverse objective Hessian. Integrate gap uncertainty using the same logistic
   normal approximation as the production forecast calculation. Covariances
   between drivers must be retained. Also evaluate this change on `current`.
4. `sessions`: race and qualifying levels linked by a zero-centered Gaussian
   difference prior. Difference SD is the existing initial driver SD,
   `75 / log(10) / sqrt(2)` points. Each session has half the initial and temporal
   precision, so forcing both levels equal recovers the shared-state prior.
   The fully separate session version is a diagnostic, not another selected arm.
5. `memory`: choose once from half-life {3 years, no explicit decay}, annual
   drift {4, 8 points}, initial precision {1, 2}. Selection uses only 2004–2007
   next-weekend teammate loss, calibrated on 2002–2003. All eight configurations
   are fixed now. Later blocks do not choose parameters. The existing settings
   remain eligible. One further fixed diagnostic uses weekend nodes and actual
   elapsed dates with the existing prior, drift and decay.

Test each extension against `joint` and report it against `current`. Also run
session separation and the same early-training memory selection on the original
binary evidence, alongside the original-evidence uncertainty control. These
matched controls isolate structural changes from the joint evidence change.
If joint does not pass, only extensions independently passing on the original
evidence may enter a validated combination. Combine only independently passing
changes and score the combination again. No search follows validation results.
A research baseline and a validated production replacement are distinct decisions.

## Evaluation and acceptance

Use the existing four chronological blocks, 2008–2011, 2012–2015, 2016–2020,
2021–2025. All prediction calibration uses earlier seasons only. Use the
unchanged evaluation observations, including finish, pace, partial and qualifying
targets, whether or not a candidate trains on them. Report weighted and
unweighted losses by source, session and block. Score graph drivers alone on
teammate comparisons; cars and complete forecast heads are outside this study.

The primary is the existing move-balanced, frozen teammate loss across race
and qualifying at five and ten new-team weekends. Freeze both driver means and
covariance before the mover's final old-team weekend. Preserve exact eligible
and omitted identities; no after-move learning enters the frozen prediction.
Uncertainty calibration for movers uses earlier frozen stayer comparisons.

A change passes only if its primary loss decreases and the upper endpoint of
its paired 95% move-bootstrap difference is below zero. Additionally, neither
session's ordinary teammate loss may worsen by more than 0.003 pooled or 0.006
in any block, and field-spread-normalized p90 rating movement must be at most
1.10 times the reference. Report each source's scores and all failed guards.
Use 1,000 paired bootstrap repetitions, clustering ordinary losses by season
and primary losses by move. Intervals do not account for all historical model
selection. Inconclusive evidence is not promoted.

Required checks cover current-solver parity, chronological prefixes, evidence
deduplication, source budget, pair reversal, invalid inputs, mechanical-failure
exclusion, finite and converged solves, gradient accuracy, margin direction,
bounded outlier influence, covariance symmetry, weak-chain uncertainty and
frozen-prediction invariance. Run broader existing graph regressions as well.
Record input/source fingerprints and numerical-library versions. Keep existing
production artifacts unchanged unless the final graph passes and the complete
production integration and forecast checks are subsequently completed.
