# Driver and car form with frozen long-term ratings

Declared before scoring on 3 November 2026. The user asks whether substantially better current driver and car form can carry more predictive power while ratings stay stable. The reference is published source 7a44023e0b230847. Ratings, graph, priors, observation definitions, weights and identical transfer-learning rules remain fixed. The existing strict frozen-rating mover loss and all rating outputs must remain identical. The reference heads and raw form implementation are archived locally in this research directory; numerical reproduction must not require a temporary old model.

## Fixed state families

Compare the installed reference, an exact same-protocol legacy refit, and three declared state families:

1. Clean continuous performance form: qualifying percentage gaps, valid shared-window lap gaps and valid finish/snapshot evidence, separate driver/car components, common aging and car lineage.
2. Rating-innovation form: pair outcome minus the fixed pre-weekend rating-implied probability. Fit one regularized driver/car innovation per channel and weekend, using a single Newton/ridge step about zero form. Initial innovation precision is 1 for each coefficient in log-odds units. Shared car effects have one coefficient rather than a separate coefficient for each driver; teammate comparisons cancel the car term.
3. Both clean continuous and innovation features. This doubles the form state and is eligible only for a material additional gain over the better single family.

Keep the existing three evidence channels (qualifying, lap pace, order) and two update rates 0.6/0.2. Age driver and car states equally by a ten-completed-weekend half-life and winter retention 0.65 per elapsed season; this uses an event clock that training and serving can reproduce without knowing future results. The winter carry equals the existing car-form rule and now also applies to driver form. These fixed assumptions are not searched. Driver state follows driver identity; car state follows car lineage across renames, and starts separately after takeovers. No transfer-specific form rate, driver reset or mean bonus is allowed.

Use the production exam's valid observation stream. Within each channel retain at most one observation per pair, rejecting equally supported conflicts. Qualifying has unit quality. Lap weights use valid shared-coverage evidence; order uses valid finishes, otherwise valid pre-failure snapshots. A mechanical failure alone is not a negative pace observation. Exclude one-lap race classifications, including Belgium 2021. Normalize pair quality by the field-size opportunity count (N−1), preserving weak coverage rather than renormalizing it to a full weekend. Learning support is bounded per entity. No race or qualifying signal enters form until after both same-week forecasts. Current qualifying remains an explicit input only to post-qualifying predictions.

The innovation baseline uses the known 75-point log-odds link with pre-weekend session driver+car/equipment-fit levels, without fitting a later calibration to past state updates. No hazard outcome is treated as poor pace. With design row x and base probability p, the per-weekend innovation is (I+X' diag(w p(1−p)) X)^−1 X'w(y−p). Smooth this target with the two fixed rates and bounded current evidence support. Continuous form retains the old allocation convention as a diagnostic; it is not claimed to identify true driver/car form. Explicit ridge regularization and teammate contrasts likewise fix an attribution convention, not causal ground truth.

## Forecast designs and fitting

Keep linear ridge heads and the current qualifying/grid features. New families expose driver and car form separately, including separate bounded transforms. The legacy refit retains its exact existing package/driver basis. The grid-only head is held fixed.

Use the existing chronological blocks 2008–2011, 2012–2015, 2016–2020 and 2021–2025, with only earlier data for fitting and the last four training years for choosing C in 0.003, 0.03, 0.3. Scaling uses training data only. Include no-intercept orientation reversal as before. 2026 is monitoring only. All historical periods previously informed development; fixed-family comparisons are retrospective model selection, not independent confirmation. Also report a nested family-selection diagnostic whose choices use only inner training periods.

First fit the legacy refit and each new family with both driver/car channels. For the selected eligible family, refit driver-only, car-only and neither as declared component ablations. If a component does not earn its place, prefer the simpler supported design. Do not zero a component in an unchanged head and call that a refitted ablation.

A new state mechanism must improve pooled pre-qualifying combined log-loss by at least 0.001 against the installed reference; other pooled modes may worsen by at most 0.001 and each block by at most 0.003. The combined state must improve pre-qualifying combined loss by a further 0.002 over the better single state to justify its extra complexity. Report paired season intervals, Brier, calibration/reliability, race and qualifying, teammates and field, and per-block results. A point pass is not statistical equivalence.

## Mover prediction at three information cutoffs

1. Preserve the strict frozen long-term rating benchmark exactly (51 teammate-covered moves; total field coverage 69).
2. Add frozen-evidence driver-form forecasts on the same strict teammate observation identities: freeze portable driver levels and both drivers' form before the mover's final old-team weekend. Remove car levels/form and old equipment fit from same-car comparisons. Only deterministic aging of frozen form toward the target date is allowed; no subsequent result, rating update or new-teammate form update may enter. Race uses the pre-qualifying head and qualifying the qualifying head, trained only on earlier blocks. Give moves equal weight and report K5/K10 separately and pooled. This is an augmented prior forecast, not an improvement in frozen ratings themselves.
3. Report ordinary adaptive forecasts in the first K5/K10 new-team weekends separately; these may use evidence available before each forecast, but may never be credited as pre-move portability.

Among forecast-eligible designs, prioritize the frozen-evidence mover point score and require that it does not worsen against the reference forecast with the same cutoff. Report paired whole-move and season sensitivity intervals and exact omissions/identities. Car form must also earn its value in field and ordinary forecasts, since it cancels within a shared-car teammate duel. No improvement after joining can satisfy a failed frozen-evidence comparison. No numeric compensation grid follows this family; declare any structural extension before scoring it.

## Required verification

Controlled common-car versus driver contrast, result reversal, expected-versus-upset innovation, coverage, no mechanical-failure pace penalty, one-lap exclusion, stale driver/car decay, car rename/takeover handling, move carry without special rates, checkpoint isolation, prefix invariance, pair symmetry and train/serve parity are required. Check pre/qual heads exclude all current qualifying/grid features, while post heads can use current qualifying but never current race outcomes. Freeze the reference rating digest before editing production form code and verify it afterward. Rebuild saved model/graph files and visible driver/car form; raw rating histories remain unchanged. No deployment is authorized by this protocol.

## Pre-scoring controlled attribution correction

Before exporting or scoring any candidate, a native review found that retaining the legacy continuous allocation could change car form from teammate-only evidence when an existing car state was nonzero. Replace that diagnostic allocation with the same joint ridge attribution used by the innovation model: continuous targets use Gaussian normal equations (I+X' diag(w)X)^−1 X'w delta, while innovations retain Bernoulli curvature and outcome residuals. Driver/car support, rates and aging are unchanged. Same-car observations have no car design term and cannot update car form. This removes the old 0.4/0.85 attribution constants from the new form mechanism. No predictive results informed this correction.
