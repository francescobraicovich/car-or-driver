# Alternative driver and car ratings: research comparison

This is the research log from before the hybrid was moved into the website build. References below to the "current published system" mean the former filter-only baseline. The selected three-source hybrid is now shipped; see [docs/hybrid.md](../docs/hybrid.md) for the production formula, current data artifacts and forecast-head refit.

These prototypes are independent of the website build. Each emits separate driver and constructor ratings before and after every weekend, in both qualifying and race sessions. The exam and frozen pre-move test are the repository's existing ones. Lower log loss is better. The 2016–25 window has already been read in earlier project work and again here; it is a **second look, not an untouched holdout**.

## Three architectures

1. **Career teammate network.** A dated Bradley–Terry graph fits driver differences from prior same-constructor duels. A second constructor graph fits cross-constructor duels conditional on the driver graph. Both graphs are re-solved after each weekend, so a newly connected driver can change the interpretation of earlier comparisons. Evidence fades with age. The graph ingests FIA new-element reports as a driver-car event covariate; the event is eligible only if its publication date precedes the session date. This model uses the existing pair exam but no state-space filter.
2. **Continuous pace regression.** A batch ridge regression estimates one portable driver coefficient and one constructor-season coefficient from earlier continuous pace differences. Race differences use the repository's matched representative lap windows; qualifying uses Q1 times. The constructor coefficient has a prior linking successive seasons. A new-element event is another separately regularised coefficient. This is a pace model, not a complete counterfactual lap model: the data do not include historic tyre, fuel, setup or exact component specification.
3. **Direct pairwise ranking.** An online logistic learner directly optimises the pair exam using driver and constructor coefficients, with internal driver-constructor fit, wet-driver and dated component terms. Its reported coefficients remain a portable driver rating and a constructor rating. The pair predictions may also use the internal terms, just as the current system uses its internal team-fit term.

All three read only earlier weekends when issuing a pre-weekend rating. `check_alternative_ratings.mjs` verifies prefix invariance on a 2024–25 suffix and checks finite driver and car ratings. The models live in `alternative_rating_models.mjs`; `compare_alternative_ratings.mjs` adapts them to the common exam. No site, core or published model file was changed.

## Results

The reported settings below were evaluated on the same 503 weekends through 2025. Component events are allowed only when dated before the relevant session. The loss multiplier for each model and session is fitted on 2002–07, as in the project harness. Full scorecards and all active race driver and car ratings at the end of 2025 are in `alternative-rating-results/`.

| Rating system | All-pair loss 2008–11 | 2012–15 | 2016–25 | Frozen first-five new-team teammate loss 2002–11 / 2012–15 / 2016–25 |
| --- | ---: | ---: | ---: | ---: |
| Current published system | **0.38456** | **0.36395** | **0.39888** | 0.6494 / 0.7258 / 0.6728 |
| Teammate network | 0.42134 | 0.41745 | 0.44647 | 0.7420 / 0.7173 / 0.7235 |
| Continuous pace | 0.41163 | 0.39025 | 0.42632 | 0.7766 / 0.8570 / 0.7362 |
| Direct pairwise ranking | 0.42566 | 0.38666 | 0.41270 | **0.6183 / 0.7107 / 0.6645** |

The network's transitivity is real, but teammate-only edges are sparse and its constructor graph estimates car changes poorly. The continuous pace model orders many cars plausibly but confounds tyres, fuel and stint effects with driver skill. The direct ranking model is the useful signal: its frozen pre-move teammate **direction accuracy** improves from 0.613 / 0.606 / 0.608 to 0.680 / 0.655 / 0.659 across the same three windows. That is a change in driver ordering, not merely a less confident probability. A paired bootstrap over moves puts the accuracy gains at +0.068 [0.008, 0.151] for 32 early moves, +0.049 [0, 0.157] for 15 middle moves, and +0.051 [−0.013, 0.157] for 28 later moves. The later intervals include no gain. It still loses too much on field duels and on the all-pair score to replace the current driver/car system.

## Component event ablation

The direct ranking model supports a coefficient learned online for a dated new core power-unit element. On the pairs where exactly one driver had such a report, turning this feature **off** improved loss in both seasons:

