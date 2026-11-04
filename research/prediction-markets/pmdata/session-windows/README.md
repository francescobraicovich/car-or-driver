# Qualifying and pre-race market-making replay

This is an exploratory historical simulation, not a verified or deployable
trading result. It tests two 2026 races, Monaco and Singapore, using a shared
$3,000 balance. Only Singapore produces fills for the full-form strategy, so
neither its P&L nor a Sharpe ratio is a reliable measure of profitability.
The full set of driver markets is not covered after the data checks.

## Forecasts and session timing

The pre-qualifying forecast uses prior completed races and the previous race's
roster. It does not use current-weekend practice or sprint results. The later
forecast uses qualifying times and qualifying position as a proxy for the
grid, not the later race-result grid. The project's pairwise pace/finishing
forecasts are projected into full-field winner scores. These scores are not
calibrated winner probabilities and do not allocate probability to Other,
missing entrants, cancellation or unverified roster changes. Model and data
vintages, and exact historical availability and later revisions of qualifying
times, are not certified.

Orders stop before qualifying and remain canceled during it. The [extended
replay](results-extended.json) resumes three hours after scheduled qualifying
starts, pauses across the midnight file boundary, and resumes again three hours
before race start. It stops quoting 30 minutes before the race, then attempts
its final decisions by one minute before the start. Formula 1's qualifying
reports were published at [15:25 UTC for Monaco](https://www.formula1.com/en/latest/article/antonelli-seizes-brilliant-pole-in-thrilling-monaco-qualifying-ahead-of-verstappen-and-hamilton.7lWc3kpARKr1Qnle1f8X3P)
and [14:46 UTC for Singapore](https://www.formula1.com/en/latest/article/verstappen-beats-leclerc-to-pole-position-for-the-singapore-gp.7yum1V3S9aSTyj3Zzzs0Y9.7yum1V3S9aSTyj3Zzzs0Y9),
before the assumed restarts at 17:00 and 16:00 UTC respectively. Those articles
do not establish the original availability of every lap time or rule out later
revisions. This extended session was added after inspecting the first run, so
its results are an exploratory sensitivity, not untouched validation. The
earlier [Sunday-restart-only run](results.json) is retained separately.

## Execution and holding policy

Each eligible driver starts with five funded YES/NO sets; maker order size is
five shares, with one-second submission and cancellation latency, a one-cent
strategy quote grid, one-cent adverse closing slippage, zero assumed maker
fee, and price-dependent taker-fee coefficients of 0.03 before July 10 and
0.05 afterward. Contract-specific historical fees, gas, queue priority,
exchange ordering and market impact are not verified. Complete-set merging
and settlement costs are omitted. At qualifying and midnight, live quotes are
canceled before the data blackout and a later full book snapshot is required
before quoting resumes. Feed coverage is not certified.

The base model-quoted variant uses current-form forecast scores, a one-tick
minimum edge, one-tick competitive improvement and inventory skew of 0.1
ticks per share. At wind-down, for an incrementally long YES position it holds
when the post-qualifying model score exceeds weighted average purchase price
by more than 0.02; for a short YES position the sign is reversed. Otherwise
it tries to close against recorded depth with fees and slippage. Any remainder
that cannot be closed is explicitly labeled **forced carry** and settles at
the race outcome. No missing close is invented. The entry-price threshold is
a simple risk policy, not an assessment of the current market opportunity;
entry price is a sunk cost. The policy and the 0.02 margin were introduced
after the original strict-close replay could not fully unwind positions.

Maker fills at an observed worse price rely on a price-priority trade-through
assumption and are counterfactual, not actual account fills. The same-price-only
variant disables that inference; it follows a different inventory path and is
not a guaranteed lower bound on P&L. If forced carry is disabled, unclosed
positions make P&L unavailable. Both deliberate and forced holds create
race-outcome exposure. The replay also reports individual winner, Other and
uniform-half void payout scenarios; these are conditional on the simulated
fills and do not guarantee real-world outcomes.

## Data coverage

| Race | Eligible drivers, any phase | Pre-qualifying | Post-qualifying Saturday | Race day |
| --- | ---: | ---: | ---: | ---: |
| Monaco | 13 of 22 | 6 | 10 | 8 |
| Singapore | 14 of 22 | 12 | 12 | 8 |

These columns overlap. Inclusion uses subsequent file availability, trade
reconciliation and a matching post-qualifying roster retrospectively; it is
not an ex-ante driver-selection rule. A market with only qualifying-post data
can be included even without a Sunday book, but it cannot quote on Sunday.
There is no complete all-driver replay. See [data provenance](data-provenance.md)
and [window coverage](window-coverage.json). The historical download used 190
new successful PMData requests; the free allowance limited qualifying-day
coverage. Missing chain-to-print matches and unavailable full snapshots remove
markets; other gaps or unknown priority can remain.

Monaco contains source timestamps up to 4 ms ahead of local receipt. As an
explicit 5 ms clock-skew sensitivity, effective receipt is delayed to the
source timestamp and events are re-sorted; larger leads are rejected. Markets
with an in-window recorded trade lag over one second are also excluded, but
smaller delays could still overlap a cancellation. Independent
[qualifying](qualifying-blackout-audit.json) and
[midnight](midnight-blackout-audit.json) boundary audits found no recorded
prints matching their documented late-receipt criteria. Neither audit proves
feed completeness or actual order acknowledgment time.

## Results

| Fixed variant | Maker fills | After-qualifying maker fills | Closing fills | Forced carries | Net settlement P&L |
| --- | ---: | ---: | ---: | ---: | ---: |
| Form model for quotes and holding | 9 | 0 | 1 | 2 | −$2.53 |
| Same model with named form features removed | 8 | 3 | 1 | 1 | −$2.23 |
| 50% current midpoint / 50% form model for quotes; form model for holding | 9 | 2 | 1 | 2 | −$2.28 |
| Current midpoint for quotes; form model for holding | 8 | 1 | 2 | 2 | −$0.05 |

Monaco has no fills for these variants; every reported fill and P&L above is
from Singapore. Eight of nine maker fills in both the full-form model and the
50/50 quote blend use the trade-through assumption. Disabling it changes the
full-form result to six maker fills and −$1.75, and the 50/50 result to six
maker fills and −$1.70. The midpoint-quoted strategy is **not model-free**:
it still uses the form forecast for the holding decision. Its same-price-only
result is five maker fills and −$0.08. A three-second submission and cancellation
latency sensitivity leaves the full-form result at −$2.53. A 0.05 holding
margin yields −$1.48; it is a post-observation sensitivity, not a validated
improvement.

For the full-form run the maximum simulated net cash committed, including
buy-order reserves, is about $73.10 of the $3,000 account. In Singapore, it
deliberately holds ten Charles Leclerc YES shares and is forced to carry ten
Isack Hadjar and ten Oscar Piastri YES shares after unsuccessful modeled exits.
Had any of those three won, the simulated profit would have been $7.47; with
the actual winner, or another winner outside those positions, it is −$2.53.
These are conditional outcomes for the assumed fills, not guarantees. No
intrarace mark-to-market drawdown is estimated.

The full-form forecast made all nine maker fills before qualifying; the
updated qualifying information affected its holding decisions but produced no
later maker fill under the primary fill model. The blended version produced two
post-qualifying maker fills. No variant establishes the requested Sharpe >2:
two races, only one with fills, and assumptions selected after inspecting
results cannot support a meaningful Sharpe estimate.

## Does form improve the model?

In a separate fixed comparison over 87 retrospective races from 2023–26,
adding the forecast head's named recent-form features reduces mean multiclass
Brier score from 0.788 to 0.720 before qualifying and from 0.623 to 0.592
afterward. Both variants retain prior driver/car ratings, which themselves
include recent results. One winner was missing from the assumed prior roster,
so unconditional log loss is infinite. Conditional on the winner being in the
roster, form improves mean log loss from 1.886 to 1.623 before qualifying and
1.349 to 1.255 afterward. One additional race was excluded for duplicate
qualifying positions. Much of the gain is concentrated in 2023, and the
retrospective model/data vintages are unverified. Better forecast scores are
not evidence that its probabilities outperform executable market prices.
See the [forecast study](../../weekend/README.md) and
[accuracy summary](../../weekend/accuracy-summary.json).

## Reproduction

With the local PMData Parquet files in the manifest and pandas and PyArrow
installed, use a **new** output directory; no API key or network is needed:

```sh
python3 research/prediction-markets/pmdata/session-windows/prepare_extended_captures.py \
  --manifest research/prediction-markets/pmdata/session-windows/manifest.json \
  --output tmp/pmdata-session-reproduction
PMDATA_SESSION_NORMALIZED_DIRECTORY=tmp/pmdata-session-reproduction \
  node research/prediction-markets/pmdata/session-windows/run_study.mjs \
  --conditional-research --after-qualifying > /private/tmp/weekend-reproduction.json
node tests/test-portfolio-weekend.mjs
node tests/test-weekend-signals.mjs
python3 -m unittest discover -s research/prediction-markets/pmdata/session-windows -p 'test_*.py'
```
