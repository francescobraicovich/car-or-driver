# Recent form and transfer forecasts

This report distinguishes long-term ratings from the faster form features used in forecasts. The long-term driver and car rating histories, the dated teammate graph, and the identical driver-learning rules across team changes remain unchanged. The comparison uses the archived published reference `7a44023e0b230847`.

The pre-Mexico installation used source `9eda03dd6d88facd`. Its archived verification rebuilt and compared the saved snapshots, confirming exact equality of every driver and car rating across the 619 weekends then available. The latest ratings view offers separate driver and car form adjustments. Form remains an explanatory forecast adjustment; it does not rewrite the history chart.

## 4 November 2026 data refresh

The local model now includes the Mexico City Grand Prix on 1 November 2026, round 19, for 620 weekends. Its model source is `af50be13b2dc0b29` and the local data manifest is `491b695e2c2870e3`. The [refresh verification](../research/current-form/mexico-refresh-verification.json) confirms that all 619 earlier driver and car rating histories are identical to the pre-Mexico model and that the forecast heads and model parameters are unchanged. The existing 2026 head remains trained through 2025; the data append did not refit it.

The current model includes Mexico in its live data and monitoring. The 2026 monitoring figures in the frozen component report below are the earlier pre-Mexico sample, through Austin; they were not recomputed for this refresh. The original trial and its selection criteria remain unchanged.

## First comparison

The fixed-family protocol compared the published forecast, a legacy refit, continuous form, rating-innovation form, and both new forms together. Historical folds cover 2008–2011, 2012–2015, 2016–2020, and 2021–2025; each head and its scaling use only earlier data. The final four years of each training prefix choose the ridge strength. All these periods had already informed development, so this is retrospective model selection, not an independent test. The 2026 season is monitoring only.

The continuous driver-and-car candidate reduced ordinary pooled pre-qualifying combined race and qualifying log-loss from 0.381597 to 0.381269, an improvement of 0.000328. Each of the four blocks improved, but the pooled change did **not** reach the predeclared minimum improvement of 0.001. Its paired season interval for the difference was −0.001813 to +0.001170. The innovation and combined families also failed the original selection gates; no model was selected in that trial. These intervals and point guards do not establish equivalence.

In a separate frozen-evidence forecast on 51 teammate-covered moves, the continuous candidate reduced move-balanced loss from 0.675757 to 0.657250, a difference of −0.018508. The paired whole-move bootstrap interval was −0.035980 to −0.002960; the season sensitivity interval was −0.033004 to −0.003641. All 51 moves have race and qualifying observations in both five- and ten-weekend cells, so averaging those cell means also gives each move equal weight. This is an augmented forecast using frozen driver form and ratings, not a change to frozen long-term ratings.

The strict frozen-rating benchmark remains 0.688843. It has its own calibration and scoring definition and should not be compared directly with the augmented forecast's 0.675757 reference as if they were the same model. In both tests portable driver evidence is frozen before the mover's final old-team weekend. The augmented test freezes both drivers' form as well, permits only deterministic aging afterward, and removes car form, car levels and old equipment fit for same-car comparisons. Ordinary adaptive forecasts can use evidence available before each new-team weekend and answer a different question; improvement after joining is not evidence of pre-move portability.

## Post hoc component follow-up

After inspecting the first results, a separate [component protocol](../research/current-form/component-protocol.md) prioritized the frozen-evidence transfer objective. It keeps the same continuous states, evidence, folds and reference, and refits driver-only, car-only and no-form heads rather than masking components in a fixed head. Its eligibility rules require at least 0.010 improvement in frozen-evidence loss, no deterioration in pooled ordinary pre-qualifying combined loss, and the other original pooled and block guards. The follow-up selected the continuous model with both components. The original failed gate remains a failure. This follow-up is post hoc, and its results cannot provide independent confirmation.

| Refit form components | Ordinary pre-qualifying race-and-qualifying loss | Frozen-evidence mover loss | Follow-up eligible |
| --- | ---: | ---: | --- |
| Both | 0.381269 | 0.657250 | Yes |
| Driver only | 0.384222 | 0.659568 | No |
| Car only | 0.382445 | 0.681095 | No |
| Neither | 0.386750 | 0.685175 | No |