| Year | Race with feature → without | Qualifying with feature → without |
| --- | ---: | ---: |
| 2024 | 0.32178 → **0.31840** (749 pairs) | 0.54363 → **0.52910** (412 pairs) |
| 2025 | 0.38610 → **0.37906** (1,124 pairs) | 0.39975 → **0.38438** (624 pairs) |

The event flag is predictive association, not the effect of a better specification. Reports do not identify a horsepower change or a like-for-like replacement, and the accessible component inventory begins in 2024. The trained coefficient is unstable; this ablation supports leaving it out of a published rating.

## Diagnostic combination

`alternative_driver_blend.mjs` tests whether the independent ranking learner's driver coefficients contain information missing from the current portable driver rating. It blends the coefficient into **every driver's** rating, leaves the current constructor ratings intact, and scores the resulting driver/car system on the same exam. This is a diagnostic combination rather than one of the three independent replacements. Its source learner has the component feature disabled after the ablation above.

At a 25% blend, frozen new-team teammate loss changes from **0.6494 / 0.7258 / 0.6728** to **0.6388 / 0.7204 / 0.6713**. All-pair loss changes from **0.38456 / 0.36395 / 0.39888** to **0.38513 / 0.36335 / 0.39908**. It changes the recent driver rank by 0.53 places on average and reverses 3.0% of driver-pair orders; at the end of 2025 Gabriel Bortoleto moves from 15th to 13th and Franco Colapinto from 14th to 16th. But at that small share the frozen mover *direction* improves only in 2002–11; the later loss gains are from more conservative gaps. At 75% share, direction improves in the later windows too, while all-pair loss worsens substantially. A second, more persistent learner setting gave slightly better overall scores at 25% share, but the same later direction limitation; its settings and results are reproducible with `alternative_driver_blend.mjs`'s JSON argument.

That two-source blend had a real tradeoff. A subsequent three-source candidate is below. No site, core or published model file was changed. The experiments have been inspected on the historical windows, so these windows are selection evidence, not untouched confirmation.

## Three-source hybrid candidate

`hybrid_rating_model.mjs` combines three forward-only estimates of each pre-weekend rating:

- **Portable driver:** 80% of a driver rating that is itself 60% race state-space and 40% qualifying state-space, plus 20% of an independent online pairwise ranking rating. The ranking learner gives teammate observations twice their previous weight. The research run emits the resulting rating for every driver, including stayers; no team-switch flag is used in the blend.
- **Car:** 75% race state-space and 25% qualifying state-space, emitted for every constructor. This uses prior-weekend qualifying levels. The current weekend's qualifying or grid does not enter its pre-race score.
- **Internal driver–team fit:** the existing race state-space fit remains in the pre-weekend pair forecast. It is never added to the portable driver rating. The blend changes the driver and car ratings and their pair predictions together.

The two cross-session weights were selected because qualifying contains a useful independent measure of car and driver pace. The online ranking correction carries career comparison information that the state-space decomposition misses. All three inputs are computed on earlier weekends before they are blended; `check_hybrid_prefix.mjs` confirms that adding the 17 completed 2026 weekends changes none of the 503 earlier pre/post ratings or pair scores. Power-unit event indicators are disabled because the dated 2024–25 ablation above worsened event-pair loss.

| Rating system | All-pair loss 2008–11 | 2012–15 | 2016–25 | Frozen first-five mover teammate loss 2002–11 / 2012–15 / 2016–25 |
| --- | ---: | ---: | ---: | ---: |
| Current published system | 0.38456 | 0.36395 | 0.39888 | 0.6494 / 0.7258 / 0.6728 |
| Teammate network | 0.42134 | 0.41745 | 0.44647 | 0.7420 / 0.7173 / 0.7235 |
| Continuous pace | 0.41163 | 0.39025 | 0.42632 | 0.7766 / 0.8570 / 0.7362 |
| Direct pairwise ranking | 0.42566 | 0.38666 | 0.41270 | **0.6183** / 0.7107 / 0.6645 |
| **Three-source hybrid** | **0.38199** | **0.36011** | **0.39651** | 0.6461 / **0.7084** / **0.6511** |

