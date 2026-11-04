# Conditional full-field market-making research

This is a retrospective simulation, not evidence of deployable profitability.
The initial intention was to quote the previous-race field on Thursday before
first practice. In practice, historical data-quality gates leave some driver
markets unavailable and one entire race unavailable. The model and input-data
vintages, exchange ordering, full book coverage, true queue position, and
contract-specific historical fees are not independently established.

The results were regenerated after correcting an exact floating-point price
lookup that could place a simulated order ahead of displayed queue depth. The
selected strategy's reported profit and fill counts did not change, but the
matched-control midpoint comparison did: its training P&L changed from −$0.62
to −$0.76 and its maker fills from 26 to 22.

## Method

The strategy uses a single $3,000 cash balance across the race sequence,
pre-funding five YES/NO complete sets per eligible market and posting up to
five YES shares on each side, subject to inventory and available-cash limits.
The model uses previous-calendar-day driver, car, current-form, and teammate
signals, combined with the current observed book midpoint. The blend weight,
feature weights, quote edge, inventory skew, and improvement are selected by
two coordinate-ascent passes on the five training races only. At least 10
simulated maker fills over three training races are required for selection.
Every tested candidate is retained in [results.json](results.json). Blended
per-market quote anchors need not sum to one and are not calibrated winner
probabilities.

Quoting stops at 23:00 UTC. After modeled cancellations, the strategy attempts
to close positions on subsequent usable books before midnight, subject to
displayed depth, one cent of adverse liquidation slippage per share, and a
price-dependent taker-fee coefficient of 0.03 before July 10, 2026 and 0.05
afterward. Those fee coefficients and a zero maker fee are assumptions, not
contract-level verification. Immediate costless complete-set merging is
assumed. The replay records a result only if every position is closed; it does
not depend on race outcomes for P&L. Historical resolution is used for an
adapter integrity check only.

An observed same-price print advances the modeled visible queue. A worse-price
print is assumed to fill an active better-price quote, up to the print size;
this is a counterfactual execution assumption, not a recorded fill of our
order. A same-price-only sensitivity and a three-second submission and
cancellation latency sensitivity use the frozen selected parameters. The
primary assumes one-second latencies, a one-cent strategy quote grid,
60-second book freshness, and a 120-second maximum source-event age. Receipt
ties, source-time disorder, exchange sequencing, and potential market impact
remain uncertain. The 120-second limit was chosen after earlier inspection.

