# Dated teammate evidence

The driver rating uses a teammate graph whose comparisons attach to the season in which they occurred. Each driver has a node for each observed season, and adjacent observed seasons are linked by a Gaussian random walk. The graph is solved using evidence available at each snapshot; a saved earlier snapshot is not rewritten when later races arrive. A season is a coarse time node: the graph does not give each weekend its own latent ability. It can update within a season as results arrive, but it does not separately represent ability at each weekend.

Direct qualifying and race comparisons enter with their existing evidence-quality rules. The fixed graph share is 5%, and observations have a three-year half-life. Temporal links use an annual diffusion standard deviation of 4 rating points per square-root year, taken from the existing race-driver drift setting rather than tuned in this experiment. Both explicit decay and temporal diffusion weaken the influence of older evidence; the two effects operate together. A driver's first node receives the graph prior once, rather than once per season. Likelihood counts are uncapped at their observation seasons. Even a very large old sample does not prove unchanged ability years later: the temporal link represents that remaining uncertainty. These are model assumptions, not independently measured constants.

## Frozen transfer prediction

The primary mover test freezes the mover and the new teammate at `pre[ell]`, before the mover's final old-team weekend. This is earlier than the last information available immediately before joining. It scores that same frozen gap against the first five and ten new-team weekends; it gives no credit for learning from results after the move. Field scores are separate diagnostics because their opponent and car components use information available before each new-team weekend. Calibration uses only seasons preceding each validation block. The anti-adaptation regression test changes both drivers' post-move ratings arbitrarily and checks that frozen predictions and scores remain unchanged, while changes to either frozen prior matter.

The selected temporal graph applies the same portable-driver learning rules across team changes: it adds no move-specific driver variance jump, mean penalty or likelihood bonus. The car-specific fit reset remains separate from portable ability. The user chose this constraint after seeing its predictive cost; it is not a claim of improved transfer prediction.

## Retrospective comparison

The following score is an equal mean of move-balanced teammate log-loss for race and qualifying at five and ten weekends; lower is better. The reference is the pre-change recipe, source `928427f97ab9daf6`. The previous static graph is the earlier production recipe, source `a59e2f6d24b0b9e1`.

| Model | Frozen mover loss | Difference from original | Combined change: median / p90 / p99 |
| --- | ---: | ---: | ---: |
| Original reference | 0.67489 | — | 1.43 / 4.70 / 12.41 |
| Previous static graph | 0.67948 | +0.00459 | 0.80 / 2.90 / 7.18 |
| Temporal graph with move variance jumps, rejected under the constraint | 0.67934 | +0.00445 | 0.81 / 2.91 / 7.20 |
| Selected temporal graph, no move variance jump | 0.68884 | +0.01395 | 0.72 / 2.53 / 6.37 |

The selected model's primary loss is +0.01395 against the original and +0.00936 against the previous static graph. Its paired move-bootstrap interval against the original is −0.00956 to +0.03712 across 51 moves. The original +0.010 mover-cost budget and strict improvement requirement both fail; the user chose identical transfer learning rules after seeing this cost. Historical seasons informed development, so these are retrospective comparisons, not untouched confirmation.

Ratings-only pooled log-loss worsens by +0.00422 and qualifying-teammate loss by +0.01278 against the original, exceeding the original +0.003 and +0.005 guards. Several individual frozen teammate and field guards also fail. Against its matched graph-free model, the graph's mover difference is +0.00052 and p99 change ratio 0.959; it fails the original incremental graph gate. These failures remain visible and are not converted into passes. Full cells, fold results and intervals are in [the candidate report](../research/temporal-graph/candidate-results.json).

## Forecast verification

At the graph-selection stage, the forecast design was refitted with nested chronological ridge selection. All four modes passed the +0.003 pooled and +0.006 block point limits against the original reference. Pooled log-loss differences were +0.001389 before qualifying, +0.000418 after qualifying, +0.002627 for qualifying and +0.000576 for grid-only forecasts. That stage used source `7a44023e0b230847`; its forecast report is archived at `research/current-form/reference-forecast-report.json`. These passes do not establish statistical equivalence.

The subsequent [driver and car form revision](current-form.md) changes forecasts while preserving every long-term rating. The current forecast report is `research/stable-ratings/selected-forecast-report.json`, source `9eda03dd6d88facd`. Its retrospective mover-priority decision and the original failed overall-gain threshold are reported separately.

The graph page labels the season of each driver's level and the years of each teammate comparison. No deployment was performed.

## Limits and stress tests

The slower learner and identical transfer rule do not solve portable driver identification. Raw qualifying and frozen mover subsets remain weak. In three-seed simulated worlds through 2015, the selected model improves default race teammate-gap RMSE from 26.32 to 19.02, while qualifying driver RMSE worsens from 25.89 to 35.08 and qualifying field-gap RMSE from 81.09 to 125.94. These are simulator-dependent stress tests, not real-world ground truth. Complete-blend uncertainty coverage remains unverified.

Smoothness is not only scale compression: field-normalized combined p90 change falls from 0.1702 to 0.1210 standard deviations, and p99 from 0.4374 to 0.3021. Median field spread also falls from 26.93 to 20.30 points. There is no hard update cap; the largest appearance-to-appearance change remains 28.85 points.

Two secondary literature benchmark scripts previously omitted the graph despite carrying a production source hash. They now call the shared production pipeline, with a regression test preventing that omission. The earlier static artifacts under `research/stable-ratings/` are marked as withdrawn production comparisons. Corrected current artifacts live under `research/temporal-graph/`. This correction does not change the frozen-mover evaluator, which already used the full published pipeline.

## Verification and reproduction

Graph-selection source: `7a44023e0b230847`. Its evaluation fingerprint was `23d9bee959cdde70c0b8b4484bc0f2184436e9c2648d587a2a1aa3498f0e150b`, checked before and after scoring. The complete Node suite, real Chrome browser suite, ESLint/Prettier and publication check passed at that stage. The browser checks visible strength seasons/comparison years and unfilled methodology fields. Production matched the neutral research candidate across 411,611 means and predictions, and the saved model matched a fresh build. Current form verification and reproduction are in [current-form.md](current-form.md); the rating-only scorecard below still applies.

Run `npm run evaluate` for the current scorecard. The full report is generated with:

```sh
node research/stable-ratings/evaluate.mjs research/temporal-graph/selected-results.json --models=previous-static,published --bootstrap=300 --stability-bootstrap=300
```

The following commands reproduce the historical graph-stage forecast comparison with archived original reference heads. They are superseded for current form by the commands in [current-form.md](current-form.md):

```sh
node research/stable-ratings/export-forecast-rows.mjs tmp/temporal-graph/neutral-forecast-rows.jsonl neutral-temporal
python research/simplification/fit-forecasts.py --rows tmp/temporal-graph/neutral-forecast-rows.jsonl --designs two-speed-bounded-form --segments-only --include-grid --pooled-margin 0.003 --fold-margin 0.006 --protocol research/temporal-graph/protocol.md --output research/stable-ratings/forecast-results.json
python research/stable-ratings/export-forecasts.py --rows tmp/temporal-graph/neutral-forecast-rows.jsonl --results research/stable-ratings/forecast-results.json --output tmp/stable-ratings
node research/stable-ratings/install-forecasts.mjs
npm run build:model
```

Python dependencies are pinned in `research/simplification/requirements.txt`. Fingerprints establish consistent inputs during a run; they are not a complete archived runtime.
