# Synthetic truth recovery

Simulator v2 on the real calendar through 2015; both sessions and graph evidence simulated; three paired seeds per scenario. Retrospective stress tests, not real-world validation. Recovery begins after two initial seasons. Uncertainty coverage is not evaluated.

| Scenario / session | Driver RMSE baseline / selected | Car RMSE baseline / selected | Teammate-gap RMSE baseline / selected | Field-gap RMSE baseline / selected | Mover-step RMSE baseline / selected |
| --- | --- | --- | --- | --- | --- |
| default.race | 18.07 / 16.68 | 34.60 / 31.46 | 26.32 / 19.02 | 63.00 / 50.74 | 12.76 / 6.42 |
| default.qual | 25.89 / 35.08 | 52.19 / 75.56 | 29.80 / 46.41 | 81.09 / 125.94 | 28.51 / 30.63 |
| persistent-fit.race | 19.80 / 17.08 | 33.89 / 30.74 | 31.15 / 22.16 | 63.86 / 51.02 | 13.06 / 6.56 |
| persistent-fit.qual | 26.01 / 35.12 | 52.12 / 75.53 | 30.11 / 46.61 | 80.85 / 125.91 | 28.44 / 30.63 |

| Scenario / session | In-season driver response to true car change | Winter driver response to true car change | Winter car response to true car change |
| --- | ---: | ---: | ---: |
| default.race | 0.09 | 0.03 | 0.33 |
| default.qual | 0.01 | 0.01 | 0.19 |
| persistent-fit.race | 0.06 | 0.04 | 0.32 |
| persistent-fit.qual | 0.01 | 0.01 | 0.19 |

The slopes compare estimated changes with simulated true car changes; zero driver response is the synthetic target when true changes are independent. Detailed structural diagnostics for each seed are in the JSON.

These results are sensitive to the simulator assumptions; three seeds do not establish real-world accuracy. Per-seed results and further diagnostics are in the accompanying JSON.
