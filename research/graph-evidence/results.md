# Selected graph baseline: joint evidence with gap uncertainty

The selected research baseline combines finishing order, race-pace margins and
qualifying margins in one driver-season graph, and accounts for joint rating
uncertainty in its predictions. Keep the original three-year evidence half-life,
four-point annual drift and initial precision 2. The original production graph
and the website's hybrid pipeline are unchanged.

The reusable specification is [baseline.json](baseline.json). The full
[results](results.json), [selection](selection.json) and predeclared
[protocol](protocol.md) retain all comparisons, failed guards and calibration
details. Source/input fingerprint:
`21ca34a8fa98129c76e034c71b2357480e117cd163f497b645f5cdd0e42d56b3`.
Data end at the Mexico City Grand Prix on 1 November 2026.

## Historical validation, 2008–2025

Lower log-loss is better. These are graph-only teammate predictions, not the
hybrid model's all-field forecasts. Race scoring preserves the original finish,
pace and partial targets and weights. Qualifying uses the original qualifying
targets. The primary frozen-transfer score gives each move equal weight across
race/qualifying and five/ten-weekend horizons.

| Measure | Current graph | Joint evidence | Selected: joint + uncertainty |
| --- | ---: | ---: | ---: |
| Frozen-transfer log-loss, 51 moves | 0.716602 | 0.701345 | **0.699247** |
| Ordinary race teammate log-loss | 0.611005 | 0.607968 | **0.607919** |
| Ordinary qualifying teammate log-loss | 0.593449 | 0.588859 | **0.588798** |
| Median absolute rating change, points | 1.1960 | 0.8903 | 0.8903 |
| P90 absolute rating change, points | 3.8342 | 3.0034 | 3.0034 |
| P90 change / field rating SD | 0.18755 | 0.15823 | 0.15823 |

Joint evidence improves frozen-transfer loss by **−0.015257**, with paired
95% move-bootstrap interval **[−0.027876, −0.002574]**. Adding uncertainty to joint
evidence improves it by a further **−0.002098 [−0.003979, −0.000264]**. The final
change versus the original graph is **−0.017355 [−0.030315, −0.003975]**. Both
changes pass the primary, ordinary-loss and stability guards independently; the
combined model was refitted and checked again. Season-clustered sensitivity
intervals for the primary difference also exclude zero. These intervals remain
retrospective and do not adjust for all model development or multiple comparisons.

The selected model improves ordinary weighted race and qualifying loss in all
four historical blocks. The pooled race difference is
**−0.003086 [−0.005862, −0.000378]** and qualifying is
**−0.004651 [−0.008178, −0.001068]**, using paired season bootstrap intervals.
Normalized p90 rating movement falls by **15.6%**; this is not merely a smaller
rating scale. Uncertainty changes probabilities, not the rating means.

## Separate extensions

| Experiment | Frozen-transfer loss | Decision |
| --- | ---: | --- |
| Uncertainty on original binary evidence | 0.713929 | Passes against original graph; also confirmed on joint evidence |
| Linked race/qualifying states on original evidence | 0.717811 | Reject: primary and ordinary-loss guards fail |
| Linked race/qualifying states on joint evidence | 0.701900 | Reject: does not improve the joint baseline |
| Independent race/qualifying states on joint evidence | 0.701453 | Diagnostic only; primary and ordinary-loss guards fail against joint |
| Training-selected memory on original evidence | 0.703987 | Reject: primary interval crosses zero; normalized movement exceeds guard |
| Training-selected memory on joint evidence | 0.703442 | Reject: worsens joint primary score and exceeds movement guard |
| Weekend states on joint evidence | 0.701841 | Reject: no primary improvement over season states |

The memory search was confined to 2004–2007, with calibration on 2002–2003.
It selected three-year decay and eight-point drift in both evidence streams,
with initial precision 2 for original evidence and 1 for joint evidence. These
choices improved ordinary historical prediction, but did not pass the frozen
transfer and stability requirements. They were not merged. Weekend resolution
used 13,256 latent states rather than 823 and did not justify its additional
cost. The retained baseline uses one shared strength per driver-season.

## Source-specific results and remaining limitations

| Unchanged evaluation target | Count | Current weighted loss | Selected weighted loss | Current unweighted loss | Selected unweighted loss |
| --- | ---: | ---: | ---: | ---: | ---: |
| Finishing order | 2,603 | 0.610768 | 0.608001 | 0.625668 | 0.622934 |
| Shared-window race pace | 3,364 | 0.613977 | 0.606481 | 0.629691 | 0.622463 |
| Pre-retirement partial order | 109 | 0.656107 | 0.660155 | 0.702437 | 0.699612 |
| Qualifying | 3,697 | 0.593449 | 0.588798 | 0.608962 | 0.604119 |

The sparse partial-order slice worsens on its weighted score. Qualifying's
pooled calibration slope also moves farther from one, from 1.089 to 1.192,
despite lower log-loss. These are unresolved diagnostics, not hidden passes.
The selected frozen-transfer loss remains above the neutral 50–50 loss
`log(2) = 0.693147`. The earlier published hybrid report records 0.688843; that
hybrid was not refitted or re-evaluated in this graph-only study. Improving the
graph does not establish that replacing the entire hybrid would improve the
website.

The evidence model is a tempered composite likelihood; its inverse-Hessian
covariance is approximate and does not establish uncertainty coverage. Both
race measurements share a budget, but this does not fully model their
dependence. No added telemetry, weather, tyre, strategy or external driver data
were used. Equal machinery remains an approximation for teammate comparisons.

## Partial 2026 monitoring

| Weighted teammate log-loss | Current graph | Selected baseline |
| --- | ---: | ---: |
| Race | 0.641462 | 0.633562 |
| Qualifying | 0.654686 | 0.641465 |

These 19 weekends did not select the model. Historical periods have already
informed project development, so neither the chronological blocks nor their
bootstrap intervals are an untouched independent confirmation.

## Verification and reproduction

The independent sparse solver reproduced 26,511 pre/post current-graph values,
including the qualifying-only entrant, with maximum absolute difference
**0.000001105 points**. All solves check their final gradient and finite values.
Tests cover derivatives, margins, bounded outlier influence, reversal, source
budgets, duplicates, chronology, invalid inputs, covariance, weak chains,
session specialization, qualifying without a race start, mechanical failures
and frozen-prediction invariance. Existing graph, evidence-integrity,
chronological-validation and frozen-mover regression tests also passed. New
JavaScript files pass ESLint and Prettier checks. The complete `npm test` suite
passed, including the saved-production model's comparison with a fresh build
across 475,162 values. All eight numerical-model tests passed separately. The
standalone baseline specification reproduced the selected history and joint
covariance exactly across all 620 weekends.

Actual numerical runtime: NumPy 2.1.2 and SciPy 1.14.1; the full Python version
is recorded in results.json. See [README.md](README.md) for reproduction commands.
Input-table hashes, the production source hash and solver/input hashes guard
against stale intermediate histories. No production data files were rebuilt.
