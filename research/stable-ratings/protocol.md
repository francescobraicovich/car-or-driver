# Stable ratings with teammate-graph evidence

Recorded on 3 November 2026 before scoring this candidate family. This continues the earlier simplification, with the user's new priorities: substantially smoother long-term ratings, explicit use of teammate-graph evidence, and mover prediction as the primary metric. All historical seasons have already informed development; this is retrospective model selection.

## Required behavior

The rating principles in `docs/rating-principles.md` remain mandatory. Graph evidence decays exponentially in elapsed calendar time. Every additional equally recent and equally valid shared race increases effective information; there is no hard evidence cap. A direct comparison has more information than an otherwise equivalent serial indirect path. This does not require one weak direct result to override arbitrarily abundant indirect evidence. Paths propagate information through a single graph solve, rather than being counted again as invented observations.

One independent qualifying comparison and at most one race comparison enter each teammate pair's weekend. Prefer valid race finishes, otherwise use valid pre-failure lap pace or snapshots with coverage weights. A mechanical failure alone is never a loss of driver pace. A team change does not insert a driver mean penalty or an extra driver-variance jump.

The inherited graph's log-odds target and growing sample precision can make an expected second win move more than an upset after the first win. That fails the agreed surprise principle. Before empirical scoring, replace this objective with a ridge Bradley–Terry likelihood over the direct weighted wins/losses. Use log-odds levels, ridge precision 2 and the existing 75-point odds scale. Precision 2 matches the inherited graph's near-equal edge-to-prior information ratio: Bradley–Terry curvature is approximately `n/4`, giving `n/8` relative to that prior. Do not tune this precision after seeing results.

## Fixed first family

Freeze the current published model as the baseline through the `without-qualifying-car-link` research implementation: rounded filters, driver qualifying link 0.4, no car link, and the lean online learner. Verify its output against the saved current model.

The stable filter alternative removes the qualifying-driver link, removes both move-specific driver variance jumps, and halves annual driver drift standard deviations (race 2, qualifying 4 points). Other filter settings, observation definitions, car learning and retirement handling remain fixed. Include a slow-filter-only diagnostic.

For graph candidates remove the online learner. The underlying race driver estimate blends 60% independent race filter and 40% qualifying filter. Blend that estimate with the same portable graph driver level used to anchor the separately reported qualifying estimate. Test graph shares 0.2, 0.5 and 0.8, with calendar half-lives of 3 and 8 years. Include graph share 1 as a diagnostic for each half-life. Car levels retain their existing 75% race / 25% qualifying blend. Every score is computed before the weekend it predicts; posted levels can use that weekend's evidence. A pure graph is eligible only if it also passes all required behavior and performance checks.

There are no driver-specific exceptions or chart-only smoothing. If the first family fails, record the failure and declare a small structural extension before scoring it. Do not search unrestricted numerical settings.

## Primary selection and uncertainty

Use the same four expanding chronological blocks: 2008–2011, 2012–2015, 2016–2020 and 2021–2025. Fit calibration on earlier seasons only. Freeze each mover's driver level before the final old-team weekend. Require three new-team appearances by the block end and truncate scored outcomes at that end. Exact scored-pair and omitted-rating identities must match.

Within each move, first compute weighted teammate log-loss. Give each move equal weight. The primary objective is the equal mean of four cells: race and qualifying, at both five and ten new-team weekends. Report the old row-weighted scores alongside it. Bootstrap complete moves jointly across cells and report season-cluster sensitivity. Missing samples are unavailable, not zero. Report every block and count. 2026 remains descriptive monitoring and cannot select settings.

Choose by primary mover loss among candidates meeting all requirements below. The candidate must improve that primary point estimate. Each mover teammate cell, both move-balanced and row-weighted, may worsen by at most 0.005; each row-weighted mover field cell by at most 0.003. These are point guards, not statistical proof of equivalence; uncertainty intervals must be shown even when they exceed a margin.

## Stability and secondary guards

