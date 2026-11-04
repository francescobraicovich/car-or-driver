# Rejected persistent-model synthetic truth recovery

Simulator v2 on the real calendar through 2015; both sessions and graph evidence simulated; three paired seeds per scenario. Retrospective stress tests, not real-world validation. Recovery begins after two initial seasons. Uncertainty coverage is not evaluated.

| Scenario / session | Driver RMSE baseline / selected | Car RMSE baseline / selected | Teammate-gap RMSE baseline / selected | Field-gap RMSE baseline / selected | Mover-step RMSE baseline / selected |
| --- | --- | --- | --- | --- | --- |
| default.race | 18.07 / 18.83 | 34.60 / 38.08 | 26.32 / 24.63 | 63.00 / 63.74 | 12.76 / 9.14 |
| default.qual | 25.89 / 28.83 | 52.19 / 60.27 | 29.80 / 35.33 | 81.09 / 94.79 | 28.51 / 28.92 |
| persistent-fit.race | 19.80 / 19.82 | 33.89 / 37.37 | 31.15 / 29.33 | 63.86 / 64.69 | 13.06 / 9.26 |
| persistent-fit.qual | 26.01 / 28.93 | 52.12 / 60.26 | 30.11 / 35.60 | 80.85 / 94.66 | 28.44 / 28.89 |

These results are sensitive to the simulator assumptions; three seeds do not establish real-world accuracy. Per-seed results and further diagnostics are in the accompanying JSON.
