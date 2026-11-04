# Chronological model validation

`npm run evaluate` evaluates the actual published pipeline, including intrinsic slower learning and the recent teammate graph. Without an output path it prints a compact scorecard. The [dated-graph decision](temporal-graph.md) records the selected settings, predictive costs and original guards that failed.

```sh
npm run evaluate
node research/stable-ratings/evaluate.mjs research/stable-ratings/selected-results.json --models=published --bootstrap=300 --stability-bootstrap=300
```

The reference is the frozen pre-change recipe, source `928427f97ab9daf6`. The matched graph-free control isolates the graph contribution. Its forecast definitions are archived in `research/stable-ratings/reference-forecast-heads.json`, so forecast reproduction does not depend on temporary files. Previous static production remains an explicit frozen comparison, as source `a59e2f6d24b0b9e1`. The production entry point `runPublishedRatings` is shared by the build, evaluator and forecast exports; a full-history parity test checks the selected research candidate against it.

## Temporal validation

The blocks are 2008–2011, 2012–2015, 2016–2020 and 2021–2025. Race and qualifying calibration use only seasons from 2002 through the year before each block. Ratings update causally within blocks. A separate 2026 report is monitoring, not a selection gate. All historical periods informed model development, so these are retrospective tests rather than independent confirmation.

The complete forecast heads use nested chronological ridge selection: the final four earlier training years select regularization, then the head refits on the entire earlier prefix. The forecast design has separate driver and car form, two tracking speeds and fixed qualifying segments. Grid-only forecasts use their own six-feature linear head. All four modes must satisfy pooled and per-block limits. The no-jump forecast refit passes all four point guards. Installed JavaScript heads have 480 Python inference fixtures; the complete regression suite verifies training/serving agreement.

## Primary mover metric

A frozen mover's rating and the future teammate's rating are taken before the mover's final old-team weekend. Their gap predicts the first five and ten new-team weekends. The primary score gives every move equal weight, averaging race and qualifying teammate log-loss across those horizons. There are 51 teammate-covered moves; total field/teammate coverage is 69. Row-weighted and field scores are separate diagnostics and can deteriorate more than the primary average.

The freeze uses `pre[ell]`, before the final old-team weekend. It therefore excludes that weekend too, and is earlier than the last information available immediately before the driver joins the new team. Later rating changes for either the mover or the new teammate cannot improve the frozen teammate predictions, and this evaluation supplies no arrival-adaptation offset. The first five- and ten-weekend outcomes test the same frozen prior; they do not measure the speed of adaptation after a move.

Eligibility requires three new-team appearances by the block end; scored duels must also occur by that boundary. Teammate calibration uses only earlier stayer observations. Field forecasts use the opponents and cars known before each new-team weekend. Reports count missing ratings and compare omitted identities across models. Scored pairs are matched by weekend and observation index; mismatched coverage fails evaluation. Empty monitoring samples are unavailable, not zero loss.

Ordinary loss intervals resample seasons; mover intervals resample whole moves. The report also gives season sensitivity for the primary mover difference. These historical intervals do not prove equivalence or account for all model selection.

The selected production rule adds no portable-driver variance jump, mean penalty or mover-specific likelihood multiplier on a team change; the car-specific fit reset remains separate.

## Stability and acceptance

Stability uses changes between consecutive driver appearances, including season boundaries and team changes. Reports contain raw and field-standard-deviation-normalized changes, field spread and season-bootstrap intervals. This distinguishes slower movement from merely compressing rating scale.

The original strict predictive guards and the user's later acceptance of a stability cost are reported separately. `ratingPass: false` is retained; `userTradeoff.accepted: true` does not turn it into a predictive pass. The graph also fails its original incremental mover gate and is retained as a measured user preference. The no-jump forecast refit passes complete-forecast point guards. Its original raw small-cost guard fails, and `userConstraint` records the explicit identical-learning requirement separately; it does not relabel that loss as a pass. The current candidate sequence and decisions are preserved in [the dated-graph protocol](../research/temporal-graph/protocol.md); the earlier [stability protocol](../research/stable-ratings/protocol.md) remains historical evidence.

## Resilient execution

The evaluator fingerprints core, evaluation and research sources, input CSVs, candidate definitions, protocol and the installed forecast report. It checks the fingerprint before and after scoring. Atomic per-model checkpoints under `tmp/stable-ratings/evaluation-cache` are reused only with identical inputs. Complete forecast acceptance additionally requires a report matching the current core source hash. Fingerprints protect reproducibility of inputs; they are not an archived runtime.

The earlier broader comparison remains available through `npm run research:compare-models`. Its candidate definitions and historical reference belong to the earlier simplification report; it is not the primary current acceptance command.