Against the current system, the hybrid lowers pooled 2008–25 all-pair loss by **0.00304** (paired season bootstrap 95% interval **0.00191–0.00415**, 18 seasons). It lowers pooled frozen mover loss by **0.01411** (paired move bootstrap **0.00082–0.02864**, 75 moves). The per-window mover gains are 0.0033, 0.0175 and 0.0217; only the middle interval excludes zero on its own. This is a materially better *joint* rating system on the selected historical windows, and it beats all three independent prototypes on all-pair loss.

It does **not** dominate every diagnostic. The direct pairwise model still has much better first-five mover direction accuracy: 0.680 / 0.655 / 0.659 versus the hybrid's 0.621 / 0.606 / 0.602. Its early mover loss is also 0.6183 versus the hybrid's 0.6461. Pooled mover loss of the hybrid versus direct ranking is statistically tied: the hybrid's reduction is **−0.0040** with a paired move interval **−0.0454–0.0375**. A pure direct-ranking driver rating with a qualifying-informed car did not solve this: its best all-pair loss was 0.3961 / 0.3684 / 0.4099, well above the current system. A separately learned driver–team fit reduced its 2008–11 loss only to about 0.3946. These failures suggest that the ranking model's portable ordering is useful but its driver magnitude is not yet jointly identified with a field-strength car rating.

The 17 completed 2026 weekends are an additional **second look**, because an earlier hybrid setting was inspected on them before this 20% ranking weight was chosen. All-pair loss is essentially tied there: **0.38387 hybrid versus 0.38383 current**. Only 16 first-five mover teammate duels are available in 2026. This is not enough to claim a new-period win. The hybrid is the best complete historical candidate here; a claim of clear superiority over all four systems on every rating metric would be false.

Full driver and car ratings through 2025 and 2026, calibration, pair counts, and the paired intervals are in `alternative-rating-results/hybrid-qualifying-ranking-2025-share-0.2.json`, `alternative-rating-results/hybrid-qualifying-ranking-2026-share-0.2.json`, and `alternative-rating-results/hybrid-confidence.json`.

## Final independent attempt: career graph from teammate pace

`teammate_pace_graph.mjs` fits a dated, regularised comparison graph from prior within-team Q1 time gaps, matched race-lap-window pace gaps and race teammate results. Every driver uses the same update and fading rule. Graph edges link drivers across career team changes, providing the proposed transitivity directly. The graph emits a portable driver rating; a separate forward-only race/qualifying blend emits the constructor rating. Each weekend is scored before that weekend's evidence enters the graph. There is no mover flag, mover-specific learning rate or special arrival rule. A one-edge sign check gives the expected faster-driver direction.

It failed the common exam:

| Rating system | All-pair loss 2008–11 / 2012–15 / 2016–25 | Frozen first-five mover teammate loss 2002–11 / 2012–15 / 2016–25 |
| --- | --- | --- |
| Current published system | 0.3846 / 0.3639 / 0.3989 | 0.649 / 0.726 / 0.673 |
| Three-source hybrid | **0.3820 / 0.3601 / 0.3965** | **0.646 / 0.708 / 0.651** |
| Pace graph, default | 0.4036 / 0.3859 / 0.4230 | 0.823 / 0.785 / 0.716 |
| Pace graph, three-year memory and stronger ridge | 0.4075 / 0.3946 / 0.4275 | 0.758 / 0.716 / **0.633** |

Qualifying-only graph evidence reached 0.606 mover loss in 2016–25 but scored 0.811 / 0.765 in the earlier periods. Race-pace-only evidence also failed. The graph's transitivity does not compensate for noisy, format-dependent Q1 and race-pace gaps across eras. It should not replace the hybrid. `check_pace_graph_prefix.mjs` confirms identical predictions for the first 503 weekends when 17 later weekends are added. No evaluated model reaches roughly 0.5 frozen mover loss in all periods on this project's strict, before-move test. The new graph's default and short-memory scorecards are saved in `alternative-rating-results/teammate-pace-graph-*.json`.

## Reproduce

## Renewed search after the 0.5 frozen-mover target

I tested three additional ways to learn portable driver and separate car ratings. All issue pre-weekend ratings before ingesting that weekend. Each driver gets the same update and winter rule, irrespective of a team change. The website model is unchanged.

