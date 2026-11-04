# Frozen-strategy wider-window feasibility check

**Stale results:** This sensitivity was generated before the replay's
floating-point queue-depth correction. Its reported numbers have not been
regenerated and are not verified reproducible with the corrected engine; a
rerun is required before relying on them.

This is an additional **post-observation sensitivity**, not an independent
validation or a change to the primary search. After inspecting the original
14:00–16:00 results, we replayed the already-selected Sharpe strategy from
Thursday 00:00 to 16:00 UTC for the same Italy and Singapore pseudo-holdout
races. The strategy weights, four drivers, shared cash, one-second submission
and cancellation latencies, and 120-second source-age guard were not retuned.
Forecast scores were separately rebuilt at each day's 00:00 decision using
earlier calendar dates; their model/data vintages remain retrospective.

For each market, exact-midnight `book` rows were conservatively excluded as
potentially synthetic, as [PMData describes generated boundary snapshots](https://pmdata.dev/docs/historical-data-details/overview).
No earlier state is backfilled. First later book timestamps for Singapore were:
Norris **00:23:44.375**, Hamilton **01:02:06.849**, Piastri **03:29:37.890**
and Leclerc **05:50:55.015 UTC**. The earlier portions of those markets are not
simulated. Both races use the same hypothetical $107.05 starting equity left
after training; they are evaluated independently, not as a continuous series.

| Race | Result |
| --- | --- |
| Italy | Rejected: a source timestamp exceeded the existing 120-second guard. |
| Singapore | One hypothetical partial sell of **1 Norris YES share at $0.13**; +$0.13 held to settlement, when Verstappen won. |

If Norris had won instead, the hypothetical Singapore sale would have lost
$0.87 at settlement. The strategy submitted a five-share order; the one-share
quantity is a modeled partial fill. Its separate forced 16:00 liquidation did
**not** complete under the recorded depth/freshness rules, so its liquidation
profit is null, not zero. Maker fee and rebate are zero; the liquidation
scenario uses the assumed 0.05 sports taker coefficient and one-cent adverse
slippage, without gas or builder fees. No executable exit or real fill is
claimed. The full two-race holdout cannot be evaluated because Italy rejected.

An independent audit of the same-provider trade and on-chain files found no
unexplained in-window transaction hashes across the eight markets, but block
inclusion times differ from matching times and a hash comparison cannot prove
complete books or maker-queue reconstruction. The Italian Leclerc file also
has two snapshot disagreements without observed trades and two receive-order
reversals in this wider window. Singapore's replay has no recorded crossed-book
interval or source-time reversal, but its book coverage and execution remain
unverified. One **different** Singapore print required the existing
rounded-VWAP assumption after exact on-chain quantity, side and value checks;
the trade's detailed legs rather than that aggregate price are replayed.

The wider window was selected after prior results were inspected, and its
single partial fill cannot establish performance or provide meaningful
out-of-sample Sharpe, Sortino or teammate-coupling evidence. The strategy
still assumes immediate fill notification, excludes trade-through fills and
market impact, and does not know its real queue position. See the
[primary search](README.md) for costs, inactive markets and other limitations.

## Reproduction

With pandas, PyArrow and Node.js installed and the existing PMData market-day
files in ignored `tmp/pmdata/`, run:

```sh
python3 research/prediction-markets/pmdata/optimization/run_wider_holdout.py
```

The command accesses neither the network nor API key and regenerates
[wider-holdout-results.json](wider-holdout-results.json). It uses the frozen
parameters and starting capital from [results.json](results.json). Both the
raw files and their download manifests remain in ignored `tmp/pmdata/`.
