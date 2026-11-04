# Causal pre- and post-qualifying winner-score projections

These are retrospective signals for research, not certified, historically
available winner probabilities. The project model predicts pairwise pace and
finishing outcomes; projecting its pairwise log odds into one softmax over the
field is a heuristic. The projection is neither trained nor calibrated against
race winners.

The pre-qualifying signal is available from **00:00 UTC on qualifying day** and
uses the previous race's roster and prior completed-race data only. It does not
incorporate this weekend's practice sessions or sprint. The post-qualifying
signal becomes available **three hours before race start** and uses the
existing model's post-qualifying head, the current qualifying times, and
qualifying position as a proxy for the race grid. It never uses the race-result
grid or target-race result as a feature. It requires at least three hours
between scheduled qualifying start and that decision time; that buffer is an
assumption, not proof the historical results were published then. Race and
qualifying metadata may have been revised later, and original data vintages and
model hyperparameters are not certified.

To avoid silently assigning a driver to the wrong team, the post-qualifying
roster excludes previous-race entrants not present in the target qualifying
file with the same team. There is no probability allocation to unmatched
entrants, Other, or cancellation. In the eight-race trading study, the Dutch
race has two omitted prior-roster drivers; the other seven have 22 matching
entrants. Equal timestamp does not mean the data were actually available at
that instant.

For each pair, the existing forecast's `breakdown.full` contains its current
form and `breakdown.calibrated` removes recent-form terms while preserving the
same qualifying input and fitted head. `projectSignals` fits per-driver
Bradley–Terry log-odds projections; the no-form score is `fullHeadStrength -
formShift`, and the with-form score is `fullHeadStrength`. The two variants
are fixed in advance: they are not selected on the results in this file.
Both still use the same driver/car rating state built from earlier races;
zeroing the head's named form features does not remove all recent performance
information from the model.
Brier and log loss evaluate winner forecasts, so lower is better. If a winner
is absent from the previous roster, log loss is infinite and the reported mean
is null; a separate conditional mean is provided and must not be mistaken for
the unconditional score.

For the eight previously inspected 2026 trading-study races, the paired scores
in [study-signals.json](study-signals.json) are:

| Signal and variant | Mean Brier | Mean log loss |
| --- | ---: | ---: |
| Pre-qualifying, no form | 0.853 | 2.111 |
| Pre-qualifying, with form | 0.829 | 1.893 |
| Post-qualifying, no form | 0.718 | 1.575 |
| Post-qualifying, with form | 0.706 | 1.505 |

Form improves pre-qualifying log loss in 8 of 8 races and post-qualifying log
loss in 4 of 8. This is a small, previously inspected and dependent sample;
better winner scores are not evidence of profitable trading. The year-by-year
accuracy experiments use the same fixed scoring methods and no fitting on the
evaluation period. Their chronological race prefixes do not verify historical
model or data vintages.

The broader [2023–26 accuracy summary](accuracy-summary.json) covers 87 races.
The 2025 Singapore qualifying file contains duplicate positions and is excluded.
One race winner, 2024 Australia's Carlos Sainz, was absent from the previous
race roster, so unconditional log loss is infinite for both variants. In the
86 races where the winner was in the roster, the conditional means were:

| Signal | No form | With form | Races where form improved log loss |
| --- | ---: | ---: | ---: |
| Pre-qualifying | 1.886 | 1.623 | 73 of 86 |
| Post-qualifying | 1.349 | 1.255 | 59 of 86 |

Mean multiclass Brier over all 87 races improves from 0.788 to 0.720 before
qualifying and from 0.623 to 0.592 afterward. The repeated race outcomes are
dependent: the dominant 2023 season accounts for a substantial share of the
gain. The scores do not compare with executable market prices, do not prove
the features were available in these exact historical versions, and do not
establish an advantage in trading.

Run the selected study and unit test from the repository root:

```sh
node research/prediction-markets/weekend/signals.mjs 1173 1174 1175 1176 1177 1180 1181 1185 > /private/tmp/weekend-signals.json
node tests/test-weekend-signals.mjs
node tests/test-weekend-signals-integrity.mjs
```

For a year, use `--year=2025` in place of the race IDs. Outcomes are read only
for evaluation after the forecasts have been built. Target race results are not
inputs to the signal.

After generating `accuracy-2023.json` through `accuracy-2026.json`, aggregate
them without refitting:

```sh
node research/prediction-markets/weekend/accuracy-summary.mjs \
  research/prediction-markets/weekend/accuracy-2023.json \
  research/prediction-markets/weekend/accuracy-2024.json \
  research/prediction-markets/weekend/accuracy-2025.json \
  research/prediction-markets/weekend/accuracy-2026.json > /private/tmp/weekend-accuracy-summary.json
```
