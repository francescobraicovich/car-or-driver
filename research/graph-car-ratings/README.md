# Temporal graph drivers and conditional car ratings

This is a research experiment, not the production model. The temporal teammate graph supplies 100% of both race and qualifying driver ratings. A separate state-space car filter learns cross-team performance conditional on the graph's **pre-weekend** driver levels. The same prior graph levels are used for that weekend's car update; the graph's post-weekend levels are used only for the posted driver ratings. Teammate observations cannot update the shared car level.

The initial candidate inherits the published race and qualifying car priors, winter and within-season drift, likelihood weights and observation definitions. Driver states, driver–car fit, rookie adjustments and driver-specific uncertainty in the car filter are disabled. No parameters are fitted or selected on the validation blocks. Predictions from both graph candidates are point predictions: neither supplies calibrated graph uncertainty. The published comparator retains its existing forecast uncertainty adjustment.

The original three arms are the published model; graph drivers with the published model's fixed car ratings (the earlier exploratory comparison); and graph drivers with the new conditional car ratings. The fixed-car arm is not a separately fitted car model. All arms are scored on the same chronological pairwise observations and frozen mover events. Calibration for each block uses preceding seasons only. Historical blocks have already informed model development, so they are retrospective and are not independent holdouts; 2026 is partial monitoring. Complete forecast heads and uncertainty coverage are not evaluated by this experiment.

## Fixed midpoint extension

Before scoring this extension, fix one additional candidate: 50% published portable driver rating plus 50% temporal graph rating, separately for each session. Refit the conditional car filter against those blended pre-weekend driver levels. The driver inputs are the posted portable levels, without the published filter's internal driver–car fit term. The same driver blend is used in forecasts and posted ratings, with no special treatment of movers. Cars never feed back into these driver histories. Predictions are point predictions, as in the graph-only controls. The published rating already includes 5% graph, so the effective total graph share is 52.5%, rather than an independent 50% source.

This is one fixed midpoint experiment, with no weight search or selection on the scored blocks. Measure predictive and frozen mover losses, attribution, stability, teammate arrivals and simulated recovery against both endpoints. A lower driver–car correlation is a diagnostic, not a constraint or proof of correct attribution. The midpoint can inherit some of the published model's car-related driver movement; the experiment measures that cost explicitly.

The evaluation also records the latest experimental driver and car ratings in each arm, on the same 1000-point centered display scale as the site. These are research outputs, not website data.

The simulation uses both simulated sessions and graph evidence, the same real calendar through 2015, and three paired seeds each for the default and persistent driver–car fit worlds. It compares recovery of driver, car and gap strengths, and known simulated car shocks. Driver recovery is scored on the same driver-weekend identities in all three arms; the results record counts. The simulated worlds are imperfect and the small seed count is exploratory.

```sh
node research/graph-car-ratings/evaluate.mjs
node research/graph-car-ratings/simulation.mjs
node tests/test-graph-car-research.mjs
```

The commands now write `midpoint-results.json` and `midpoint-simulation-results.json`. The original three-arm results remain in `results.json`, `simulation-results.json` and `results.md` as a dated snapshot with its earlier source fingerprint. Generated reports describe the actual settings and limitations; no production files are changed.
