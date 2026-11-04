# Synthetic truth recovery

Simulator v2 on the real calendar through 2015; both sessions and graph evidence simulated; three paired seeds per scenario. Retrospective stress tests, not real-world validation. Recovery begins after two initial seasons. Uncertainty coverage is not evaluated.

| Scenario / session | Driver RMSE baseline / selected | Car RMSE baseline / selected | Teammate-gap RMSE baseline / selected | Field-gap RMSE baseline / selected | Mover-step RMSE baseline / selected |
| --- | --- | --- | --- | --- | --- |
| default.race | 18.07 / 16.16 | 34.60 / 31.48 | 26.32 / 19.95 | 63.00 / 52.75 | 12.76 / 8.05 |
| default.qual | 25.89 / 30.01 | 52.19 / 74.68 | 29.80 / 38.53 | 81.09 / 119.37 | 28.51 / 28.83 |
| persistent-fit.race | 19.80 / 16.72 | 33.89 / 30.89 | 31.15 / 22.93 | 63.86 / 53.06 | 13.06 / 8.17 |
| persistent-fit.qual | 26.01 / 30.05 | 52.12 / 74.69 | 30.11 / 38.78 | 80.85 / 119.32 | 28.44 / 28.81 |

These results are sensitive to the simulator assumptions; three seeds do not establish real-world accuracy. Per-seed results and further diagnostics are in the accompanying JSON.
