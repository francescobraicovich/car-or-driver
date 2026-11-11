# Unified production model

The website uses one joint probabilistic model for three driver and car outputs. Overall strength is the default ranking and the input to pre-weekend race-result forecasts. The complete reader-facing explanation is maintained in [methodology-content.js](../site/js/methodology-content.js); this document records the engineering contract.

| Output | Meaning | Direct measurement |
| --- | --- | --- |
| Qualifying pace | Contribution to representative qualifying speed | Signed fractional time margin in a valid shared phase |
| Race pace | Contribution to sustained speed on comparable laps | Robust fractional margin over matching retained race laps |
| Overall strength | Expected pre-weekend race competitiveness | Order between normal finishers |

Overall is independently learned, with information shared through the joint prior and posterior. It is not a weighted average of the timing outputs. Driver incidents and mechanical failures inform separate hazards; actual-result forecasts include them explicitly.

## Evidence and identification

Every observation has design `D_a − D_b + C_a − C_b` for its output. The shared car cancels between teammates. Teammate connections enter the likelihood directly, not as a second fitted rating used as independent evidence. This is the graph awareness of the production model. Cross-team observations estimate package differences; priors, evolution assumptions and the connected graph constrain their allocation to drivers and cars. Teammates need not actually receive identical treatment. Persistent driver–car fit remains unmodelled.

Qualifying uses the latest valid shared phase, except 2006–2009 Q3 is omitted because of race-fuel strategy. Race pace retains the existing pair eligibility, removes first laps and laps exceeding 105% of each driver's fastest candidate lap, matches exact lap numbers and requires four matches. It takes a median within eight-lap windows and then across windows. Coverage saturates at 16 laps. This reduces starting-order contamination without claiming causal independence from traffic, tyres or strategy.

Overall learns from normal finisher order. Partial retirement positions are omitted. Qualifying has a unit teammate-pair budget; race pace and finish observations share at most 1.5, allocated by coverage. Cross-team weights divide by entrant count minus one. These budgets address dependence without claiming to eliminate it.

## State and update

The canonical implementation is [unified_model.py](../packages/core/python/unified_model.py). Each entity has three latent Gaussian states. A weekend uses one joint Laplace update, with robust logistic timing errors and a Bernoulli logistic overall likelihood. Full covariance is retained during fitting, including inactive entities through conditional Gaussian propagation. No separate online learner, graph blend, form tracker or driver–team fit is used.

[Selected settings](../packages/core/python/unified-settings.json) were fitted using 2002–2007 prequential predictions after 1994–2001 warm-up. Driver/car cross-output correlations are 0.85/0.5. Initial standard deviations are 20/50 points. Evolution permits 8 driver points per square-root year, 6 active-car points per weekend and an additional 30 car points across winter, adding in variance. Transfers do not reset or penalise driver strength. Timing noise is fitted globally, then fixed; learning responds to the evolving posterior uncertainty.

All saved historical snapshots are dated filtered estimates, never smoothed with later evidence. Raw model ratings are `1000 + latent strength × 75 / ln(10)`, using the fixed zero-mean prior reference. Inference, calibration, covariance, forecasts and saved model files retain those coordinates. Only the raw overall link interprets 75 points as 10:1 odds. Timing units use fractional margin / 0.003, so one timing point corresponds to about 0.00921% of lap time before calibration.

## Display reference

Ratings, History and Graph translate the raw strengths onto a recent-era reference. There are six independent references: qualifying, race and overall for drivers and cars. For each snapshot, `μ_t` is the unweighted mean of its driver rows or its unique car rows. With `α = 1 − 2^(−1/20)`:

- Initialise `B_0 = μ_0` from the first recorded weekend.
- Before every subsequent weekend, set `B_t = (1 − α) B_(t−1) + α μ_(t−1)`.
- Display `1000 + raw_rating_i,t − B_t`.

This is a lagged exponential average with a **20-rated-weekend half-life**. It has no calendar-time decay, winter reset or hard cutoff. The benchmark is fixed before the current weekend's membership and evidence enter it. A lineup change therefore has no immediate effect on it; its influence begins the following weekend. The current field mean is not forced to 1,000. This smooths the reference, not individual learning or performance revisions.

Every historical point uses its own dated reference. Ratings changes compare the previous appearance with the current appearance, including after an absence. The graph's retired drivers retain the centred rating from their last appearance; later references do not move them. Appending future snapshots leaves all prior points unchanged. A rating of 1,000 means the recent competitive environment, making comparisons relative to an era intelligible; it cannot establish equal absolute ability across different eras or identify changes in overall field quality.

[The shared display module](../site/js/rating-reference.js) builds the references and projects display rows without mutating model state. [The supplement builder](../tools/build-rating-reference.mjs) writes `data/rating-reference.json` from the saved full model. The source fingerprint and a reproducibility test bind it to the model. Both the first-screen and full-history paths use the same supplement, including dated references for previous appearances. `state.model` remains raw for forecasts and findings; `state.displayModel` supplies these three views. Compatibility `combined` values follow the centred `overall`; retirement-risk outputs are unchanged.

