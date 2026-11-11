# Fixed midpoint drivers with conditional cars

Recorded source and input fingerprint: `a0f29aee72897f715044c2170518b21ca015bee8804c55c43ed6076e02f6d723`. This report describes [historical results](midpoint-results.json) and [simulated recovery](midpoint-simulation-results.json).

The fixed candidate is D = 0.5 × published portable driver rating + 0.5 × temporal graph driver rating. Cars are fitted from scratch conditional on those driver priors, using the same car filter and settings as the graph-only car experiment. This is one fixed candidate declared before scoring, with no weight search. The published driver rating already contains 5% graph, so the effective graph share is 52.5%. Cars do not feed back into the blended driver ratings. Both experimental arms use point forecasts and exclude the published filter’s internal driver–car fit term; the published comparator retains its actual uncertainty adjustment. See the [protocol](README.md).

Historical blocks have informed earlier model development. These retrospective results and their bootstrap intervals are not independent confirmation or equivalence tests. Complete forecast heads and graph uncertainty remain unevaluated.

## Historical comparison: 2008–2025

| Metric | Published | Graph + new cars | Midpoint + refitted cars |
| --- | ---: | ---: | ---: |
| race weighted log-loss | 0.3860 | 0.3963 | 0.3908 |
| race weighted Brier | 0.1254 | 0.1291 | 0.1272 |
| race weighted accuracy | 0.8114 | 0.8059 | 0.8099 |
| race weighted calibration slope | 0.9684 | 0.9634 | 0.9695 |
| race weighted ECE | 0.0085 | 0.0097 | 0.0078 |
| race unweighted log-loss | 0.3914 | 0.4010 | 0.3956 |
| race unweighted Brier | 0.1251 | 0.1288 | 0.1268 |
| race unweighted accuracy | 0.8181 | 0.8122 | 0.8155 |
| race unweighted calibration slope | 0.8481 | 0.8648 | 0.8575 |
| race unweighted ECE | 0.0215 | 0.0209 | 0.0213 |
| qual weighted log-loss | 0.3906 | 0.3969 | 0.3921 |
| qual weighted Brier | 0.1261 | 0.1283 | 0.1263 |
| qual weighted accuracy | 0.8166 | 0.8119 | 0.8157 |
| qual weighted calibration slope | 0.9524 | 0.9798 | 0.9754 |
| qual weighted ECE | 0.0063 | 0.0060 | 0.0089 |
| qual unweighted log-loss | 0.3859 | 0.3929 | 0.3887 |
| qual unweighted Brier | 0.1228 | 0.1253 | 0.1235 |
| qual unweighted accuracy | 0.8252 | 0.8192 | 0.8232 |
| qual unweighted calibration slope | 0.8638 | 0.8849 | 0.8687 |
| qual unweighted ECE | 0.0185 | 0.0136 | 0.0146 |
| In-season driver–car correlation | 0.145 | 0.007 | 0.078 |
| In-season driver vs car change slope | 0.068 | 0.003 | 0.032 |
| Driver vs observed team-performance change slope | 0.012 | 0.003 | 0.007 |
| Staying-driver mean change after five weekends | 0.634 | 2.982 | 1.808 |
| Staying-driver RMS movement / controls after five weekends | 1.496 | 1.807 | 1.888 |
| Median absolute driver-rating change | 0.718 | 1.196 | 0.910 |
| P90 absolute driver-rating change | 2.532 | 3.834 | 2.764 |
| P99 absolute driver-rating change | 6.372 | 9.621 | 6.837 |
| Consecutive driver-revision continuation | 0.557 | 0.542 | 0.543 |
| Consecutive car-revision continuation | 0.595 | 0.606 | 0.600 |
| Frozen teammate mover log-loss | 0.68884 | 0.71660 | 0.69952 |

The frozen mover primary covers 51 teammate-covered moves. Midpoint minus published is 0.01068 (95% move bootstrap -0.01369 to 0.03635). Midpoint minus graph is -0.01708 (-0.03659 to 0.00250). Neither mover interval establishes an improvement or equivalence.

The driver–car correlation uses 997 published versus 1,000 experimental windows. These are descriptive associations; lower values do not identify real-world driver or car truth. The staying-driver movement ratio rises under the midpoint even though its mean shift falls: it remains a concern, rather than a solved diagnostic.

## Paired ordinary loss differences

| Comparison: midpoint minus reference | Pooled weighted log-loss difference | 95% season-bootstrap interval |
| --- | ---: | --- |
| published | 0.00444 | 0.00248 to 0.00619 |
| graphNewCars | -0.00542 | -0.00666 to -0.00402 |

## Chronological blocks

| Weighted log-loss | Published | Graph + new cars | Midpoint + refitted cars |
| --- | ---: | ---: | ---: |
| 2008–2011 race | 0.3880 | 0.4047 | 0.3979 |
| 2008–2011 qual | 0.3671 | 0.3745 | 0.3680 |
| 2012–2015 race | 0.3625 | 0.3719 | 0.3669 |
| 2012–2015 qual | 0.3718 | 0.3803 | 0.3749 |
| 2016–2020 race | 0.3757 | 0.3829 | 0.3773 |
| 2016–2020 qual | 0.3774 | 0.3804 | 0.3777 |
| 2021–2025 race | 0.4099 | 0.4189 | 0.4141 |
| 2021–2025 qual | 0.4411 | 0.4474 | 0.4428 |