The historical capture is assembled from L2, exchange prints, and on-chain
maker records. Missing L2, no non-boundary book snapshot, unverified print
reconciliation, excessive source age, and on-chain maker transactions without
a same-day print exclude the affected market for every candidate. A same-day
block/print mismatch can also reflect midnight boundary timing. The
[fill-coverage audit](fill-coverage.json) records the mismatches. The
[PMData API documentation](https://pmdata.dev/docs/api-reference) says a
trades 404 on a recorded day means no recorded trades; these cases are checked
against on-chain records. Full-day data gates are retrospective complete-case
selection and cannot be used as an ex-ante rule. PMData's exact-midnight
[documented synthetic midnight snapshots](https://pmdata.dev/docs/historical-data-details/overview)
and suspicious end-of-day boundary books are excluded because the underlying
book age is unknown; PMData does not document the end-of-day rows as synthetic.
Each retained market begins at a later snapshot.

The seven-field signal search and all activity rules are selected solely on
Canada, Monaco, Barcelona, Austria, and Britain. The Netherlands is validation;
Italy and Singapore are the later pseudo-holdout. Related analyses had already
inspected these dates, so none is an untouched test. A risk-free rate of zero,
sample standard deviation, and one return per race are used for Sharpe. The
illustrative annualized value multiplies the per-race ratio by the square root
of 24 and assumes 24 independent comparable periods each year; this sample is
too small to establish that assumption or a reliable Sharpe. Drawdown is only
observed between closed races, not intrarace. Zero denominators yield `null`.

## Results

The requested Sharpe above 2 was **not achieved**. The training-only search
evaluated 16 distinct candidates; its selected settings were form weight 1,
teammate weight 1, head weight 0, one-tick edge, 0.1-tick-per-share inventory
skew, one-tick quote improvement, and zero midpoint blend. This is a local
coordinate search, not an exhaustive search or proof that no profitable
strategy exists.

| Window | Eligible markets | Maker fills | Forced closing fills | Maker-to-maker matched shares | Net P&L | Per-race Sharpe |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Five training races | 12, 18, 1, 10, 9 of 22 respectively | 25 | 16 | 10 | −$1.98 | −0.82 |
| Dutch validation | 15 of 22 | 3 | 3 | 0 | −$0.29 | Undefined: one race |
| Italian pseudo-holdout | 0 of 22 | — | — | — | Unavailable | Unavailable |
| Singapore diagnostic, separate $3,000 reset | 18 of 22 | 7 | 6 | 0 | −$0.70 | Undefined: one race |

The Italian data gate rejects all 21 identified driver markets because at
least one source event exceeds the 120-second age limit; the remaining
previous-roster driver has no matched contract. The earlier training windows
also do not contain the entire field. Consequently there is no complete
eight-race, all-driver backtest and no two-race pseudo-holdout statistic. A
conditional sequence that skips Italy ends at −$2.98 with 35 maker fills and
25 closing fills; it is not the requested complete series. Its maximum net
cash committed, including reserves, is about $91.80, while the account balance
starts at $3,000. This does not measure intrarace mark-to-market loss.

Maker-to-maker matched shares are the sum, per market and race, of the smaller
of maker buy and maker sell quantities. This measures two-sided volume, not a
count of distinct completed trades. The 25 training maker fills include 18
trade-through inferences. With those inferences disabled, the frozen strategy
has 13 training maker fills, zero maker-matched shares, and a −$1.25 training
result. With both latencies set to three seconds, training P&L is −$1.93.
In the primary training result, cash before fees and assumed exit slippage is
−$0.72; assumed fees are $0.32 and slippage is $0.95. The gross figure also
includes price movement and is not a pure captured spread.

For a comparison holding the selected quote controls fixed, a strategy using
the live book midpoint alone has 22 training maker fills, 10 closing fills,
16.56 maker-matched shares, and −$0.76 net P&L; its Dutch validation result is
−$0.11. The selected forecast therefore does not show an advantage over this
market-only comparison here. Its training Sharpe is −1.12 per race; the sample
is too small to interpret a difference in ratios. A zero-trade baseline earns
$0 and has undefined Sharpe. A separate midpoint-only seed with more aggressive
controls could not fully close in the Dutch window, so its continuous result
is unavailable.

The frozen 10-share sizing sensitivity loses $5.69 across the seven available
races and peaks at about $184 net cash committed. At 25 and 50 shares, the
Singapore position cannot fully exit by the cutoff; aggregate P&L is therefore
undefined, with observed peak commitments around $459 and $920 respectively.
These are conditional capacity checks, not estimates of scalable returns.

## Reproduction

From the repository root, after populating the manifest's local PMData Parquet
paths, installing pandas and PyArrow, and using a new output directory:

```sh
python3 research/prediction-markets/pmdata/all-drivers/prepare_captures.py \
  --manifest research/prediction-markets/pmdata/all-drivers/manifest.json \
  --output tmp/pmdata-all-reproduction
PMDATA_ALL_NORMALIZED_DIRECTORY=tmp/pmdata-all-reproduction \
  node research/prediction-markets/pmdata/all-drivers/run_study.mjs \
  --conditional-research > /private/tmp/pmdata-all-reproduction-results.json
node tests/test-pmdata-all-driver-optimization.mjs
node tests/test-portfolio-competitive-quotes.mjs
python3 research/prediction-markets/pmdata/all-drivers/test_prepare_captures.py
```

The archive and credentials are not in the repository. The normalized output
contains sizeable derived data. `results-initial.json` is a preserved,
superseded diagnostic from before a self-cross correction; do not use it to
evaluate the strategy.
