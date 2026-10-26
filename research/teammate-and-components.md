# Teammate history and component changes: candidate checks

The published ratings were left unchanged. These are walk-forward candidate checks against the shipped state-space model, using the same fixed observation exam. The recent window below ends with the 2025 season; it is a second look, not an untouched holdout.

## Career teammate history

The existing filter already reads every earlier teammate pair, keeps a common state for each driver, and updates the full covariance across drivers and cars. A chain of past teammates therefore supplies transitive evidence without a separate graph. The experiment in `teammate_history.mjs` runs another filter on **teammate pairs only**, using each weekend's prior state for its forecasts. It blends that filter's portable driver level into the shipped level. A share of zero reproduces the shipped metrics exactly. The candidate sees no later weekend when forecasting an earlier one.

| Teammate-only share | Combined all-pair loss 2008–11 | 2012–15 | 2016–25 | Frozen mover teammate loss, first five weekends: 2002–11 / 2012–15 / 2016–25 |
| --- | ---: | ---: | ---: | ---: |
| 0 (shipped) | 0.384555 | 0.363950 | 0.398882 | 0.6494 / 0.7258 / 0.6728 |
| 0.25 | 0.384585 | 0.363906 | 0.399494 | 0.6608 / 0.7085 / 0.6583 |
| 0.50 | 0.385851 | 0.364839 | 0.401305 | 0.6746 / 0.6921 / 0.6450 |

The explicit graph helps later movers but hurts early movers. Even a 25% share makes the 2016–25 all-pair score worse by 0.00061, while 2012–15 gains just 0.00004. It uses the same observations twice rather than adding independent evidence. Its improvement on movers is consistent with reducing confidence in a rating that travels poorly; the test does not establish a new source of driver skill. This candidate fails the overall predictive guard, so the shipped driver rankings are not changed.

At a 25% share, the candidate changes the posted driver rank by 0.45 places on average in 2012–15 and 0.63 in 2024–25; 2.3% and 3.9% of driver pairs swap order, respectively. These are real ranking changes, but the forecasting checks above do not support publishing them.

## New power-unit elements

`collect_power_unit_reports.py` downloads official FIA event reports and extracts their text; `build_power_unit_events.py` validates race and driver identities and writes an audit CSV. `power-unit-events.csv` retains 691 reported component events in 2024–25, across 181 driver-weekends. One hundred seventeen driver-weekends introduce at least one ICE, turbocharger or motor generator unit; 19 are the 2025 season opener, when every starter used a new unit. Reports for the 2024 Dutch GP and one later 2024 Italian GP report returned 404, so these are **reported events, not a complete inventory of fitted components**. The reports do not say whether an element is a faster specification. A previously used element can also be refitted without entering the new-element report. [FIA decision documents](https://www.fia.com/documents/formula-1), [F1 component and penalty guide](https://www.formula1.com/en/latest/article/the-beginners-guide-to-formula-1-engine-and-gearbox-penalties.2TSy7BFgEvdNLojGLWS3F1).

`power_unit_effect.mjs` uses an event flag only when the official report's **date precedes** the qualifying or race date. It adds a candidate rating-point offset to forecasts of pairs where exactly one driver has a reported new core element. The coarse date rule excludes same-day reports rather than guessing their timing. It fits the offset on 2024 and checks it on 2025; the rest of the rating model is unchanged. This measures predictive association, not a causal horsepower gain.

| Session | 2024 affected-pair loss at zero | Best tested 2024 offset | 2025 affected-pair loss at zero → selected offset |
| --- | ---: | ---: | ---: |
| Race | 0.36171 (749 pairs) | 0 points | 0.36572 → 0.36572 (1,124 pairs) |
| Qualifying | 0.45827 (412 pairs) | +10 points, loss 0.45459 | 0.40204 → **0.40932** (624 pairs) |

The apparent 2024 qualifying gain reverses in 2025, raising its all-pair qualifying loss from 0.43598 to 0.43690. A fixed positive boost is not supported. With no positive race effect selected and the qualifying effect failing the next-season check, no component offset is added to the shipped ratings.

## Starting last after a parts change

Qualifying ratings use timed qualifying segments, not the starting grid. `qualifying_grid_check.mjs` changed every race grid position, including pit-lane starts: all **96,896 qualifying observations across 520 weekends and every qualifying rating were identical**.

Only 2 of the 98 audited **in-season** new core-element driver-weekends had an actual grid slot at least five places worse than their qualifying position. A new element within the allowed allocation generally does not cause a grid penalty; assuming one would insert false information.

Finishing order can still be affected by a grid penalty. `grid_disadvantage.mjs` identified 284 driver-weekends through 2025 with a pit-lane start or an actual grid slot at least five places behind timed qualifying position, then reduced only their finishing-order *learning* weight. Lap-pace evidence and all exam scoring weights stayed fixed. At half weight, all-pair loss rose from 0.384555 to 0.384653 in 2008–11, 0.363950 to 0.364334 in 2012–15, and 0.398882 to 0.399003 in 2016–25. Frozen mover teammate loss also rose in each window. The model already learns from like-for-like lap pace, and a large grid drop need not be a component penalty. This candidate was not shipped.

## Reproduce

With the research Python dependencies installed, collect and audit FIA reports:

```bash
mkdir -p tmp
python research/collect_power_unit_reports.py 2024 > tmp/fia-power-unit-2024.json
python research/collect_power_unit_reports.py 2025 > tmp/fia-power-unit-2025.json
python research/build_power_unit_events.py 2024 2025
# Inspect tmp/power-unit-events.csv and any reported extraction errors before replacing research/power-unit-events.csv.
```

Score the recorded candidates:

```bash
node research/teammate_history.mjs
node research/power_unit_effect.mjs
node research/qualifying_grid_check.mjs
node research/grid_disadvantage.mjs
```