Same-weekend gaps and their joint uncertainty are invariant to the translation. Standard deviations remain the original posterior marginal values, conditional on treating the display reference as a fixed convention. They do not estimate uncertainty in the benchmark or cross-era comparability. Historical scenarios deliberately continue to use raw model coordinates: a difference between centred values from different dates is not the gap used in those scenarios.

The [display-reference audit](../research/unified-ratings/display-reference-validation.json) checks every driver/car pair across all three outputs and all 620 weekends, first-screen/history consistency, exact current forecast and scenario invariance, and unchanged raw files. [The earlier reference-change audit](../research/unified-ratings/reference-validation.json) records the preceding change from instantaneous field centring to raw model coordinates; its mixed-date and uncertainty changes describe that earlier migration, not this display translation. The archived research replay explicitly requests its original field-relative projection for reproducibility.

## Forecast contract

[forecast.js](../packages/core/src/unified/forecast.js) uses overall driver plus car gaps and joint covariance, then applies past-only calibration and explicit hazards. Next-weekend evolution adds car variance and elapsed-time driver variance; the default date is seven days after the last snapshot. An explicit ISO date may be supplied. Calibration folds preserve the validated 2008, 2012, 2016 and 2021 boundaries; from 2026 onward, bundles refresh annually using available years strictly before their start.

`forecastRace` optionally accepts distinct positive `gridA` and `gridB`. With both available, competitive log odds are `ratingCoefficient × gap / sqrt(1 + π variance / 8) + gridCoefficient × (gridB − gridA) / 10`, with gap and variance in latent units. The same hazard conversion follows. [unified_grid.py](../packages/core/python/unified_grid.py) fits these two coefficients against actual-result log loss, with ridge shrinkage toward rating-only calibration on the same training sample. The penalty is selected from 0.001, 0.01 and 0.1 using the last four earlier training seasons; all scaling and fitting precede each scored block. Missing either grid value gives exactly the pre-weekend forecast. Invalid, duplicate and pit-lane grid codes do not enter the grid exam. `forecastPreWeekend` explicitly excludes supplied grid positions. Circuit, current qualifying-time and wet-weather corrections are not retained.

The [form and head study](../research/unified-form/README.md) retained the original ratings: neither external form nor an embedded slow/fast decomposition earned its extra complexity. The retained grid head improves a forecast with additional information; it does not revise strength ratings. A six-rating head, circuit interactions, the nonlinear candidate and extra temperature calibration failed the simplicity comparisons.

The probability target is ordinary classified order including retirements, excluding disqualification, withdrawal and other omitted/non-start statuses. Hazard assumptions include constant per-lap risks and half credit for simultaneous retirements. The default horizon is 60 laps. The same hazards are shown in the UI and used in the probability.

Scenarios use raw overall ratings and the same probability rule with current calibration. Same-snapshot covariance is exact within the approximation; mixed-date states are treated as independent. They are retrospective thought experiments, not historical forecasts. The graph displays the published overall rating at each driver's latest appearance, with links from the actual teammate evidence. It does not fit a second ranking.

## Publication and compatibility

`npm run build:model` runs the Node evidence preparation and Python engine, then writes format-3 `model.json`, `model-latest.json`, format-4 `teammate-graph.json` and the format-1 `rating-reference.json` display supplement. The graph file retains raw node scores; its UI projects them using each driver’s dated display history. Source fingerprints include JavaScript, Python and settings. Python/NumPy/SciPy are build dependencies; the website is static and forecasts need only a small JavaScript projection module.

Production entry point: [buildUnified](../packages/core/node/build-unified.mjs). Older `buildStateSpace` / `runPublishedRatings` functions are retained solely for archived research comparisons. They do not build the website. Findings read the raw published model file and primarily use overall strength; the qualifying-versus-race finding still compares the two timing outputs. Findings labelled relative to the field explicitly subtract each weekend's mean, with matching covariance for relative uncertainty. They do not change the published ratings. Model metadata continues to record `ratingReference: "model-prior"`; the separate display supplement records `halfLife: 20`.

The JSON fields `combined` and `combinedSd` remain compatibility aliases for `overall` and `overallSd`. They are no longer a blend. Older effective/package fields are derived from overall and retained for exports, not exposed as extra strength outputs. The first-screen file omits posterior covariance; the full file carries the dated overall covariance and latest timing covariance used by forecasts. Standard deviations are approximate joint-posterior uncertainty conditional on the observation model and fixed settings.

Use `python3 -m pip install -r requirements-model.txt`, `npm run build:model`, `npm run build:findings`, `npm test` and `npm run build`. The build tests compare the saved file with a fresh fit; inference fixtures compare JavaScript with the selected Python research state. The original selection and its limitations remain in [the study](../research/unified-ratings/README.md).
