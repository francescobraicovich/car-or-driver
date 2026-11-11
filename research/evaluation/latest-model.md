# Published-model evaluation through the 2026 Mexico City Grand Prix

This report uses the local data through 1 November 2026. The [machine-readable evaluation](latest-model.json) contains all folds, mover cells, stability summaries, checks and intervals. Historical periods have informed model development: chronological prediction prevents future observations entering a weekend's prediction, but these are not independent holdouts. The partial 2026 season is monitoring only. Observations are pairwise race finish, lap-pace and retirement comparisons and qualifying comparisons, with fixed weights; weights can depend on the observed gap, so these scores describe a weighted population rather than unconditional finish probabilities.

## Ratings alone: chronological calibration

Calibration is fitted only on the years before each block. Log-loss and Brier are lower-is-better; a 50–50 forecast scores 0.6931 and 0.2500 respectively. Accuracy is weighted. Calibration slope 1 is ideal; expected calibration error (ECE) is lower-is-better. Race and qualifying are separate.

| Period | Session | Log-loss | Brier | Accuracy | Calibration slope | ECE |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 2008–2011 | Race | 0.3880 | 0.1265 | 81.05% | 0.986 | 0.0084 |
| 2008–2011 | Qualifying | 0.3671 | 0.1177 | 83.15% | 1.039 | 0.0116 |
| 2012–2015 | Race | 0.3625 | 0.1176 | 82.37% | 1.004 | 0.0083 |
| 2012–2015 | Qualifying | 0.3718 | 0.1209 | 82.54% | 0.926 | 0.0136 |
| 2016–2020 | Race | 0.3757 | 0.1224 | 81.24% | 0.983 | 0.0097 |
| 2016–2020 | Qualifying | 0.3774 | 0.1215 | 81.89% | 0.965 | 0.0105 |
| 2021–2025 | Race | 0.4099 | 0.1325 | 80.24% | 0.928 | 0.0170 |
| 2021–2025 | Qualifying | 0.4411 | 0.1427 | 79.32% | 0.901 | 0.0141 |
| 2026 to date | Race | 0.3933 | 0.1284 | 81.12% | 0.991 | 0.0248 |
| 2026 to date | Qualifying | 0.3400 | 0.1098 | 83.39% | 1.175 | 0.0181 |

The 2026 sample covers 19 weekends, 6,613 race comparisons and 4,255 qualifying comparisons. The underlying rows are not independent: the same drivers recur, and the scoring weights give extra emphasis to teammate duels.

## Complete forecast heads

These figures come from the rebuilt published model's per-weekend diagnostics. Race pre-qualifying and race post-qualifying are different information sets. The combined scores average race and qualifying losses using their observation weights. They are not directly comparable to the chronologically recalibrated ratings-only rows above, which use another calibration procedure.

| Period | Race pre-qualifying loss / Brier / accuracy | Race post-qualifying loss / Brier / accuracy | Qualifying loss / Brier / accuracy | Combined pre / post loss |
| --- | --- | --- | --- | --- |
| 2008–2011 | 0.3842 / 0.1257 / 81.60% | 0.3336 / 0.1052 / 85.06% | 0.3527 / 0.1133 / 83.68% | 0.3807 / 0.3357 |
| 2012–2015 | 0.3602 / 0.1165 / 82.77% | 0.3213 / 0.1007 / 85.95% | 0.3598 / 0.1169 / 82.88% | 0.3602 / 0.3253 |
| 2016–2020 | 0.3709 / 0.1208 / 81.44% | 0.3266 / 0.1031 / 85.09% | 0.3655 / 0.1175 / 82.29% | 0.3704 / 0.3305 |
| 2021–2025 | 0.4036 / 0.1306 / 80.59% | 0.3305 / 0.1028 / 85.95% | 0.4330 / 0.1402 / 79.52% | 0.4060 / 0.3391 |
| 2008–2025 | 0.3815 / 0.1239 / 81.50% | 0.3281 / 0.1029 / 85.55% | 0.3791 / 0.1224 / 82.02% | 0.3813 / 0.3331 |
| 2026 to date | 0.3852 / 0.1238 / 81.62% | 0.3170 / 0.0975 / 86.96% | 0.3224 / 0.1034 / 85.09% | 0.3783 / 0.3176 |

Across all 620 weekends, 119,334 saved driver and car rating/uncertainty values and the existing forecast diagnostic values were unchanged from the pre-removal model.

The earlier full-forecast acceptance report identifies a different source hash, so the current evaluator correctly reports that gate as unavailable rather than a fresh pass. The figures above score the installed heads; they do not constitute a new independent acceptance test.

## Frozen movers and stability

The primary frozen-rating transfer score is **0.68884** over 51 teammate-covered moves. It averages race and qualifying, each at five and ten new-team weekends, giving moves equal weight within each cell. The frozen rating was recorded before the driver's final old-team weekend. The four cell losses are 0.70380 and 0.69978 for race at five and ten weekends, and 0.67233 and 0.67946 for qualifying. A 50–50 forecast scores 0.6931.

Against the archived faster-learning reference, the primary score is worse by 0.01395 (paired move-bootstrap 95% interval −0.00956 to +0.03712). Several original predictive guards fail; a stability preference does not make them passes. From 2008–2025, absolute combined driver-rating changes have median 0.718, p90 2.532 and p99 6.372 points per appearance; the season-bootstrap intervals are 2.309–2.796 for p90 and 5.917–7.040 for p99. The report retains the field-mover scores and coverage separately.

