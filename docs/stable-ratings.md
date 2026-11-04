# Steadier ratings and the teammate graph

The later dated-node graph update is documented in [temporal-graph.md](temporal-graph.md). Numerical evidence below describes the preceding static graph.

Implemented locally on 3 November 2026 after the user chose a small documented mover-performance cost for substantially smoother ratings. This follows [the earlier simplification](simplification.md). Nothing was deployed.

## Selected design

The rating learners use a common information fraction of **0.25**. Race and qualifying likelihood temperatures become 0.01 and 0.0175; the online comparison step becomes 45 instead of 180. Priors, drift, the driver qualifying link, car inference and reliability handling remain. Each weekend has less influence relative to existing knowledge, while consistent repeated results accumulate. This changes estimation, not the history chart.

A **5% teammate graph** contribution enters both published driver estimates. The graph fits a regularized Bradley–Terry likelihood with fixed log-odds prior precision 2 and a **three-year calendar half-life**. The other 95% uses the filter/online estimate. Car ratings retain their race/qualifying blend. Settings live in `presets/learning.js` and `presets/graph-ratings.js`; `runPublishedRatings` is the shared production entry point. Both ordinary forecasts and frozen movers consume these levels. Fast prediction form remains separate.

## Graph requirements

- **Recent evidence matters more:** counts decay by `2^(-elapsed_years/3)`.
- **Direct evidence is stronger than an equivalent indirect path:** a path compounds uncertainty. One weak direct result need not override abundant indirect evidence. Paths are not counted again as invented observations.
- **More valid shared races add information:** effective likelihood weight grows without the former cap. A mechanical failure without valid pace evidence adds no pace loss.

Each teammate pair contributes at most one qualifying and one race comparison per weekend. Race evidence prefers a valid finish, otherwise valid shared lap pace or a retirement snapshot with coverage weighting. A qualifying duel counts 1; a race duel up to 1.5. Grid penalties do not become qualifying losses.

The Graph page uses this same model and decay. Colors and ordering use decayed evidence; Q/R totals remain unweighted career counts. Its horizontal coordinate is average season raced, distinct from age.

## Stability and predictive cost

The reference is the previous published model, source `928427f97ab9daf6`. Across 2008–2025, combined driver changes between consecutive appearances are:

| Absolute change | Previous | Selected | Reduction |
| --- | ---: | ---: | ---: |
| Median | 1.426 | 0.800 | 44% |
| 90th percentile | 4.697 | 2.898 | 38% |
| 99th percentile | 12.408 | 7.177 | 42% |

There is no hard update cap: the largest combined change remains 31.7 points. Uncertain drivers can still move substantially when evidence accumulates.

This is not just scale compression. Median field spread decreases from 26.93 to 22.11 points, but normalized p90 change also decreases from 0.1702 to 0.1282 field standard deviations. The season-bootstrap interval for raw p99 is 11.49–13.50 before and 6.80–7.65 after.

The primary mover score gives each move equal weight, averaging race and qualifying teammate log-loss over five and ten new-team weekends. It rises from **0.674888 to 0.679483**, a **+0.004594** cost over 51 teammate-covered moves. Its paired move interval is **−0.011313 to +0.019876**; the true cost could be materially larger than the point estimate. Total mover coverage is 69, including field-only moves. Calibration uses earlier seasons only; eligibility and outcomes stop at each block end. Exact scored pairs and missing-rating coverage must match.

The original strict raw-score guards **fail**. Ratings-only pooled loss rises **+0.003548**; qualifying teammate loss rises **+0.007748**. Frozen field losses rise more than the pooled headline: race five/ten-week losses by approximately **+0.00998/+0.00689**, qualifying by **+0.03166/+0.02364**. Row-weighted five-week race mover loss for 2021–2025 rises from 0.6336 to 0.6809. These are accepted costs, not hidden passes.

The graph adds **+0.000689** mover loss versus the matched graph-free learner, with interval −0.001781 to +0.003083. It reduces p99 change by a further 2.6% and slightly improves ordinary pair loss, but fails the earlier incremental mover/stability gate. Its inclusion is a requested preference, not proof of an incremental mover gain.

The refitted ridge forecast heads pass the complete forecast guards. Pooled losses rise approximately **+0.001180 before qualifying**, **+0.000382 after qualifying**, **+0.002223 for qualifying**, and **+0.000475 for grid-only forecasts**. Every block stays within +0.006; pooled limits are +0.003. These point checks do not establish statistical equivalence.

