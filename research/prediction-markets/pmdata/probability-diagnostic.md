# Retrospective model versus first-book probability diagnostic

This is an **inspected, post-selection diagnostic**, not an untouched
out-of-sample test or evidence of profitable market making. It scores the
optimizer's selected signal (form weight 1, teammate-form weight −1, head
weight 0), the original roster-normalized model score, and the midpoint of
each contract's first recorded usable YES book. It uses the optimizer's exact
accepted races and active drivers; no quote is taken before its own snapshot.

Binary Brier score and log loss are averaged over the selected driver contracts
within each race, then equally across races. Lower is better. The contracts
within a race are mutually exclusive and do not constitute independent race
observations. The model was selected using training P&L, and the designated
later races were already inspected. No significance claim is justified.

| Split | Independent races | Active markets | Model | Selected | First-book midpoint |
| --- | ---: | ---: | ---: | ---: | ---: |
| Training Brier | 7 | 23 | 0.118805 | 0.118754 | 0.136521 |
| Training log loss | 7 | 23 | 0.420091 | 0.417459 | 0.498488 |
| Pseudo-holdout Brier | 2 | 8 | 0.012842 | 0.013224 | 0.022513 |
| Pseudo-holdout log loss | 2 | 8 | 0.112261 | 0.110998 | 0.142477 |

The Dutch validation race was excluded by the optimizer's source-age guard,
so no validation score is available. Five markets in the seven included
training races were inactive: four lacked a first in-window snapshot, and
Barcelona Leclerc was excluded following a suspected missing trade. All eight selected markets in the two pseudo-holdout
races resolved NO: their small binary losses do not test the quality of a
winner prediction, and the eight outcomes are clustered into just two races.
The selected signal improves log loss slightly relative to the original model
on those two races, while its Brier score is slightly worse. Both model scores
are lower than the first-book midpoint losses in this tiny comparison; neither
observation establishes an edge.

The midpoint is an imperfect comparator: a bid and an ask are not themselves
an executable fair probability, spreads can be large, and the drivers' first
snapshots occur at different times. Midpoints across the field are not
normalized, and a snapshot can be stale or incomplete. Both model variants
use the previous-race roster with no explicit Other/cancellation probability;
the fitted head and data are retrospective and their as-of vintages are
unverified. A binary score on four chosen drivers is not a full-field
multiclass score. The optimizer's separate full-roster scores are in its own
report. Passing these checks cannot establish real fills, costs or profit.

The [complete results](probability-diagnostic.json) preserve the actual
per-market model values, midpoint, source/receive times, outcome, exclusions
and per-race scores. To reproduce after preparing the optimizer's normalized
capture files under `tmp/pmdata-optimization-inactive`:

```sh
node research/prediction-markets/pmdata/probability-diagnostic.mjs > /private/tmp/probability-diagnostic.json
node tests/test-pmdata-probability-diagnostic.mjs
```

No API key or network request is used. The evaluator requires valid finite
probabilities strictly between zero and one for every method; it does not
silently clip endpoints. A market with an invalid, crossed or missing first
book is excluded from all three scores with a recorded reason.
