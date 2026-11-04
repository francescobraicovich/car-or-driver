# Model simplification: decision and evidence

The later user-requested stability and graph update is documented in [stable-ratings.md](stable-ratings.md); numeric evidence below describes the earlier model.

Completed locally on 3 November 2026. The objective was the simplest tested model within declared predictive margins, rather than the lowest historical loss regardless of complexity. No deployment was performed.

## Selected implementation

- Remove the qualifying-car link from the race filter. Retain the qualifying-driver link and fixed three-source driver blend: removing entire learners worsened prediction and frozen transfers.
- Reduce the online learner to driver and car levels, three settings and one winter rule. Remove wet skill, its separate driver–car fit, per-weekend shrinkage and different winter retentions.
- Round active filter settings and remove the disabled production arrival-adaptation configuration. Keep the race filter's persistent fit, which earned its place.
- Replace production tree ensembles with ridge-logistic heads and remove circuit-form tracking. Retain two speeds because simpler alternatives failed forecast guards.
- Display driver-specific form across the field while holding car form fixed. Teammates can both have positive form.
- Store forecast definitions in model format 2; serving no longer imports the unused legacy benchmark ensemble.

The forecast definition is 97.4% smaller (951,791 to 24,318 bytes), despite increasing dated fit bundles from three to five. There are 12 retained form maps instead of 18, with all driver-by-circuit maps removed. Research options and the Elo benchmark remain available for reproducibility, but are not active production features.

## Selection and validation

The [protocol](../research/simplification/protocol.md) fixed practical margins before the new scores were reviewed. Expanding blocks are 2008–2011, 2012–2015, 2016–2020 and 2021–2025. Each block's calibration reads earlier seasons only. Ridge strength uses inner temporal validation and training-only scaling. Frozen means come from before the final old-team weekend; cohort outcomes stop at each block's end. 2026 is descriptive monitoring.

All periods previously informed historical development. Chronology prevents direct leakage, but cannot make architecture selection independent. See [Cawley and Talbot on model-selection bias](https://www.jmlr.org/papers/v11/cawley10a.html). Proper probability scores and calibration are reported separately, consistent with [Gneiting and Raftery](https://doi.org/10.1198/016214506000001437).

Ratings-only loss rises by 0.000623 against the original (season-clustered 95% interval +0.000043 to +0.001218). Frozen mover race teammate loss changes by −0.001042 at five weekends and +0.000137 at ten; field losses rise slightly. Complete combined forecast differences are +0.000577 before qualifying and −0.000065 after qualifying; qualifying loss rises by +0.000533. All recorded point guards pass; the rating and forecast intervals do not establish statistical equivalence at the practical margins. The closest fold pass is post-qualifying combined loss in 2008–2011, +0.001957 against +0.002; the race-only component rises by +0.002031. [The current model note](hybrid.md) lists the metrics and limits.

The retained grid-only head also passes its pooled and fold guards (loss +0.000475). Separately, 2026 monitoring is mixed: raw head loss changes are +0.002168 before qualifying, −0.000430 after qualifying and +0.001838 for qualifying. These observations were reported without retuning and do not support a prospective improvement claim.

## Rejected simplifications

1. Removing the online learner and extra qualifying blend, removing both session links or only the driver link, or removing the race fit lost predictive or transfer performance.
2. A single joint Gaussian posterior, including a bounded four-point shared-driver/race-residual family, failed real-data guards. Earlier-block selection chose the same member in later folds; it still failed. Synthetic checks found worse driver recovery and greater car leakage.
3. One-timescale ridge heads came close but failed a qualifying fold guard. Context, recent-history and stronger-shrinkage extensions did not solve that failure. Acceptance margins stayed fixed.
4. No-form forecasts also received per-weekend driver drift of 1, 2 and 4 points. The first two passed rating point guards but failed forecast guards; the third failed rating guards. Form therefore earns its place beyond simply making ratings artificially slow.

All results, including failures, are under `research/simplification/`. Main artifacts are `final-rating-comparison.json`, `qualifying-links-boundary-comparison.json`, `without-qualifying-car-link-forecast-results.json`, `selected-forecast-report.json`, `driver-drift-comparison.json`, and the two `drift-*-forecast-results.json` files. Original settings are explicit in `candidates-ranking.mjs`; original forecast source is pinned to its Git commit.

The isolated link audit and its ordered fallback are recorded in [forecast-protocol.md](../research/simplification/forecast-protocol.md). The final production implementation matches the accepted research candidate across 195,098 ordinary forecast rows and 51,341 frozen-mover rows, with maximum logit difference 3.55 × 10⁻¹⁵.

## Backtesting and integrity

`npm run evaluate` evaluates the actual production model and prints a concise chronological scorecard. The long historical research evaluator remains as `npm run research:legacy-evaluate`. A comparison can save full JSON. Exact source/data/protocol fingerprints protect atomic per-model checkpoints; changed inputs invalidate caches and changes during a run fail verification.

Old mover analysis calibrated using later stayer observations. One 2020 move also qualified using a third appearance in 2021; eligibility now stops at the validation-block end. Exact scored weekend/observation identities and omitted-rating coverage must match between models. The replacement fits calibration before each block, and excludes late-block move outcomes beyond that block. Missing monitoring samples are unavailable rather than zero. Corrupt positive-weight rows or diagnostics fail directly; legitimate empty historical qualifying blocks remain supported.

Exact duplicate source rows are removed before pair construction, while distinct historical entries for the same driver/race remain. Tests cover retirement reliability attribution and valid pre-failure laps, teammate direction and surprise, driver/car attribution, portability, prefix/label/order invariance, checkpoint restoration and form interventions. Python/JavaScript parity uses 450 Python-generated fixtures. A negative control deliberately changes rating units to prove the train/serve test detects a mismatch.

## Truth-based stress check and remaining limits

Both sessions are simulated, with three paired seeds in ordinary and strong persistent-fit worlds. Ordinary race driver RMSE changes from 17.64 to 18.07; strong-fit RMSE changes from 19.26 to 19.80. Teammate-gap and mover-step errors also rise. Race car RMSE improves from 38.76 to 34.60 and 37.88 to 33.89, with lower field-gap errors. Winter car-to-driver leakage changes little: 0.152 to 0.153 and 0.164 to 0.165. Qualifying driver errors are nearly unchanged. Per-seed results and assumptions are in `selected-simulation-results.json` and `.md`. These small stress tests do not certify real-world truth or interval coverage.

The full blend still lacks a joint calibrated covariance. Its bars are approximate. The forecast targets the weighted pairwise benchmark rather than unconditional race wins or all-retirement classifications. Driver–car separation remains partly identified by assumptions. These limitations remain explicit; simplification did not turn them into solved problems.

## Final verification

`npm test`, `npm run lint`, `npm run test:browser`, `npm run check:publication`, `npm run evaluate`, and the retained grid-head guards pass. Model files, export rows, the teammate graph and Insights were rebuilt; the model source hash is `928427f97ab9daf6`. The final rating comparison verified fingerprint `8f35c2a2816e04f118b5a91eafc98e31e7c570d1601bebb8dbb2433d70da2988`. The rating fingerprint excludes forecast-specific files, as described in [backtesting.md](backtesting.md).

Browser validation also exposed and fixed SVG tooltip keyboard handling, chart bounds that clipped regenerated career values, and inaccessible rows in large historical fields on short screens. Browser fixtures now identify the latest race from the manifest and compare driver colours by identity. Unrelated existing work was preserved. No deployment was performed.
