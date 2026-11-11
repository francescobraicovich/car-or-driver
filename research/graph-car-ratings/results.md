# Graph drivers with conditional car ratings: recorded results

This is a snapshot of the run with fingerprint `4292c227772a600086c7e9dd8a7976a8f4e4ecadd363b358fbd1127f4bf7a8ab`, using data through the 2026 Mexico City Grand Prix. [Historical results](results.json) and [simulation results](simulation-results.json) include all metrics. The commands in the [protocol](README.md) regenerate the JSON; this text records this particular run.

The three columns compare the published model, the same graph drivers with previously published cars, and the same graph drivers with newly fitted cars. The car filter receives only the graph known before each weekend. The graph arms use point predictions; the published model uses its existing uncertainty adjustment. No full-forecast heads were refitted.

## Predictive comparison: 2008–2025

| Metric | Published | Graph + published cars | Graph + new cars |
| --- | ---: | ---: | ---: |
| race weighted log-loss | 0.3860 | 0.3995 | 0.3963 |
| race weighted Brier | 0.1254 | 0.1303 | 0.1291 |
| race weighted accuracy | 0.8114 | 0.8048 | 0.8059 |
| race weighted calibration slope | 0.968 | 0.976 | 0.963 |
| race weighted ECE | 0.0085 | 0.0091 | 0.0097 |
| race unweighted log-loss | 0.3914 | 0.4055 | 0.4010 |
| race unweighted Brier | 0.1251 | 0.1305 | 0.1288 |
| race unweighted accuracy | 0.8181 | 0.8105 | 0.8122 |
| race unweighted calibration slope | 0.848 | 0.877 | 0.865 |
| race unweighted ECE | 0.0215 | 0.0184 | 0.0209 |
| qual weighted log-loss | 0.3906 | 0.4012 | 0.3969 |
| qual weighted Brier | 0.1261 | 0.1300 | 0.1283 |
| qual weighted accuracy | 0.8166 | 0.8093 | 0.8119 |
| qual weighted calibration slope | 0.952 | 0.983 | 0.980 |
| qual weighted ECE | 0.0063 | 0.0052 | 0.0060 |
| qual unweighted log-loss | 0.3859 | 0.3986 | 0.3929 |
| qual unweighted Brier | 0.1228 | 0.1275 | 0.1253 |
| qual unweighted accuracy | 0.8252 | 0.8158 | 0.8192 |
| qual unweighted calibration slope | 0.864 | 0.886 | 0.885 |
| qual unweighted ECE | 0.0185 | 0.0149 | 0.0136 |

The paired weighted log-loss difference for new cars minus published cars, holding graph drivers fixed, is **-0.00338** (95% season-bootstrap interval -0.00560 to -0.00098). This is a mixture of race and qualifying observation weights.

| Block / session | Published | Graph + published cars | Graph + new cars |
| --- | ---: | ---: | ---: |
| 2008–2011 race weighted log-loss | 0.3880 | 0.4052 | 0.4047 |
| 2008–2011 qual weighted log-loss | 0.3671 | 0.3785 | 0.3745 |
| 2012–2015 race weighted log-loss | 0.3625 | 0.3782 | 0.3719 |
| 2012–2015 qual weighted log-loss | 0.3718 | 0.3883 | 0.3803 |
| 2016–2020 race weighted log-loss | 0.3757 | 0.3858 | 0.3829 |
| 2016–2020 qual weighted log-loss | 0.3774 | 0.3830 | 0.3804 |
| 2021–2025 race weighted log-loss | 0.4099 | 0.4222 | 0.4189 |
| 2021–2025 qual weighted log-loss | 0.4411 | 0.4505 | 0.4474 |

## Mover and structural diagnostics

| Metric | Published | Graph + published cars | Graph + new cars |
| --- | ---: | ---: | ---: |
| Frozen teammate mover log-loss | 0.6888 | 0.7166 | 0.7166 |
| In-season driver–car correlation | 0.145 | 0.016 | 0.007 |
| In-season driver vs car slope | 0.068 | 0.009 | 0.003 |
| In-season driver vs observed team-performance slope | 0.012 | 0.003 | 0.003 |
| Five-week staying-driver mean change | 0.634 | 2.982 | 2.982 |
| Five-week staying-driver movement / controls | 1.496 | 1.807 | 1.807 |
| Driver-rating median absolute change | 0.718 | 1.196 | 1.196 |
| Driver-rating p90 absolute change | 2.532 | 3.834 | 3.834 |

