# Literature comparison of the published ratings

This report compares the current model with the four previously identified references. It distinguishes calculations on the same local observations from published figures on potentially different samples. Neither the 2023 teammate evaluation nor the Rane period is an untouched test of the model: its settings were selected after historical results were inspected.

Reproduce the calculations and per-race details with:

```sh
npm run research:literature-benchmark -- research/temporal-graph/literature-benchmark-results.json
npm run research:rane-benchmark -- research/temporal-graph/rane-benchmark-results.json
```

The [saved output](temporal-graph/literature-benchmark-results.json) records production source hash `7a44023e0b230847` and the data fingerprint. It includes the evaluated 2023 pairs, per-race ranking log probabilities, and predicted and observed race-rank histograms in 2015, 2019, and 2021.

## Results and comparability

| Reference | Their reported result | Model or comparison on our data | Interpretation |
| --- | --- | --- | --- |
| [Rane (2025)](https://arxiv.org/abs/2508.00200) | Mean race Kendall tau 0.625, 2014–2024, DNFs excluded | 0.6338; 228 races. Finisher-relative rank MAE 2.2625 places. | Indicative only: the paper's exact observations, predictions and MAE definition have not been verified. See [Rane benchmark](rane-benchmark.md). |
| [van Kesteren and Bergkamp (2023)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10660124/) | Basic model leave-one-out expected log predictive density −3993.36; qualitative posterior predictive checks in 2015 and 2019. | An explicitly imposed Plackett–Luce extension of our pre-weekend ratings gives total forward log probability −4061.96 for 160 races, 2014–2021, and produces the saved 2015 and 2019 rank distributions. | **The two log scores are not comparable:** their model is refitted with leave-one-out cross-validation; ours is a forward forecast, with different underlying data and an added ranking likelihood. They did not publish matching forward scores or prediction draws. |
| [Lindner et al. (2026)](https://arxiv.org/html/2608.04629) | Qualitative posterior predictive checks for 2021 show Verstappen's results more concentrated in the top two than their replicated seasons. No comparable single accuracy score is reported. | Conditional on our 19 observed finishes in 2021, Verstappen finished in the top two 18 times; our added ranking extension predicts an average of 10.61 top-two finishes in 2,000 simulations per race. The output also includes Alonso and Mazepin. | Qualitatively similar discrepancy, but not a head-to-head test: our draws use pre-weekend ratings, condition on finishers and omit posterior and parameter uncertainty; their smoothed posterior draws use a different model and can use later observations. The paper also checks continuous qualifying times, which our ratings do not directly predict. |
| [Teammate Elo and ridge project](https://github.com/vietandang2512/f1-driver-ability) | For 2023, the project reports frozen Elo accuracy 56.3% race / 59.5% qualifying and ridge accuracy 69.9% / 66.9%. | On our 2023 local sample, frozen model accuracy is 65.3% / 58.1%; reconstructed frozen Elo is 69.5% / 60.5%. Rolling model accuracy is 70.3% / 70.2%; reconstructed rolling Elo is 75.4% / 67.0%. | The author figures are not matched to our observations; see below. The same-row Elo comparison is a reconstruction of the described formula, not a run of the author's source code. The small 2023 sample and a neutral prior for rookies limit the frozen comparison. |

These papers do not provide a common, paired comparison of driver–car separation. Their reported values are not evidence that one model definitively wins. In particular, the Bayesian papers' posterior predictive draws and leave-one-out scores cannot be substituted for the model's forward forecasts, and the model does not define a probability distribution over continuous qualifying times.

## Teammate scoring

The comparison follows the teammate project's documented best-session qualifying time and 2023 frozen holdout concept as far as the local CSVs permit. Each teammate pair is one observation; ties in outcomes are excluded, while a tied forecast receives half a correct prediction. Brier and log loss are unweighted means, lower is better. Probabilities use the ratings' fixed scales; there is no calibration fitted on 2023.

| 2023 observations | Forecast | Pairs | Accuracy | Brier |
| --- | --- | ---: | ---: | ---: |
| Race, both lead-lap finishers with recorded times | Model, updated each weekend | 118 | 70.3% | 0.1896 |
| Same | Reconstructed Elo, updated each weekend | 118 | 75.4% | 0.1888 |
| Same | Model frozen at end of 2022 | 118 | 65.3% | 0.2066 |
| Same | Reconstructed Elo frozen at end of 2022 | 118 | 69.5% | 0.2018 |
| Qualifying, fastest valid Q1/Q2/Q3 time | Qualifying rating, updated each weekend | 215 | 70.2% | 0.1946 |
| Same | Reconstructed Elo, updated each weekend | 215 | 67.0% | 0.2002 |
| Same | Qualifying rating frozen at end of 2022 | 215 | 58.1% | 0.2284 |
| Same | Reconstructed Elo frozen at end of 2022 | 215 | 60.5% | 0.2224 |

The independent Elo implementation follows the project's README: ratings begin at 1,500 in 2014, use a 400-point logistic scale, and update both teammates with K = 24. For its race training, we use pairs of normal finishers or lapped finishers; for qualifying, each driver's fastest available session time. We score race holdout pairs only when both finished on the lead lap with finite recorded times. The original project uses F1DB and its detailed selection and code were not available to verify here, so this is **not** its original output. For the frozen model, the most recent driver rating through 2022 is used, or a neutral zero if absent; 22 race and 46 qualifying pair appearances use that fallback. The project similarly starts previously unseen Elo drivers at 1,500. The rolling model uses its actual pre-weekend portable driver rating; qualifying uses the separate qualifying rating. The held-out 2023 pairs were chosen after the event, based on finish status and time availability.

The authors report an Elo rolling race Brier score of 0.227 and 60.8% accuracy over 1,912 decisive comparisons across their broader historical period. Those cannot be compared numerically to our 2023 lead-lap-only results, and their frozen Elo and ridge results may use a different exact 2023 sample.

As a descriptive check on the rolling accuracy difference (model minus reconstructed Elo), a paired bootstrap of the 22 weekends gives −5.1 percentage points, with a 95% interval of −10.9 to 0.0 for race, and +3.3 points, with an interval of −2.3 to +8.8 for qualifying. This resamples whole weekends, but the same teammates recur throughout the season, so it does not capture all dependence or uncertainty from selecting the model. Neither comparison establishes a winner.

## Ranking likelihood and simulated distributions

The published ratings supplies pairwise ratings, not a generative distribution for full race orders. For a transparent diagnostic, the script extends the pre-weekend driver-plus-car levels to a Plackett–Luce ranking using the production 75-point pairwise scale. It excludes non-finishers using the project's `Finished` / `+N Lap(s)` rule and evaluates only the remaining field. The observed race order is scored once; 2,000 simulated orders per race provide expected counts for every rank. The simulation is deterministic for its fixed seed.

This extension is **not a posterior predictive check of the complete model**: it does not sample uncertainty in the model blend, race-day conditions, car reliability, or full-grid finishers. The rank likelihood is added for this research comparison and was not independently calibrated. The figures show a useful distributional diagnostic, but the Bayesian papers' in-sample posterior distributions, qualitative plots, and leave-one-out score have different inputs and validation designs.

For examples from the seasons visualized in van Kesteren and Bergkamp, the model extension gives an expected 1.58 top-two finishes for Bottas among his 15 recorded finishes in 2015 (observed: 0) and 6.92 for Vettel among 18 in 2019 (observed: 6). The complete rank histograms, not just those two cells, are in the results file. These summaries cannot reproduce the papers' posterior intervals or demonstrate which model fits better.
