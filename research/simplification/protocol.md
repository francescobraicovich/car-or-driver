# Rating simplification evaluation protocol

Recorded on 3 November 2026 before inspecting the new comparison results.

## Objective

Select the least complex implementation that satisfies the agreed rating principles and remains within the practical margins below against the actual published hybrid. Additional components must demonstrate incremental predictive value. A favorable diagnostic cannot compensate for a failed primary performance guard.

## Evidence

Use expanding chronological folds: train/calibrate through 2007 and evaluate 2008–2011; through 2011 and evaluate 2012–2015; through 2015 and evaluate 2016–2020; through 2020 and evaluate 2021–2025. Ratings update forward within an evaluation block; calibration and forecast coefficients do not. Every pair from a weekend stays together. Frozen movers retain their portable rating from before their final old-team weekend; only counterpart/car information available before each scored weekend is allowed.

The mover cohort requires three new-team appearances by the end of its validation block. This corrects the original retrospective cohort, which included one 2020 move whose third appearance was in 2021.

These historical periods have already informed previous models. They are chronological retrospective validation, not untouched confirmation. Evaluate 2026 separately as descriptive monitoring, never as a candidate-selection criterion. No random pair cross-validation.

## Practical performance margins

Candidate minus published hybrid, pooled across chronological folds:

- Ratings-only combined weighted log-loss: at most +0.001.
- Race and qualifying teammate log-loss: at most +0.003 each.
- Frozen mover teammate log-loss at both five and ten weekends: at most +0.010.
- Frozen mover field log-loss at both five and ten weekends: at most +0.003.
- Final pre-weekend, post-qualifying and qualifying forecasts: at most +0.001 each; no individual historical four-year block worse by more than +0.002 (the existing forecast acceptance rule).

Report each fold and pair type, Brier scores, calibration slope and reliability summaries. Examine conspicuous regressions rather than let one era conceal another. Point-estimate passage is a practical guard, not proof of statistical equivalence. Report clustered paired intervals (season for ordinary forecasts; move for transfer tests), including when their upper limit cannot establish non-inferiority. Empty or insufficient samples are unavailable, never zero or an automatic pass.

## Candidate sequence

First evaluate fixed structural ablations: published hybrid; linked race/qualifying filters without the online ranking or extra blend; independent race/qualifying filters; linked filters without persistent driver–team fit. Keep the observation exam fixed.

If no materially simpler candidate passes, evaluate a small coherent model family or a tightly bounded revision motivated by the failed ablations. Declare that extension before scores are run, fit its settings on earlier blocks only, and label all selection explicitly. Do not conduct an unrestricted parameter search. Select the simplest passing candidate; retain the published model if credible comparable performance cannot be demonstrated.

## Behavioral verification

Controlled synthetic tests cover teammate direction and surprise, shared car evidence, mechanical retirement handling, session-channel effects, chronological prefix invariance, portable driver meaning, label/pair orientation invariance, meaningful uncertainty, and stability versus sustained change. Simulated worlds test driver/car recovery where truth is known. Simulations must generate both qualifying and race evidence and include alternative mechanisms; no simulator-only accuracy claim substitutes for real-data comparisons.

## Forecast and form simplification

Compare the existing forecast with no form, a single short-term signal, and the existing richer form feature set under the same folds. Allow the no-form rating an appropriate response speed. Evaluate fixed small regularised linear forecast designs before retaining trees, ensembles or redundant signal variants. The displayed form must have an explicit meaning; teammate centering is not a definition of global driver form.

## Completion

Rebuild selected production outputs, preserve unrelated user work, document model/evaluation limitations, run focused tests plus the complete existing test/lint/browser checks as available. Do not deploy automatically.