## Circuit and wet scenarios

The circuit-only adjustment yields a 2008–2025 finishing-order log-loss of 0.391995 versus 0.392506 without the adjustment (paired race-bootstrap difference −0.000511, 95% interval −0.000837 to −0.000166). This is a separate scenario-style score, not the complete forecast-head score above. Driver-specific wet effects are disabled because results were mixed and uncertain; the model keeps its general wet calibration. See [the scenario validation](../scenario-effects/README.md) for the individual blocks, Brier scores, sample limitations and reproducible command.

## Synthetic recovery

The current published rating pipeline was also run in synthetic worlds through 2015 with three paired seeds per scenario. In the default world its driver / car RMSE is **16.68 / 31.46 points for race** and **35.08 / 75.56 for qualifying**. Teammate-gap RMSE is 19.02 for race and 46.41 for qualifying; cross-team gap RMSE is 50.74 and 125.94 respectively. In a persistent driver–car fit world, driver / car RMSE is 17.08 / 30.74 for race and 35.12 / 75.53 for qualifying. [The simulation report](latest-simulation.md) and [results](latest-simulation.json) include baseline comparisons, all metrics and per-seed values. Reproduce them with `node research/stable-ratings/selected-simulation.mjs research/evaluation/latest-simulation`.

These are simulator-dependent stress tests, not measurements of real driver or car strengths; the simulator's realism is limited and three seeds do not quantify all uncertainty. Complete-blend uncertainty coverage was not evaluated.

## Structural and situation diagnostics

The following are retrospective 2008–2025 diagnostics, not causal estimates. The model and individual slices were informed by historical development. Counts are correlated observations, not independent events. Detailed windows, 2026 monitoring, bootstrap intervals, reliability bins and simulation comparisons are in the [machine-readable evaluation](latest-model.json).

| Rating | Staying driver: arrivals over 5 weekends, count / mean change / movement ratio | In-season: driver–car correlation / slope / team-performance slope | Unchanged-lineup winter: correlation / slope | Consecutive driver / car revisions continuing |
| --- | --- | --- | --- | --- |
| race | 101 / 0.695 [-0.311, 1.612] / 1.564 [1.277, 1.817] | 0.222 / 0.097 [0.059, 0.135] / 0.017 [0.011, 0.025] | 0.433 / 0.073 [0.059, 0.082] | 54.6% / 59.6% |
| qual | 101 / 0.521 [-0.290, 1.292] / 1.307 [1.004, 1.800] | 0.065 / 0.034 [-0.007, 0.071] / 0.009 [-0.005, 0.029] | 0.143 / 0.020 [0.012, 0.028] | 59.6% / 58.6% |
| combined | 101 / 0.634 [-0.305, 1.460] / 1.496 [1.203, 1.787] | 0.145 / 0.068 [0.026, 0.108] / 0.012 [0.004, 0.022] | 0.361 / 0.053 [0.042, 0.061] | 55.7% / 59.5% |

Intervals are 95% season-bootstrap intervals. The movement ratio compares the RMS change of staying drivers with stable-driver controls; the mean is the signed change after subtracting the controls. The combined rating’s team-performance reference uses race observations. Rating and team-performance changes share evidence, so nonzero slopes do not by themselves prove misattribution.

| Session / situation | Observations | Weighted loss | Unweighted loss | Unweighted Brier | Unweighted calibration slope | Unweighted ECE | Unweighted finish loss |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| race / all | 120940 | 0.3860 | 0.3914 | 0.1251 | 0.848 | 0.0215 | 0.3880 |
| race / rookie | 17803 | 0.3180 | 0.3472 | 0.1090 | 0.853 | 0.0169 | 0.3215 |
| race / mover | 10235 | 0.4083 | 0.4139 | 0.1346 | 0.915 | 0.0168 | 0.4020 |
| race / closeTeammates | 2060 | 0.6876 | 0.6844 | 0.2457 | 1.109 | 0.0222 | 0.6890 |
| race / largeFavorite | 78522 | 0.2043 | 0.2528 | 0.0695 | 0.850 | 0.0206 | 0.2509 |
| race / wetRace | 13073 | 0.4732 | 0.4728 | 0.1497 | 0.659 | 0.0551 | 0.4908 |
| race / earlyRegulationSeason | 5995 | 0.4358 | 0.4913 | 0.1576 | 0.688 | 0.0566 | 0.4521 |
| qual / all | 74158 | 0.3906 | 0.3859 | 0.1228 | 0.864 | 0.0185 | n/a |
| qual / rookie | 11281 | 0.3501 | 0.3494 | 0.1102 | 0.862 | 0.0186 | n/a |
| qual / mover | 6343 | 0.4322 | 0.4348 | 0.1414 | 0.866 | 0.0217 | n/a |
| qual / closeTeammates | 1067 | 0.6916 | 0.6926 | 0.2497 | 0.535 | 0.0217 | n/a |
| qual / largeFavorite | 48779 | 0.2179 | 0.2533 | 0.0699 | 0.862 | 0.0189 | n/a |
| qual / earlyRegulationSeason | 3866 | 0.4748 | 0.4966 | 0.1611 | 0.682 | 0.0631 | n/a |

These are chronologically calibrated ratings-only predictions, rather than complete forecast heads. Unweighted composite scores still mix finishing order, lap pace and retirement comparisons; the finish-only column is restricted to race finishing-order observations. Situation thresholds and eligibility definitions are documented in [backtesting](../../docs/backtesting.md).
