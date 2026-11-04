# Synthetic truth recovery

Simulator v2 on the real calendar through 2015; both sessions and graph evidence simulated; three paired seeds per scenario. Retrospective stress tests, not real-world validation. Recovery begins after two initial seasons. Uncertainty coverage is not evaluated.

| Scenario / session | Driver RMSE baseline / selected | Car RMSE baseline / selected | Teammate-gap RMSE baseline / selected | Field-gap RMSE baseline / selected | Mover-step RMSE baseline / selected |
| --- | --- | --- | --- | --- | --- |
| default.race | 18.07 / 16.15 | 34.60 / 31.48 | 26.32 / 19.97 | 63.00 / 52.75 | 12.76 / 8.06 |
| default.qual | 25.89 / 29.97 | 52.19 / 74.68 | 29.80 / 38.46 | 81.09 / 119.35 | 28.51 / 28.82 |
| persistent-fit.race | 19.80 / 16.71 | 33.89 / 30.89 | 31.15 / 22.96 | 63.86 / 53.07 | 13.06 / 8.19 |
| persistent-fit.qual | 26.01 / 30.01 | 52.12 / 74.69 | 30.11 / 38.72 | 80.85 / 119.29 | 28.44 / 28.80 |

These results are sensitive to the simulator assumptions; three seeds do not establish real-world accuracy. Per-seed results and further diagnostics are in the accompanying JSON.