The same-cutoff reference losses are 0.381597 and 0.675757 respectively. Removing either component worsened the ordinary pooled score; the driver-only refit also failed other guards. The car component cancels in a same-car frozen duel, so its value is assessed in ordinary field forecasts. The pre-Mexico partial 2026 monitoring period in that archived report is not an independent test: race pre-qualifying loss is 0.386913 versus 0.385382 for the reference, race post-qualifying is 0.312974 versus 0.311377, and qualifying is 0.326383 versus 0.329977. Full component diagnostics are in [the follow-up results](../research/current-form/component-results.json).

## Form mechanism

The continuous candidate derives qualifying percentage gaps, valid shared-window lap gaps and valid finishing-order or pre-failure snapshot evidence. Mechanical failure alone is not a pace loss; one-lap race classifications are excluded. It selects at most one supported observation per pair and channel, rejects equally supported conflicts, and scales evidence by field-size opportunities so weak coverage stays weak.

Each channel maintains separate driver and car states at rates 0.6 and 0.2. A joint ridge fit assigns each weekend's pairwise evidence to driver and car components. Teammate comparisons cancel the car term; other comparisons connect driver and car terms. This is a regularized attribution convention, not identification of the true causal contribution of either. State updates have bounded evidence support. Both driver and car states decay with a ten-completed-weekend half-life and retain 65% per elapsed winter. Driver form follows the driver without a transfer-specific reset or learning rate; car form follows car lineage through renames and starts separately after takeovers. A weekend's form updates happen only after both same-week forecasts.

Forecast heads use long-term driver and car levels, form features and bounded transforms. Post-qualifying heads may also use current qualifying and grid; pre-qualifying and qualifying heads do not. Ratings and form describe model-dependent estimates, not measurements of innate ability or causal effects.

Full scores, calibration, block and subgroup diagnostics are in [the fixed-family results](../research/current-form/results.json). Reproduction details and acceptance rules are in [the initial protocol](../research/current-form/protocol.md).

## Reproduction

Use the Python dependencies in `research/simplification/requirements.txt`. The archived reference heads and form implementation are kept in `research/current-form/`; no old model download is required. The export verifies the frozen long-term rating digest before writing comparison rows. With the pre-Mexico input snapshot identified in the export metadata restored, these commands reproduce the historical comparison and the disclosed follow-up, including the original failure. The frozen digest check rejects changed inputs; the refreshed data are not a substitute for that snapshot:

```sh
node research/current-form/export-rows.mjs
python research/current-form/fit-forecasts.py
python research/current-form/check-frozen-coverage.py
python research/current-form/fit-components.py
python research/current-form/export-fixtures.py --results research/current-form/component-results.json
node research/current-form/install-forecasts.mjs
npm run build:model
npm test
npm run test:browser
```

The large generated CSV files live under ignored `tmp/current-form/`. Their hashes and row counts are preserved in [export-metadata.json](../research/current-form/export-metadata.json). The [production verification](../research/current-form/production-verification.json) records rating-history equality, and 480 Python/JavaScript fixtures check the installed heads. Tests also compare the production continuous-form implementation with the evaluated prototype over the full calendar.

Final verification passed: the complete Node test set, Chrome browser suite, Python fitter/selection tests, ESLint/Prettier and publication checks. Two obsolete tests were updated: car cards now show form, and production form no longer equals the historical Elo form algorithm. The pre-Mexico production/prototype parity check covered the 619 weekends then available, 2,306 paired feature checks and every dated state. Serving/replay mean probability difference is 0.03 percentage points, with a worst checked pair of 0.44 points. The historical rating evaluation retained frozen mover loss 0.6888431259752807 and identical transfer-learning rules; its source/data fingerprint was `02229e54cb4aa74baa72b5e51e5c1ebf48908650094b5a39001fe0d2953fa4a8`, verified before and after scoring.

On the local site, select **Cars → form** at the latest weekend, with Race selected. Driver form is available through the same control. No deployment was performed. The large generated CSV files were removed after verification; the reproduction commands regenerate them.

The Race form display is a summary of pairwise forecast contributions, not an exact reconstruction of the nonlinear forecast head. Selecting Race or Qualifying changes the display only; forecasts continue to use both rating channels.