| Research candidate | Combined all-pair loss 2008–11 / 2012–15 / 2016–25 | Frozen first-five mover loss 2002–11 / 2012–15 / 2016–25 |
| --- | --- | --- |
| Current published system | 0.3846 / 0.3640 / 0.3989 | 0.649 / 0.726 / 0.673 |
| Earlier three-source hybrid | **0.3820 / 0.3601 / 0.3965** | 0.646 / 0.708 / 0.651 |
| Joint race/qualifying factor learner, best 2012–25 all-pair setting in a 36-setting screen | 0.4004 / 0.3709 / 0.4061 | 0.658 / 0.720 / **0.619** |
| Hybrid plus 20% qualifying direct-ranking driver signal | 0.3830 / **0.3598** / 0.3969 | **0.639** / 0.705 / 0.651 |
| Batch field-factor decomposition | 0.4201 / 0.3789 / 0.4094 (race pairs only) | 0.777 / 0.860 / 0.819 |

The joint learner updates one portable driver coefficient from race and qualifying pairs and separate constructor coefficients for each session. Its good recent mover result does not generalise to the earlier periods or the all-pair score. The batch factor model re-solves prior field scores and teammate comparisons after every weekend; it loses too much driver information through field-score compression. `check_factor_prefix.mjs` confirms both models' first 503 predictions are identical when the 17 later weekends are appended.

The 2002–07 teammate-training stack of hybrid, direct ranking, race network and qualifying network assigned 90% to the hybrid and 10% to the race network. Its mover losses were 0.652 / 0.708 / 0.654, with no gain over the hybrid. A qualifying-only pace network with a learned common experience curve also failed: its best tested ridge setting gave 0.735 / 0.735 / 0.596 mover loss. This curve depends on each driver's number of prior starts, never on a move flag.

The qualifying direct-ranking signal gets some hard individual moves right, including Ricciardo over Vettel before 2014, but it also reverses several correct calls. Raising its share from 20% to 100% improves the first two mover windows only to about 0.628 / 0.697 while the recent window worsens to 0.660 and all-pair loss worsens in every period. The 20% share is a small diagnostic improvement, not a replacement for the hybrid. The 2016–25 period has been inspected many times and is no longer an untouched holdout. None of these candidates reaches 0.5 in all three frozen-mover periods; claiming that target would be unsupported.

The middle period has only 15 eligible moves. An event-level audit in `inspect_frozen_moves.mjs` shows why its aggregate is fragile: the hybrid assigned Ricciardo about 10% against Vettel before their 2014 pairing, while his first-five weighted result was about 95%; that single event contributes log loss above 2.0. This is a prior-information problem. Shrinking such predictions indiscriminately would also erase useful confidence on other pairings.

Exact score outputs are saved in `alternative-rating-results/joint-duel-factor.json`, `alternative-rating-results/batch-field-factor.json`, and `alternative-rating-results/qualifying-ranking-transfer.json`.

## Small neural factor experiment

There are 162,910 race pairs and 93,097 qualifying pairs through 2025, but they come from 503 weekends and reuse the same entrants' outcomes many times. The strict test has 75 scored move events across its three windows. This is enough to try a small shared neural model, but not to treat 256,007 pairs as independent training examples for a large network.

`neural_factor_rating.mjs` learns a scalar portable driver rating and a scalar car rating. It also has a bounded, trainable two-dimensional driver-style × car-style interaction in the pair forecast. All parameters update only after the weekend being forecast, and the update and winter rules are identical for every entrant. A deterministic initialisation makes runs reproducible. This tests whether a shared nonlinear interaction can separate personal ability from car compatibility without a mover switch. The neural race and qualifying models are trained independently on their dated streams. Prefix invariance passed on all 503 earlier weekends after appending 17 later ones.

| Model | Combined all-pair loss 2008–11 / 2012–15 / 2016–25 | Frozen first-five mover loss 2002–11 / 2012–15 / 2016–25 |
| --- | --- | --- |
| Earlier three-source hybrid | **0.3820 / 0.3601 / 0.3965** | 0.646 / 0.708 / 0.651 |
| Neural factor, default | 0.4313 / 0.3979 / 0.4179 | 0.659 / **0.691** / 0.667 |
| Neural factor, stronger regularisation | 0.4219 / 0.3902 / 0.4109 | **0.645** / 0.700 / **0.631** |
| Hybrid plus 10% of regularised neural driver and car ratings | 0.3824 / **0.3600** / 0.3965 | 0.644 / 0.708 / 0.648 |