## Situation scores

| Unweighted log-loss | Published | Graph + new cars | Midpoint + refitted cars |
| --- | ---: | ---: | ---: |
| race rookie | 0.3472 | 0.3614 | 0.3522 |
| race mover | 0.4139 | 0.4472 | 0.4334 |
| race closeTeammates | 0.6844 | 0.6915 | 0.6861 |
| race largeFavorite | 0.2528 | 0.2583 | 0.2541 |
| race wetRace | 0.4728 | 0.4785 | 0.4765 |
| race earlyRegulationSeason | 0.4913 | 0.5074 | 0.4986 |
| qual rookie | 0.3494 | 0.3630 | 0.3527 |
| qual mover | 0.4348 | 0.4486 | 0.4437 |
| qual closeTeammates | 0.6926 | 0.6850 | 0.6850 |
| qual largeFavorite | 0.2533 | 0.2529 | 0.2535 |
| qual earlyRegulationSeason | 0.4966 | 0.5241 | 0.5202 |

Close-teammate and large-favorite membership depends on each model’s own forecasts, so those slices differ between models. Wet flags refer to race conditions.

## Synthetic recovery

Three paired seeds in each of two simulated worlds, through 2015, using matched driver coverage. These worlds do not quantify real driver or car truth.

| Scenario / metric | Published | Graph + new cars | Midpoint + refitted cars |
| --- | ---: | ---: | ---: |
| default.race / driver RMSE | 16.68 | 16.32 | 15.78 |
| default.race / car RMSE | 31.46 | 23.84 | 22.96 |
| default.race / teammate-gap RMSE | 19.02 | 22.22 | 20.89 |
| default.race / field-gap RMSE | 50.74 | 36.63 | 35.75 |
| default.race / mover-step RMSE | 6.42 | 8.14 | 6.70 |
| default.race / response to true in-season car change | 0.091 | 0.029 | 0.060 |
| default.race / response to true winter car change | 0.035 | 0.006 | 0.020 |
| default.race / winter car capture slope | 0.325 | 0.950 | 0.938 |
| default.qual / driver RMSE | 35.08 | 33.42 | 33.63 |
| default.qual / car RMSE | 75.56 | 65.71 | 67.51 |
| default.qual / teammate-gap RMSE | 46.41 | 44.79 | 44.61 |
| default.qual / field-gap RMSE | 125.94 | 112.19 | 114.28 |
| default.qual / mover-step RMSE | 30.63 | 30.60 | 30.44 |
| default.qual / response to true in-season car change | 0.013 | 0.002 | 0.007 |
| default.qual / response to true winter car change | 0.010 | 0.006 | 0.008 |
| default.qual / winter car capture slope | 0.193 | 0.297 | 0.295 |
| persistent-fit.race / driver RMSE | 17.08 | 17.60 | 16.58 |
| persistent-fit.race / car RMSE | 30.74 | 24.32 | 23.14 |
| persistent-fit.race / teammate-gap RMSE | 22.16 | 24.05 | 22.18 |
| persistent-fit.race / field-gap RMSE | 51.02 | 38.20 | 37.04 |
| persistent-fit.race / mover-step RMSE | 6.56 | 8.63 | 7.03 |
| persistent-fit.race / response to true in-season car change | 0.062 | -0.010 | 0.026 |
| persistent-fit.race / response to true winter car change | 0.042 | 0.018 | 0.030 |
| persistent-fit.race / winter car capture slope | 0.319 | 0.943 | 0.930 |
| persistent-fit.qual / driver RMSE | 35.12 | 33.67 | 33.60 |
| persistent-fit.qual / car RMSE | 75.53 | 64.98 | 67.13 |
| persistent-fit.qual / teammate-gap RMSE | 46.61 | 46.08 | 45.13 |
| persistent-fit.qual / field-gap RMSE | 125.91 | 111.09 | 113.73 |
| persistent-fit.qual / mover-step RMSE | 30.63 | 31.30 | 30.77 |
| persistent-fit.qual / response to true in-season car change | 0.012 | -0.006 | 0.003 |
| persistent-fit.qual / response to true winter car change | 0.010 | 0.011 | 0.011 |
| persistent-fit.qual / winter car capture slope | 0.192 | 0.298 | 0.294 |

## Partial 2026 monitoring

| Weighted log-loss | Published | Graph + new cars | Midpoint + refitted cars |
| --- | ---: | ---: | ---: |
| race | 0.3933 | 0.4076 | 0.4006 |
| qual | 0.3400 | 0.3510 | 0.3429 |

The main results are a measured compromise: midpoint losses, rating stability and mover predictions improve over the graph-only endpoint, while driver–car association increases and staying-driver movement relative to controls worsens. The published model retains lower ordinary loss. This report is a snapshot; the JSON commands regenerate the numeric results. Production files are unchanged.
