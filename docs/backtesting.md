# Validation of the unified model

The production model is the `refined_all` candidate from the [unified study](../research/unified-ratings/README.md), selected under its [protocol](../research/unified-ratings/protocol.md). The original [results](../research/unified-ratings/results.md) record the research decision before production migration. Older stable-rating, form, graph and scenario studies are archived comparisons, not descriptions of the current website.

The replay begins in 1994, warms up through 2001, and selects a small number of shared model settings using prequential 2002–2007 predictions. Historical validation uses 2008–2011, 2012–2015, 2016–2020 and 2021–2025. Calibration for each block uses earlier years. All predictions precede each weekend update. 2026 is separate monitoring. Final selection followed inspection of retrospective comparisons, so these blocks are not untouched prospective data.

The main forecast target is actual pairwise classified order including retirements; excluded classifications and non-starters are omitted. Timing exams use fixed common margins. Weekends have equal aggregate weight. The strongest fair comparison applies the same calibration and risk recipe to the old published ratings and the new ones; the old fitted forecast head targeted a different weighted benchmark.

| 2008–2025 metric | Previous ratings | Unified |
| --- | --- | --- |
| Actual-result log loss | 0.531721 | 0.530117 |
| Qualifying margin MAE | 0.008170 | 0.006468 |
| Race margin MAE | 0.007010 | 0.005939 |
| Frozen transfer log loss | 0.677990 | 0.679261 |
| 90th-percentile overall rating movement | 2.406 points | 3.570 points |

Timing errors are fractions of lap time. The season-resampled 95% interval for overall loss difference is approximately [−0.003132, −0.000094]. Frozen transfer loss difference is +0.001271 with interval [−0.024187, +0.023360]. Normalised rating movement increases by about 24%. Transfer tests freeze before the final old-team weekend and compare against new teammates at five- and ten-appearance horizons. They test portability more directly than whole-field predictions, but cannot identify causal ability by themselves.

Synthetic checks cover known driver/car strengths, specialization, car shocks, transfers, heavy noise and persistent fit. Recovery is not uniformly better. Persistent fit produces uncertainty undercoverage; other worlds can be conservative. The model is adopted for a coherent target and joint inference as well as competitive results, with these trade-offs explicit.

## Recent form and conditional forecasts

The subsequent [recent-form and forecast-layer study](../research/unified-form/README.md) retains the same ratings. External form worsened historical result log loss to 0.531138. Embedded slow/fast form reached 0.529760, an inconclusive improvement of 0.000357 below the declared adoption threshold. Reweighting all six strengths, circuit effects, a nonlinear basis and extra temperature calibration did not justify additional pre-weekend stages.

A compact conditional head did improve forecasts when both grid positions were known: 0.528053 to 0.504646 log loss on the same 73,749 grid-covered pairs across 362 races. Every historical block improved; the whole-season 95% interval for the loss difference was [−0.031003, −0.016177]. This is a different information set from Thursday, so its score is not directly comparable with the full pre-weekend benchmark above. It uses two predictors—uncertainty-tempered overall package difference and grid difference—with past-only regularization selection. Missing either grid position preserves the original forecast. Grid values never enter strength updates.

## Implementation checks

- Shared production/research numerical code, with derivative, symmetry, teammate cancellation, pooling, chronology, covariance and invalid-input tests.
- Fresh fit versus every saved weekend, history, calibration and forecast state.
- Python/JavaScript probability and timing parity against a frozen selected-research fixture.
- Grid-head derivative, chronological fitting, reversal, invalid-grid rejection and exact missing-grid fallback; Python/JavaScript parity for the conditional forecast.
- Pre-update, equal-weekend result diagnostics in the model file, checked against the selected study.
- Graph and Insights consistency with the published overall ratings and source fingerprint.
- Browser rendering of all ratings, history, forecasts and the reader-facing methodology.

Reproduce the full original comparison with `node research/unified-ratings/run.mjs`. Its archived hybrid reference remains in source. This command runs the study; ordinary builds use `npm run build:model` and do not repeat candidate selection. Integration checks run in `npm test`; the browser smoke test is `npm run test:browser`.
