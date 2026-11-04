# Exploratory full-Thursday portfolio sensitivity

**Stale results:** This study was generated before the replay's floating-point
queue-depth correction. Its reported numbers have not been regenerated and
are not verified reproducible with the corrected engine; a rerun is required
before relying on them.

This is a **post-selected retrospective sensitivity**, not a validated backtest
or evidence of profitability. After reviewing the prior two-hour results, we
expanded the window to Thursday 00:00–16:00 UTC. The races, window and strategy
have been inspected and are not an untouched evaluation set. Forecasts were
rebuilt separately at each Thursday's 00:00 cutoff from earlier calendar dates,
but the current model architecture, inputs, code and lineup vintage were not
established as available then. The seven frozen forecasts used here are saved
beside this report. Their driver scores match the earlier same-day 14:00 runs
because both builds exclude the entire decision date.

The fixed strategy, capital, fees and modeled one-second order submission and
cancellation delays are the same as the [two-hour study](../portfolio-study.md):
shared $100 cash; separately funded five-share YES/NO complete sets for Norris
and Hamilton; five-share orders; inventory limit 10; assumed one-cent tick and
five-share minimum; one-tick minimum model edge; no negative-risk conversion;
and zero maker fees and rebates. Conditional settlement occurs against one
winner, with immediate redemption at the latest Gamma `closedTime` assumed and
gas/operational costs omitted. Returned capital can only be reused after that
assumed settlement.

The normalizer rejects Hungary's recorded Norris tick-size change to 0.001 at
08:57:08 UTC rather than replaying a fixed tick through it. The 60s
case also excludes the Netherlands, Italy and Singapore because an event's
source timestamp is more than 60 seconds old on receipt. A separate 240s case
was selected **after seeing those source ages** and excludes Hungary only.
Source age is not necessarily network delay; a snapshot timestamp may describe
older book state. Neither threshold establishes feed completeness.

| Race | First Norris book UTC | First Hamilton book UTC | 60s case | 240s case |
| --- | --- | --- | --- | --- |
| Austria | 00:12:13.134 | 01:26:37.819 | +$1.00, one fill | +$1.00, one fill |
| Britain | 00:35:55.624 | 00:35:55.657 | +$0.80, one fill | +$0.80, one fill |
| Belgium | 04:48:45.850 | 06:03:47.244 | $0, no fill | $0, no fill |
| Hungary | 06:38:22.682 | 00:34:15.835 | Rejected: tick change | Rejected: tick change |
| Netherlands | 01:11:19.574 | 00:47:19.593 | Rejected: source age | $0, no fill |
| Italy | 02:30:45.290 | 02:30:44.835 | Rejected: source age | $0, no fill |
| Singapore | 00:23:44.375 | 01:02:06.849 | Rejected: source age | +$0.13, one partial fill |

The first-book times above are recorded receipt times, truncated to
milliseconds for display. They do not prove continuous prior or later coverage.
Hungary's times are recorded for context only; the whole race is rejected.
The 60s case carries $100 to **$101.80 across three of seven races**. The 240s
case carries $100 to **$101.93 across six of seven races**. Missing races are
not zero-return observations. Both outputs are hypothetical, and the 240s
threshold was chosen after inspecting the data. The Austria and Britain fills
sell Hamilton YES and the Singapore fill sells Norris YES; the strategy never
held incremental winner-risk positions in both drivers in the same race.
Consequently this experiment does not test how
the strategy handles interacting Norris and Hamilton risk.

The hypothetical settlement profits reflect selling Hamilton YES at Austria
and Britain and Norris YES at Singapore, when Russell, Leclerc and Verstappen
respectively won. The three sales were five shares at $0.20, five at $0.16 and
one at $0.13. If the corresponding driver had won, those isolated sales would
instead have lost $4.00, $4.20 and $0.87 respectively under the same fully
funded settlement accounting. Prices and quantities are not observed account
fills.

Separately, each race starts with its own $100 for a forced 16:00 liquidation.
The Austrian sale is bought back at $0.23, including one cent of assumed
adverse slippage, with a $0.026565 assumed taker fee: **−$0.176565**. Britain
is bought back at $0.17 with $0.021165 fee: **−$0.071165**. Belgium,
Netherlands and Italy simulate no fills in their accepted scenarios. The
Singapore position **cannot be completely liquidated** under the recorded
book freshness/depth rules; its liquidation profit is null, not zero. The
liquidation results are independent race sensitivities, not a compounded
series. The fee formula uses the historical category coefficients 0.03 before
10 July and 0.05 after, not verified contract-specific fees.

Some PMData daily books can be reconstructed boundary snapshots. We
conservatively exclude `book` rows with both source and receive timestamps
exactly at 00:00, treating them as potentially synthetic; this timestamp
heuristic does not prove their origin. The Netherlands, Italy and Singapore each
have two such excluded books. No prior book is carried across the boundary, so
the strategy starts only at each first later recorded book. Earlier activity is
excluded and cannot be interpreted as no trading.

The historical archive does not establish complete exchange coverage,
per-venue sequencing or actual queue positions. Receipt-time ties are processed
in stable file order as an assumption; for Italy two source-time reversals were
also observed. Conditional-mode crossed-book intervals occurred in Belgium,
the Netherlands and Italy. The simulation has no trade-through fills or market
impact, learns simulated fills immediately at public-print receipt, and does
not model real order-acknowledgement latency. Its fills and resulting profits
may therefore be too high or too low. In particular, the 240s sensitivity
applies source-stale events in receipt order and treats each as refreshing the
local book age; a snapshot with a source time up to 233 seconds old can overwrite
newer source-time state and affect later quotes. This makes that post-hoc
sensitivity especially unreliable. Strict coverage mode rejects all races.
The [independent data audit](../window-audit.md) covers the narrower 14:00–16:00
windows; it does not certify this longer window.

## Reproduction

With pandas and PyArrow installed, Node.js available, and the same 42 PMData
Parquet source files in ignored `tmp/pmdata/`, run from the repository root:

```sh
python3 research/prediction-markets/pmdata/full-window/run_study.py --run-retrospective-sensitivity
```

The command makes no network calls, does not read the API key, reconstructs
temporary normalized captures, and writes [results-60s.json](results-60s.json)
and [results-240s.json](results-240s.json). The JSON contains source hashes,
rejections, start times, fills, cross-book diagnostics and fee assumptions.
The raw PMData files remain in ignored `tmp/`; download provenance is described
in the [PMData README](../README.md).