Measure raw published driver rating changes across consecutive appearances and within each weekend. Report race, qualifying and combined levels; median, 90th/99th percentile, maximum, reversal rate and opposite successive changes of at least 5 points. Distinguish season boundaries, team changes and within-season changes, plus common field shifts. Normalize pre/post levels to the same field reference; do not count a latent gauge offset as a rating update.

Combined post-to-post median absolute change must fall by at least 20%, and its 90th and 99th percentiles by at least 35%. Season-boundary and team-change 90th percentiles must each fall by at least 35%. Check sustained-change responsiveness and controlled teammate direction; smoothness cannot excuse failed behavioral principles.

The user's new priority allows a small explicit tradeoff in ordinary forecasts: ratings-only pooled weighted log-loss may rise by at most 0.003 and each session's teammate loss by at most 0.005. Refit the already selected small ridge forecast design with inner chronological validation; its combined pre-/post-qualifying and qualifying losses may rise by at most 0.003 pooled and 0.006 in any block. Retain the earlier ridge-strength choices. Report all regressions. Do not alter these margins after viewing this family's results.

## Completion

Install a passing graph-based stable configuration, rebuild model/history/graph/Insights outputs, document the graph's meaning and uncertainty limits, and validate the production path against the selected research candidate. Run meaningful property tests, Python/JavaScript inference parity, the complete Node suite, lint and browser checks. Preserve unrelated work and do not deploy automatically.

## Declared persistent-level extension

The first family passed substantial smoothness reductions at moderate graph shares, but every candidate worsened the primary mover score: approximately +0.022 to +0.062. Retain those failures in `first-family-results.json`. Removing fast evidence adaptation and replacing its estimate with a career graph is not supported by these results.

Before scoring this extension, retain the baseline likelihood filters and define a separate persistent driver estimate by a temporal regularization objective. Minimize squared distance from the current baseline estimate and the graph estimate, plus a squared penalty on departure from the previous persistent level. Equivalently, update the persistent level toward their weighted target by a fixed fraction. This persistent estimate, including its pre-weekend state, is used for forecasts and frozen movers; it is not a plotting transformation.

Test update fractions 0.25 and 0.125, graph target shares 0.05 and 0.15, and the already declared graph half-lives 3 and 8 years. Include a no-graph control at each update fraction. Car learning is unchanged. Initial driver state uses only the baseline's pre-observation prior. Preserve effective fit terms separately, carry driver state across team changes, and align targets to the active field's prior mean so arbitrary gauge changes do not accumulate. A weekend with no observations must not manufacture a performance update. Current-weekend graph evidence can change the posterior, never its prior.

All primary, secondary, smoothness and forecast margins remain unchanged. In addition, the graph must earn its place against the control with the same update fraction: lower primary mover point loss, or at least 5% lower combined 99th-percentile change with mover loss no more than +0.001 worse. Report both comparisons and their uncertainty. This is a bounded structural extension after a stated failure, not independent confirmation.

## Declared bounded-influence extension

The persistent family also fails: its best graph-free primary difference is approximately +0.0055; adding a 5% graph prior increases that to approximately +0.0067. Its first-five-weekend race mover loss is particularly affected. Save the complete outcomes in `persistent-results.json`. A uniformly small update fraction creates lag as well as reducing noise.

Before scoring this extension, replace the linear innovation with the smooth, odd, strictly increasing function `psi(e) = c*tanh(e/c)`. Use a fixed update fraction of 0.75, retaining most small innovations while bounding the influence of very large discrepancies. The corresponding persistent state participates in forecasts and mover freezes exactly as before. A hard clipping threshold is avoided because it can make different surprises produce identical updates.

Test innovation scales `c = 4` and `8` rating points. Keep a 5% graph target share and the two previously declared half-lives; include a graph-free control for each scale. There are six new candidates. Do not retune the update fraction or add driver-specific exceptions. The inherited baseline, all margins, the primary objective, and the matched-control requirement remain unchanged. Show whether the graph contributes useful information beyond robust persistence alone.

## User-selected smoothness tradeoff

After all three families failed the original strict improvement requirement, the user was shown the concrete tradeoff: approximately 50% smaller large changes, at about +0.006 to +0.009 frozen-mover log-loss for the closest candidates. The user explicitly chose: “Accept a small documented mover loss for substantially smoother ratings.” This is a human preference change after results, not a newly discovered statistical pass.

