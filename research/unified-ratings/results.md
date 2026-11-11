# Unified ratings: completed research through step 9

Selected: **joint three-output model with learned sharing, measurement noise and adaptation; all three evidence refinements**. Production is unchanged.

The user's explicit preference for a theoretically coherent model with a small predictive trade-off governs the research selection. Individual failed/inconclusive comparisons remain visible; this is not a claim that every component improves every score.

## Fixed historical exam, 2008–2025

Rows are distinct comparisons, balanced so each weekend has equal total influence within each target. Overall includes actual classified finishing outcomes with retirements; timing metrics use unchanged comparison targets. Calibration is trained on earlier years only.

| Model | Overall log-loss | Qualifying margin MAE | Race-pace margin MAE |
| --- | ---: | ---: | ---: |
| Installed Thursday head | 0.611316 | 0.8170% | 0.7010% |
| Head recalibrated for actual results | 0.536106 | 0.8170% | 0.7010% |
| Published ratings, same target calibration | 0.531721 | 0.8170% | 0.7010% |
| control | 0.531836 | 0.6512% | 0.6017% |
| pooling | 0.531401 | 0.6503% | 0.6003% |
| noise | 0.534190 | 0.6716% | 0.6198% |
| adaptation | 0.529527 | 0.6367% | 0.5865% |
| combined | 0.530118 | 0.6467% | 0.5938% |
| refined_all | 0.530117 | 0.6468% | 0.5939% |

MAE is fractional lap duration in percentage points. The installed head was trained on a weighted pace/order benchmark, so its raw loss on actual results is not a fair architecture-only comparison. The recalibrated head and equally calibrated published ratings are the informative controls.

Selected overall loss difference versus equally calibrated published ratings: **-0.001604**, paired 95% season interval **[-0.0031317332975918273, -9.428975123803222e-05]**.
Selected overall loss difference versus recalibrated installed heads: **-0.005989**, paired 95% season interval **[-0.01014260037305765, -0.002833688392841048]**.

## Separate evidence refinements

| Change | Original-exam overall loss | Revised-exam qualifying MAE | Revised-exam pace MAE |
| --- | ---: | ---: | ---: |
| combined | 0.530118 | 0.6441% | 0.6015% |
| refined_qualifying | 0.530095 | 0.6428% | 0.6015% |
| refined_pace | 0.530111 | 0.6442% | 0.6010% |
| refined_retirement | 0.530144 | 0.6441% | 0.6015% |
| refined_all | 0.530117 | 0.6429% | 0.6010% |

Q2/Q1 replaces fuel-loaded Q3 in 2006–2009; race laps must actually overlap before window aggregation; pre-retirement position snapshots are omitted. Effects on overall prediction are tiny. These changes are retained for clearer measurement interpretation, not advertised as statistically established forecast gains. Both original and revised exams are preserved in results.json.

## Attribution, transfers and uncertainty

Frozen transfer loss: published **0.677990**, selected **0.679261**, across **51** matched moves. Difference **+0.001271**, paired move interval **[-0.024186861250390542, 0.023360381689689222]**. This uses the new three-target exam, with slopes fitted only on earlier frozen stayer duels; it is not numerically interchangeable with earlier graph-study mover scores.

Overall rating p90 movement: **2.406 → 3.570 points**. Field-spread-normalized ratio: **1.239**. The new model is more responsive and less steady; the difference is not hidden by rating rescaling.

Same-team driver/car consecutive-revision correlation: **0.206 → 0.104**. This is descriptive, not causal proof of better attribution.

Timing predictive 90% interval coverage: qualifying **94.4%**, pace **94.8%**. These intervals are conservative in aggregate. They are observation intervals, not validated driver-rating confidence intervals.

## Decision guards

| Guard | Result |
| --- | --- |
| overallPooled | Pass |
| overallBlocks | Pass |
| timingPooled | Pass |
| timingBlocks | Pass |
| frozenTransfers | Pass |
| normalizedStability | Pass |

Passing uncertainty intervals does not establish equivalence or account for all historical model development. The research selection does not override failed guards or authorize step 10.

## Synthetic recovery

Three paired seeds in four fixed worlds compare the unified control and learned combination. All channels share correlated weekend noise. A known car shock and a driver swap test attribution; persistent driver–car fit and weak specialization deliberately challenge the model.

| World | Model | Overall driver RMSE | Overall car RMSE | Driver-gap 90% coverage, all channels |
| --- | --- | ---: | ---: | ---: |
| shared | control | 12.07 | 15.81 | 98.5% |
| shared | combined | 11.75 | 14.77 | 99.7% |
| specialization | control | 10.44 | 12.87 | 98.2% |
| specialization | combined | 11.02 | 12.33 | 94.8% |
| persistent_fit | control | 14.20 | 21.33 | 62.7% |
| persistent_fit | combined | 14.25 | 19.57 | 78.7% |
| heavy_noise | control | 11.52 | 16.71 | 95.1% |
| heavy_noise | combined | 11.46 | 14.66 | 98.2% |

Car recovery generally improves, but stronger pooling can harm genuinely specialized drivers. Persistent driver–car fit causes undercoverage; other worlds show conservative intervals. The model does not recover universal car-free ability, and these simulations are not an independent validation against the production model.

## Monitoring and reproducibility

2026 overall log-loss: selected **0.523038**, equally calibrated published ratings **0.529625**. Monitoring was not used to tune global parameters.

Data end: **2026-11-01**. Production source fingerprint: `fea98d27eb07cdb7`. Input fingerprint: `d17da21e8d6958110aacf776e5450c40727c0b421049edab4408d72e3be80b33`.

The numerical solver checked convergence for every update. Focused tests cover derivatives, symmetry, exact teammate cancellation, partial pooling, invalid inputs, duplicates, chronology, covariance, weak connections, transfer invariance, retirement handling and serialized forecasting. Full production regression results are recorded in verification.json.

Files: [selection](selection.json), [all metrics](results.json), [latest ratings](latest-ratings.json), [situation diagnostics](situations.json), [simulation results](simulation-results.json), [manifest](manifest.json), [reproduction](README.md).
