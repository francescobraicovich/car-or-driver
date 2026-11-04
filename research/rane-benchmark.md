# Rane race-ranking benchmark

This scores the current production ratings against race results from 2014–2024 using the ranking metric described in [Rane (2025)](https://arxiv.org/abs/2508.00200), a preprint. Reproduce the complete per-race and per-season output with:

```sh
npm run research:rane-benchmark -- research/temporal-graph/rane-benchmark-results.json
```

The [saved result](temporal-graph/rane-benchmark-results.json) records source hash `7a44023e0b230847` and the data manifest. It was calculated on 228 races and 3,825 finishing driver-race entries:

| Metric | Current model | Rane's reported model |
| --- | ---: | ---: |
| Mean per-race Kendall tau, finishers only | 0.6338 | 0.625 |
| Finisher-relative mean absolute position error, per entrant | 2.2625 places | Not established from the paper |

The model's tau is 0.0088 higher than the paper's figure. This is an **indicative comparison**, not proof that our model is better: the paper's per-race predictions and exact scoring sample are not available here, so the two scores cannot be paired or checked against precisely the same entrants. Nor is the historical period a clean holdout for our model: its weights were selected after examining results in this period. The paper also selects its own settings using historical data. The paper's reported 0.625 appears in section 5.1; it is not a recomputed score from its model.

## Protocol

- Rebuild the actual production ratings using the repository data through 2024. The filters start in 1994; Rane's model starts with results in 2012. The different history and our inclusion of lap and qualifying evidence are part of the model comparison.
- Use the production portable driver and car levels **before the weekend**, after prior and winter updates, and rank each entrant by their sum. The recorded race lineup determines the available entrants; the model does not read that weekend's qualifying times, starting grid, or race outcomes to score the race. Internally the pre-weekend state initializes entities from the observed weekend's entrant/observation structure; therefore this is a retrospective evaluation on the recorded lineup, not a simulation of uncertain substitutions or non-starters.
- Treat `Finished` and `+N Lap(s)` status as finishers, consistently with the project's existing status classification. Exclude other statuses, including non-finishers and disqualifications. The paper says it excludes DNFs but does not fully specify its status mapping; the exact treatment of exceptional statuses and starters may differ.
- Select finishers **after the event**, and rank those finishers in both predicted and actual order. This is conditional ranking quality given the set of finishers, not a prospective forecast of actual finishing places for the entire starting field. The result file also includes an all-entrants sensitivity analysis, ranking all rows by `positionOrder`; it does not model retirement probability and is not necessarily equivalent to Rane's DNF-inclusive variant.
- For each race, Kendall tau is (concordant pairs minus discordant pairs) divided by all possible pairs, as specified by the paper; ties in predicted strength contribute zero. Average the race-level taus with equal race weight. MAE is the absolute difference between predicted and actual **finisher-relative ranks**, averaged over entries. Ties receive average predicted ranks. The file also reports the equal-race-weighted MAE. Rane uses MAE for tuning, but the paper does not establish that this calculation and aggregation match its MAE; no numerical comparison is claimed.

Because the paper does not provide the matched per-race prediction table in the available material, a direct paired test and a comparable paper MAE remain open. Those require the author's original predictions or an independently verified reproduction of their model and evaluation sample.
