# Selected rating model: synthetic truth recovery

Simulator v2 generated both race and qualifying evidence on the real calendar through 2015, using three paired seeds for each scenario. The default scenario uses the simulator's normal driver–team fit; the persistent-fit scenario increases fit spread threefold and winter persistence to 0.95. Values below are averages of three per-seed metrics, with the frozen original first and the selected rounded-filter, lean-ranking and no-car-link model second. Lower RMSE is better. These are stress tests under specified simulation assumptions, not validation against real-world truth. They do not evaluate uncertainty coverage.

| Scenario and session | Driver RMSE | Car RMSE | Teammate gap RMSE | Field gap RMSE | Winter car-to-driver leakage | Mover-step RMSE |
| --- | --- | --- | --- | --- | --- | --- |
| Default race | 17.64 → 18.07 | 38.76 → 34.60 | 25.84 → 26.31 | 67.34 → 63.00 | 0.152 → 0.153 | 12.31 → 12.76 |
| Default qualifying | 25.89 → 25.89 | 52.60 → 52.19 | 29.82 → 29.80 | 81.64 → 81.09 | 0.045 → 0.045 | 28.51 → 28.51 |
| Persistent-fit race | 19.26 → 19.80 | 37.88 → 33.89 | 30.40 → 31.15 | 67.86 → 63.86 | 0.164 → 0.165 | 12.50 → 13.06 |
| Persistent-fit qualifying | 26.01 → 26.01 | 52.53 → 52.12 | 30.14 → 30.11 | 81.40 → 80.85 | 0.045 → 0.045 | 28.44 → 28.44 |

The selected model has somewhat higher race driver, teammate-gap and mover-step errors but lower race car and field-gap RMSE in both scenarios; qualifying driver errors are close, with lower car and field-gap RMSE in these runs. The average estimated leakage slope changes little. Only three seeds were used, so these differences should not be treated as precise estimates. Per-seed results, season leakage and car-capture slopes are in `selected-simulation-results.json`; reproduce with `node research/simplification/candidates-selected-simulation.mjs`.
