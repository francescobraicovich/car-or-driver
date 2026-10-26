# Time decay in teammate evidence

The graph displayed on the site and the published rating blend are separate. The displayed graph solves a transitive, regularised teammate network from race and qualifying duels; its current edge totals do not decay. The published blend instead gives 20% weight to an online pair-ranking learner alongside race and qualifying state-space filters. That learner already retains 95% of driver levels each winter and applies a small penalty when a coefficient is updated. Changing the displayed graph alone cannot change the published ratings.

## Evaluation

Both experiments use only information available before each scored weekend. Pair loss combines race and qualifying observations, calibrating each candidate on 2002–2007. The mover exam freezes the driver's rating before the final weekend at the old team and scores duels with the new teammate during the first five new-team weekends. Lower log loss is better. The three historical windows have been used for earlier model selection; these are diagnostic comparisons, not untouched validation.

First, keep both state-space filters and the 20% ranking share fixed, changing only the ranking learner's winter retention of driver levels. `1.00` means no winter fade; `0.95` is published. This tests a form of decay in the signal that actually feeds the published rating.

| Driver retention | All-pair loss 2008–11 / 2012–15 / 2016–25 | Frozen mover loss 2002–11 / 2012–15 / 2016–25 | Mover direction accuracy 2002–11 / 2012–15 / 2016–25 |
| --- | --- | --- | --- |
| 1.00 | 0.38195 / 0.35977 / 0.39643 | 0.64507 / 0.71106 / 0.65655 | 0.621 / 0.606 / 0.608 |
| **0.95 published** | **0.38199 / 0.36011 / 0.39651** | **0.64611 / 0.70836 / 0.65113** | **0.621 / 0.606 / 0.602** |
| 0.85 | 0.38217 / 0.36075 / 0.39682 | 0.64786 / 0.70523 / 0.64531 | 0.621 / 0.606 / 0.602 |
| 0.70 | 0.38248 / 0.36144 / 0.39722 | 0.64986 / 0.70353 / 0.64193 | 0.621 / 0.569 / 0.602 |
| 0.50 | 0.38284 / 0.36202 / 0.39761 | 0.65172 / 0.70344 / 0.64104 | 0.613 / 0.569 / 0.602 |

Second, replace the 20% ranking component with the *displayed* graph's dated scores. Re-solve its regularised teammate network after each weekend and use only the previous graph snapshot for the next forecast. For the decayed cases, multiply each accumulated win and loss total by `2^(-elapsed_years / half_life)` before adding the next weekend's duels. All other components and blend shares stay fixed. This is a test of the literal graph, not a change to the site data.

| 20% component | All-pair loss 2008–11 / 2012–15 / 2016–25 | Frozen mover loss 2002–11 / 2012–15 / 2016–25 | Mover direction accuracy 2002–11 / 2012–15 / 2016–25 |
| --- | --- | --- | --- |
| **Published online ranking** | **0.38199 / 0.36011 / 0.39651** | **0.64611 / 0.70836 / 0.65113** | **0.621 / 0.606 / 0.602** |
| Displayed graph, no decay | 0.38117 / 0.36085 / 0.39582 | 0.67748 / 0.71683 / 0.65356 | 0.592 / 0.569 / 0.602 |
| Displayed graph, eight-year half-life | 0.38117 / 0.36098 / 0.39574 | 0.67637 / 0.71466 / 0.65440 | 0.592 / 0.569 / 0.602 |
| Displayed graph, three-year half-life | 0.38133 / 0.36115 / 0.39585 | 0.67482 / 0.70998 / 0.65171 | 0.592 / 0.569 / 0.602 |

Decay gives a small improvement to the displayed graph's mover log loss compared with its own no-decay version, but does not fix the mover ordering. At 20% share it remains worse than the published blend on frozen movers in all three windows. Stronger winter fading in the published ranking signal trades better recent mover log loss for worse all-pair loss, and at 0.70 retention reverses correct mover calls in 2012–2015. These results do not support changing the published model or graph display. The differences are small enough that a future decision would need fresh, untouched move events.

Reproduce with `node research/evaluate_graph_decay.mjs` and `node research/evaluate_teammate_graph_decay.mjs`. The complete scorecards are in `research/alternative-rating-results/graph-decay.json` and `research/alternative-rating-results/teammate-graph-decay.json`.