Full-forecast validation calibration slopes are 1.032 before qualifying, 1.015 after qualifying, 1.049 for qualifying and 1.001 for grid-only forecasts. These are pooled diagnostic slopes, not a guarantee for every probability range. In 2026 monitoring, race losses change by +0.000322 before qualifying and −0.000546 after qualifying; qualifying changes by +0.003963 and grid-only by +0.002120. This incomplete season is not used to select settings.

Russell's original example becomes **1008.9 → 1002.0 → 1006.8** over Abu Dhabi 2021, Bahrain 2022 and Saudi Arabia 2022, versus 1007.9 → 995.1 → 1013.4 before. This example was inspected after defining the candidate rules; selection and stability checks cover all drivers.

## Rejected designs and behavioral audit

Failures are retained in `research/stable-ratings/`. Direct graph replacement and slower driver drift lost mover performance. A persistent-output layer reduced volatility but failed controlled direction: delayed old evidence could outweigh a new contrary qualifying result. The user accepted a predictive cost, not that violation, so the layer was removed. Bounded posterior-output updates also failed the empirical requirements.

The selected model instead regularizes learning inside the estimators. Native tests cover race-only and qualifying-only results after one, five and twenty prior wins, opposing session histories, empty controls, surprise magnitude, label symmetry and chronology. The qualifying-only counterexample is a regression test.

## Limits

All historical seasons informed development. Chronological validation and nested ridge selection prevent direct leakage but do not provide independent confirmation. 2026 is monitoring only. The final report includes move and season intervals, per-cell counts, boundary/team-change volatility and normalized volatility.

Three-seed synthetic worlds improve race recovery but worsen qualifying recovery. In the default world, qualifying car RMSE changes from 52.19 to 74.68 and field-gap RMSE from 81.09 to 119.37. The whole likelihood is tempered, so this cannot be attributed solely to driver learning. These stress tests are not measurements of real-world truth. See `selected-simulation-results.md` and JSON.

Uncertainty bars remain filter-derived approximations, not calibrated coverage for the new graph blend and information fraction. Graph and filters share evidence; their precisions cannot be added as independent measurements. Probabilities target the fixed weighted pair benchmark, not unconditional race wins.

## Reproduce

```sh
npm run evaluate
node research/stable-ratings/evaluate.mjs research/stable-ratings/selected-results.json --models=published --bootstrap=300 --stability-bootstrap=300
node research/stable-ratings/export-forecast-rows.mjs tmp/stable-ratings/selected-forecast-rows.jsonl tempered-t0.25-g0.05-h3
python research/simplification/fit-forecasts.py --rows tmp/stable-ratings/selected-forecast-rows.jsonl --designs two-speed-bounded-form --segments-only --include-grid --pooled-margin 0.003 --fold-margin 0.006 --protocol research/stable-ratings/protocol.md --output research/stable-ratings/forecast-results.json
python research/stable-ratings/export-forecasts.py --rows tmp/stable-ratings/selected-forecast-rows.jsonl --results research/stable-ratings/forecast-results.json
node research/stable-ratings/install-forecasts.mjs
npm run build:model
```

The reference forecast definitions are archived in `research/stable-ratings/reference-forecast-heads.json`, with the original source/file hash and a fixed head-content checksum. Forecast reproduction does not require temporary copies of the old model. The frozen rating recipe remains in `research/simplification/candidates-ranking.mjs`. Python dependencies are pinned in `research/simplification/requirements.txt`. Fingerprints and atomic checkpoints protect consistent evaluation inputs; they are not an archived executable.

## Final verification

Published source: `a59e2f6d24b0b9e1`. Evaluation fingerprint: `89913495d9b79af72d6a7cc1e5bdbd0bbbb2a91ffc0e69802d73cd304432551b`, verified before and after scoring. The full Node suite, ESLint/Prettier, real Chrome browser suite and publication check pass. The saved model matches a fresh build across 663,221 values; the production rating pipeline matches the selected research candidate across 411,611 means and predictions. Archived reference heads reproduce the forecast-row SHA-256 `fea40eeefd63d4a8c6db451748f4736f9cbe94731f4a81a5bb080272a9cbfdbf` exactly.