Within the already tested candidates that include the graph and meet the declared median, tail, season-boundary and team-change smoothness reductions, select the lowest primary mover loss, allowing at most +0.010 pooled move-balanced loss. Keep the +0.003 pooled ratings-only and the declared full-forecast limits. The original per-cell raw rating guards and matched-control test remain in the report as failed diagnostics; they are not relabelled as passes. Report their regressions prominently, including the graph's incremental effect. The underlying behavioral principles remain mandatory.

This selects the persistent update fraction 0.25, graph target share 0.05 and three-year graph half-life for full-forecast validation. Its primary mover difference is +0.006743, while combined median/p90/p99 changes decline by approximately 53%/45%/48%. The graph-free matched control costs +0.005540; the graph therefore adds approximately +0.001203 mover loss and only a small additional smoothness benefit. It is a requested graph integration, not evidence that a graph mean improves mover prediction. Race five-weekend row-weighted loss rises by approximately +0.018901, and qualifying five-weekend field loss by +0.006422. These local costs must remain visible alongside the pooled metric.

No additional rating parameters will be searched after this choice. Refit and validate the existing forecast design, rebuild the selected model, and run the production verification. If the complete forecasts fail their limits, retain the evidence and address that failure without claiming the raw-rating tradeoff solved it.

## Behavioral rejection and intrinsic-learning correction

The selected persistent layer subsequently failed a controlled behavioral audit. After five A race wins with qualifying already observed, a sixth weekend containing only a B qualifying win increased the displayed combined A–B gap from 22.1583 to 22.9246; an empty sixth weekend left it unchanged. Delayed assimilation of the older race target outweighed the new evidence. The user approved a predictive tradeoff, not this violation. Reject this implementation despite its favorable stability and acceptable forecast loss. Retain its empirical and simulation artifacts as rejected evidence.

Changing only the definition of the pre-weekend prior would leave the displayed post-to-post counterexample unchanged, so that relabeling is not accepted as a fix. Before new scoring, test an intrinsic-learning correction instead of any posterior-output smoothing: multiply both state-space likelihood temperatures and the online learner's learning rate by one common information factor, either 0.5 or 0.25. Retain the baseline drift, priors, session link and car inference. Blend the resulting contemporaneous portable driver levels with 5% of the three-year graph; include a graph-free matched control at each factor. There are four candidates, with no delayed persistent target.

This revises the extension's earlier ban on a move-time variance increase: retain the baseline's uncertainty increases, while requiring that a move without new evidence cannot itself alter the portable mean. The broader foundational contract permits uncertainty to increase. This change is recorded before scoring; the earlier no-jump candidate family failed empirically. It is not a claim that an uncertainty increase measures an actual change in skill.

The user's documented small-cost preference and the required smoothness reductions still apply. All direction, surprise, no-evidence-move, symmetry, prefix and sustained-response tests remain mandatory, including mixed race/qualifying history counterexamples. If neither information factor satisfies the behavioral and smoothness requirements within the accepted cost, report the unresolved tradeoff rather than silently relax a foundational principle.

The 0.25 factor with 5% graph share passes the controlled behavioral audit and all required smoothness reductions. It costs +0.004594 primary mover loss, less than the tradeoff previously shown to and accepted by the user. Median/p90/p99 changes fall by approximately 44%/38%/42%. The raw all-pair rating score rises +0.003548, exceeding the initial +0.003 diagnostic guard; retain that failure explicitly. The graph adds +0.000689 mover loss versus the matched graph-free control, while reducing p99 changes by approximately 2.6% and slightly improving ordinary pair loss. Do not call this an incremental mover improvement.

Select this behaviorally valid model for complete-forecast verification. Under the user's cost preference, the original raw rating-score guards are reported as failed diagnostics; complete pre/post/qualifying and grid forecast guards remain +0.003 pooled and +0.006 per block. The result is a chosen stability tradeoff, not a strict all-metrics pass or statistical equivalence claim. No further rating temperatures or graph shares will be searched.
