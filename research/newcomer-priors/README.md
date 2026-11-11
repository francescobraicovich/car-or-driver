# Newcomer-prior validation

**Decision: retain the current production priors.** None of the three bounded
experiments improved newcomer performance and preserved acceptable stability.
Production source remains `dc909062c7273b74`; ratings, forecasts, methodology and
the fixed publication reference are unchanged. No field average is forced to 1,000.

## Proposed rule

For each output, initialise a new entity as:

`mean of already-known entrants of the same kind + fitted entry offset + residual`

The reference is calculated before reading the weekend's observations and before
adding any simultaneous newcomers. Its covariance is carried into each new state,
including correlations between newcomers and with established competitors. This
is a conditional Gaussian prior, not a second observation or a rating blend.
Adding an entrant alone does not change existing means or covariance (apart from
the usual time evolution). Transfers, returns and renames retain their states.
The first field keeps the original independent zero-mean priors.

This construction is invariant to a common shift in existing strengths: newcomer
predictions depend on relative evidence rather than an arbitrary absolute zero.
With a correctly specified entry gap, the constant-ability turnover test removes
the artificial rise seen with a fresh zero-mean prior for each replacement.
That structural property does **not** establish that estimated entry gaps will
generalise to future competitors, or identify absolute ability across eras.

## Historical comparison

The frozen evidence contains 620 weekends. Model fitting used pre-update
predictions in 2002–2007 following 1994–2001 warm-up. Validation covers 2008–2025
in four chronological blocks with calibration fitted on earlier years only;
2026 is reported separately. The same actual-result and timing targets and equal-
weekend weights are used for every candidate. First-five slices mean pairs
involving an entity with fewer than five previous appearances. Car slices exclude
teammates, because their shared car cancels.

All result scores below are log losses; lower is better. Movement is the 90th
percentile absolute overall driver change between adjacent weekends at most
60 days apart, for drivers present in both.

| Candidate | All pairs | Driver first five | Car first five | Driver movement |
| --- | ---: | ---: | ---: | ---: |
| Current production | 0.53012 | 0.52272 | 0.52678 | 3.06 |
| Relative entry means; original uncertainty | 0.52993 | 0.52450 | 0.51864 | 3.06 |
| Relative means and fitted uncertainty | 0.53121 | 0.52543 | 0.52393 | 4.19 |
| First-five fit; original uncertainty | 0.52979 | 0.52520 | 0.53788 | 2.99 |

The first candidate improved new-car result forecasts but worsened driver first-
five result loss and both timing errors. Driver-debut result loss rose by 0.00873.
Its small full-field benefit was insufficient to justify the targeted regression.

Fitting uncertainty improved first-five pace errors, especially for cars, but
learned residual deviations of about 57 driver points and 209 car points. Driver
movement rose 37%; driver-debut result loss worsened by 0.01199. This conflicts
with the stability objective, even though the predictive tolerance guards passed.

The final constrained fit retained 20/50-point residual deviations, scored the
first five appearances rather than just the debut, and regularised population
offsets independently across outputs. Its full-field result improvement was
small: −0.000327, with a whole-season 95% interval of approximately
[−0.001223, +0.000599]. It worsened both newcomer result slices and raised
full-field qualifying error by 2.08%, beyond the declared 2% limit. Reject it.

The early training period contains only 33 newly observed drivers and eight car
identities. Historical validation contains 64 new drivers and nine car identities;
new-car debuts occur on just five distinct weekends. A new car identity can
represent a takeover under the existing lineage rules, not only a new team built
from scratch. This diversity and small sample limit confidence in a single
population prior. The comparisons are retrospective: two focused revisions
followed inspection of earlier results. They are not an untouched test.

## Files and verification

- [Protocol and amendments](protocol.md): the original design, tolerances and reasons for revisions.
- [First candidate](mean-offset-results.json) and [parameters](mean-offset-parameters.json).
- [Fitted-uncertainty candidate](estimated-spread-results.json) and [parameters](estimated-spread-parameters.json).
- [Final comparison](results.json) and [parameters](parameters.json), including all blocks, slices, grid forecasts, intervals and monitoring.
- [Research model](newcomer_model.py): the isolated conditional prior implementation; production does not import it.
- [Structural tests](test_priors.py) and [replay verification](verification.json).

Seven structural tests cover bootstrap and legacy behaviour, conditional means
and covariance, common-shift invariance, simultaneous-entry ordering, transfers
and returns, prefix invariance, invalid offsets, and constant-ability turnover.
The isolated research implementation is also compared with every saved candidate
prediction. The reference replay reproduces production historical loss exactly.

The final fit can be reproduced from the existing frozen
`tmp/unified-form/input.json` export, whose SHA-256 is recorded in
`parameters.json`. The original fixed settings are retained in
`reference-settings.json`. Run from the repository root:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 research/newcomer-priors/fit.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 research/newcomer-priors/validate.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 research/newcomer-priors/check_replay.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 research/newcomer-priors/test_priors.py
```

The input is the existing unified-form evidence export; it can be regenerated
with `node research/unified-form/export.mjs` when needed. A regenerated envelope
may have a different source fingerprint; compare the evidence and dates rather
than assuming that a changed envelope hash means changed observations. Rejected
trials are retained as complete result and parameter records; `fit.py` reproduces
the final constrained trial, not an automatic search across all three.