The latent interaction improves some mover predictions but makes the complete rating system worse. A 10% transfer gives only a small mover gain and essentially ties the historical combined loss. At 40% transfer, mover loss falls to 0.642 / 0.705 / 0.638 but combined loss worsens to 0.3866 / 0.3630 / 0.3986. The regularised neural model's field-centred per-weekend driver update averaged 3.68 points (95th percentile 11.61), versus 2.26 (6.60) for the hybrid; its drivers were less stable even while its car updates were smaller. These numbers do not justify replacing the hybrid, and they do not reach 0.5. They also do not prove that every neural architecture will fail: this was one constrained latent-factor model, with five sensitivity settings inspected on the historical windows.

The reproducible results are in `alternative-rating-results/neural-factor-default.json`, `alternative-rating-results/neural-factor-regularized.json`, and `alternative-rating-results/neural-transfer.json`.

The more promising neural input is the 885,381 lap records in `data/lap_times.csv`, rather than duplicated pair outcomes. A future lap-sequence model could learn race-phase, lap-number, degradation and interruption effects before extracting each driver's residual pace and each constructor's pace. It would still need dated walk-forward training, separate scalar driver and car heads, and the same frozen-mover exam. The present file has no tyre-compound or fuel-load columns, so the model would have to infer those nuisance effects from timing patterns; a larger network alone does not identify them.

## Dated neural sequence and lap model

`export_neural_sequences.mjs` builds one record per completed weekend. Its pre-weekend features contain the last 10 or 20 events for each driver and constructor: six race-phase lap-pace residuals derived from the raw lap times, matched teammate pace, Q1 gaps, teammate results, wet-race indicators, coverage, dated power-unit element reports, and the previous posted ratings from five driver and four car methods. The current component flag is eligible only if its report predates the race. Current race lap times, Q1 results and outcomes are added only as **targets and future history after the pre-weekend prediction**. The data loader reads the raw lap file, but this network consumes robust event and race-phase summaries rather than each of the 885,381 lap rows separately.

`train_neural_sequences.py` trains two shared multilayer towers, one returning a portable driver correction and one a constructor correction. It adds them to the research hybrid, then learns from that weekend's 162,910 historical race pair records and an auxiliary lap-pace target. An entrant's pair outcomes are correlated within a weekend; the loss weights are normalised per weekend. Every driver and constructor uses the same towers, output penalty and two updates after each race. No mover flag, arrival rule or faster mover update exists. The 10-event, 128-wide version has 62,978 trainable weights; the 20-event, 512-wide version has 627,714. Corrections are centered over the active field and a 25% share is applied equally to all entrants, preserving the hybrid rating location. The share and hyperparameters were inspected on the historical windows, so these are **selected** results.

| Model | Combined all-pair loss 2008–11 / 2012–15 / 2016–25 | Frozen first-five mover teammate loss 2002–11 / 2012–15 / 2016–25 |
| --- | --- | --- |
| Published | 0.38456 / 0.36395 / 0.39888 | 0.6494 / 0.7258 / 0.6728 |
| Three-source hybrid | 0.38199 / 0.36011 / **0.39651** | 0.6461 / 0.7084 / 0.6511 |
| 10 events, 128-wide, 25% correction | 0.38076 / 0.36043 / 0.39645 | **0.6443** / **0.7014** / 0.6503 |
| 20 events, 512-wide, 25% correction | **0.38034** / **0.35969** / 0.39667 | 0.6455 / 0.7043 / **0.6485** |

The wide model lowers pooled historical all-pair loss versus the hybrid by **0.000354**. A paired bootstrap resampling 18 seasons gives a 95% interval of **−0.000032 to +0.000800**. Its pooled frozen-mover loss falls by **0.00214**; a paired bootstrap resampling 75 moves gives **−0.00137 to +0.00598**. Both intervals include zero. Historical frozen-mover direction accuracy is 0.620 / 0.606 / 0.608, versus the hybrid's 0.621 / 0.606 / 0.602. Thus the small log-loss gain mainly adjusts confidence, without materially changing the mistaken ordering of difficult movers.