The mover primary covers 51 teammate-covered moves. The graph arms have exactly the same primary mover score because the driver ratings are identical and the shared car cancels in teammate comparisons. The paired graph-minus-published mover difference is 0.02776 (95% move-bootstrap interval -0.01484 to 0.07323). Correlations and slopes are descriptive and cannot identify real driver or car truth.

## Synthetic truth recovery

Both simulated sessions and graph evidence use the same generated world, over the calendar through 2015. Three paired seeds per scenario are exploratory; these are not measurements of real driver or car strength. Driver recovery uses matched driver-weekend coverage.

| Scenario / metric | Published | Graph + published cars | Graph + new cars |
| --- | ---: | ---: | ---: |
| default.race / driver RMSE | 16.68 | 16.32 | 16.32 |
| default.race / car RMSE | 31.46 | 31.46 | 23.84 |
| default.race / teammate-gap RMSE | 19.02 | 22.22 | 22.22 |
| default.race / field-gap RMSE | 50.74 | 51.43 | 36.63 |
| default.race / mover-step RMSE | 6.42 | 8.14 | 8.14 |
| default.race / driver response to true in-season car change | 0.091 | 0.029 | 0.029 |
| default.race / car response to true winter car change | 0.325 | 0.325 | 0.950 |
| default.qual / driver RMSE | 35.08 | 33.42 | 33.42 |
| default.qual / car RMSE | 75.56 | 75.56 | 65.71 |
| default.qual / teammate-gap RMSE | 46.41 | 44.79 | 44.79 |
| default.qual / field-gap RMSE | 125.94 | 127.19 | 112.19 |
| default.qual / mover-step RMSE | 30.63 | 30.60 | 30.60 |
| default.qual / driver response to true in-season car change | 0.013 | 0.002 | 0.002 |
| default.qual / car response to true winter car change | 0.193 | 0.193 | 0.297 |
| persistent-fit.race / driver RMSE | 17.08 | 17.60 | 17.60 |
| persistent-fit.race / car RMSE | 30.74 | 30.74 | 24.32 |
| persistent-fit.race / teammate-gap RMSE | 22.16 | 24.05 | 24.05 |
| persistent-fit.race / field-gap RMSE | 51.02 | 51.40 | 38.20 |
| persistent-fit.race / mover-step RMSE | 6.56 | 8.63 | 8.63 |
| persistent-fit.race / driver response to true in-season car change | 0.062 | -0.010 | -0.010 |
| persistent-fit.race / car response to true winter car change | 0.319 | 0.319 | 0.943 |
| persistent-fit.qual / driver RMSE | 35.12 | 33.67 | 33.67 |
| persistent-fit.qual / car RMSE | 75.53 | 75.53 | 64.98 |
| persistent-fit.qual / teammate-gap RMSE | 46.61 | 46.08 | 46.08 |
| persistent-fit.qual / field-gap RMSE | 125.91 | 127.35 | 111.09 |
| persistent-fit.qual / mover-step RMSE | 30.63 | 31.30 | 31.30 |
| persistent-fit.qual / driver response to true in-season car change | 0.012 | -0.006 | -0.006 |
| persistent-fit.qual / car response to true winter car change | 0.192 | 0.192 | 0.298 |

## Latest experimental car ratings: 2026, round 19

These are field-centered combined rating points; they are experimental and not published on the site.

| Car | Published | Graph + new cars |
| --- | ---: | ---: |
| Mercedes | 1089.0 | 1101.1 |
| Ferrari | 1068.0 | 1071.5 |
| McLaren | 1057.6 | 1069.7 |
| Red Bull | 1036.1 | 1034.8 |
| RB F1 Team | 1020.4 | 1024.0 |
| Alpine F1 Team | 1003.8 | 995.4 |
| Audi | 980.3 | 979.1 |
| Haas F1 Team | 974.2 | 957.8 |
| Williams | 946.2 | 939.3 |
| Aston Martin | 929.4 | 926.4 |
| Cadillac | 895.1 | 900.9 |

Historical periods informed model development, so these are retrospective tests, not independent confirmation. The simulation uses a limited set of worlds and seeds. Graph uncertainty, complete forecast heads, and production deployment have not been evaluated or changed. Rating-only observation weights can depend on the observed gap.