Through 17 completed 2026 weekends, the wide model's combined all-pair loss is **0.38342**, versus **0.38387** for the hybrid and **0.38383** for the published system. Its frozen mover loss is **0.2528**, versus **0.2502** for the hybrid, on only 16 teammate duels. The 2026 window was already inspected during previous research, so it is a second look. `check_neural_sequence_prefix.py` confirms that appending these 17 weekends leaves all 503 earlier feature records and complete pre/post rating predictions exactly identical.

The wider network does **not** produce more stable ratings: across adjacent weekends in the same season, the mean field-centred driver change rises from 2.38 to 2.61 rating points (95th percentile 6.96 to 7.50); the constructor mean rises from 4.80 to 5.01 points. The extra time history and capacity capture a little predictable structure, but only 503 weekend-level batches and 75 eligible move events constrain how much portable driver evidence can be learned. Lap pace also mixes driver, car, tyres, fuel, traffic and strategy; the available records do not identify all of those causes. Dated component reports identify a replacement, not its performance gain. These limits explain why more weights and lap summaries did not approach 0.5 frozen-mover loss. There is no defensible replacement for the website model on these results.

Reproduction of the wide run and its scorecards:

```bash
node research/export_neural_sequences.mjs 2025 /tmp/driver-car-neural-2025.json 20
node research/export_neural_sequences.mjs 2026 /tmp/driver-car-neural-2026.json 20
python3 research/train_neural_sequences.py /tmp/driver-car-neural-2025.json /tmp/driver-car-neural-predictions-2025.json '{"hidden":512,"lapWeight":0.5,"learningRate":0.001,"updatesPerWeekend":2,"weightDecay":0.001,"outputPenalty":0.03,"pacePoints":150,"correctionScale":80}'
python3 research/train_neural_sequences.py /tmp/driver-car-neural-2026.json /tmp/driver-car-neural-predictions-2026.json '{"hidden":512,"lapWeight":0.5,"learningRate":0.001,"updatesPerWeekend":2,"weightDecay":0.001,"outputPenalty":0.03,"pacePoints":150,"correctionScale":80}'
python3 research/check_neural_sequence_prefix.py /tmp/driver-car-neural-2025.json /tmp/driver-car-neural-2026.json /tmp/driver-car-neural-predictions-2025.json /tmp/driver-car-neural-predictions-2026.json
node research/evaluate_neural_sequences.mjs /tmp/driver-car-neural-predictions-2025.json research/alternative-rating-results/neural-sequence-wide-2025.json 2025 0.25
node research/evaluate_neural_sequences.mjs /tmp/driver-car-neural-predictions-2026.json research/alternative-rating-results/neural-sequence-wide-2026.json 2026 0.25
```

The two result files include full latest posted driver and constructor rankings, calibration, paired intervals and stability diagnostics. The website code and published rating output remain untouched.

Additional commands:

```bash
node research/evaluate_joint_duel_factors.mjs
node research/evaluate_batch_field_factors.mjs
node research/evaluate_qualifying_ranking_transfer.mjs
node research/stacked_driver_rating.mjs
node research/inspect_frozen_moves.mjs
node research/check_factor_prefix.mjs
node research/evaluate_neural_factor.mjs
node research/evaluate_neural_transfer.mjs
node research/check_factor_prefix.mjs neural-driver-car-factor
```

## Earlier reproduction commands

```bash
node research/check_alternative_ratings.mjs
node research/compare_alternative_ratings.mjs baseline
node research/compare_alternative_ratings.mjs network
node research/compare_alternative_ratings.mjs pace
node research/compare_alternative_ratings.mjs ranking
node research/compare_alternative_ratings.mjs ranking '{"includeComponent":false}'
node research/compare_mover_direction.mjs
node research/alternative_driver_blend.mjs
node research/alternative_driver_blend.mjs '{"learningRate":120,"levelPenalty":0.001,"carWinterRetention":0.8,"includeComponent":false}'
node research/search_three_source.mjs
node research/evaluate_hybrid_ratings.mjs 2025
node research/evaluate_hybrid_ratings.mjs 2026
node research/compare_hybrid_confidence.mjs
node research/check_hybrid_prefix.mjs
node research/evaluate_pace_graph.mjs
node research/evaluate_pace_graph.mjs '{"qualifyingWeight":0.5,"racePaceWeight":1,"outcomeWeight":0,"memoryYears":3,"fade":0.7,"ridge":5}'
node research/check_pace_graph_prefix.mjs
```
