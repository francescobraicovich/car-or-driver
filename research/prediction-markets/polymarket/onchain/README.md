# British GP on-chain fills

This is an independent observation of the 24 British Grand Prix driver-matchup
markets, using the public [Polymarket CLOB V2 OrderFilled dataset](https://huggingface.co/datasets/wzsg/polymarket-orderfilled-v2)
at revision `f8782fc0c18a4e32b7bdc348ada114e5007a4367`. The publisher says
it covers both the standard and negative-risk V2 exchange contracts. The
publisher does not specify a dataset licence; no general redistribution or
commercial-use permission is assumed. This folder records a small set of
factual identifiers and observed event fields, not the underlying dataset.
The 24 outcome-token mappings are identifying facts derived from the research
[od2961 market metadata archive](https://huggingface.co/datasets/od2961/polymarket-full-market-dataset),
which likewise does not specify an open licence.

## Findings

The scan covers on-chain block timestamps from 1 July 2026 00:00 UTC up to,
but excluding, first practice at 3 July 2026 11:30 UTC. In these source files it
found eight `OrderFilled` event rows across four distinct transactions: four
maker rows and four associated taker-summary rows. Treating all eight as trades
would double-count them. All four maker rows have `side = 0`, which the
publisher defines as a maker buy of the named token. Amounts have six decimal
places. The recorded maker-side matches were:

| Block timestamp UTC | Matchup | Maker token | Shares | Price per share |
| --- | --- | --- | ---: | ---: |
| 1 July 09:09:08 | Norris–Verstappen | Norris | 10 | $0.50 |
| 1 July 09:09:46 | Verstappen–Piastri | Piastri | 21.42857 | $0.30 |
| 2 July 14:45:35 | Norris–Piastri | Norris | 2 | $0.50 |
| 2 July 15:16:08 | Norris–Hamilton | Norris | 1.42857 | $0.30 |

The event JSON retains the transaction and log identifiers, token IDs and raw
amounts. Prices above are the collateral amount paid divided by shares
received. The raw taker-summary rows are retained for auditing but flagged as
`takerIsExchange` and excluded from the table.

This is evidence of recorded trading, not a maker-fill or profit backtest. The
timestamp is the Polygon block timestamp, not the instant the exchange matched
the order; recording and settlement delays are unknown. The on-chain archive
does not contain resting orders, queue position or cancellations. It is therefore
not valid to merge these records with historical books and assume a specific
counterfactual fill or quote was present at the matching instant. Absence from
this extract only describes the data and contracts searched, not all possible
sources of execution. The results are not a profitability estimate.

## Reproduce

The scan reads the 17 original `data_*.parquet` files for July by HTTP byte
range and prunes row groups by their timestamp statistics. The remaining
block-bounded incremental files begin with block 90402715; the first such file
has a minimum recorded timestamp of 17 July, after the study window. This relies
on the dataset's partitioning and block-order assumptions and does not
independently revalidate each chain block's timestamp. File sizes and
publisher-reported content hashes for the original 17 files are in
`shards.json`. The first three complete downloaded files were independently
SHA-256 checked against those hashes; range reads do not verify whole-file
hashes for the remaining files.

```sh
python3 -m venv /tmp/prediction-market-onchain
/tmp/prediction-market-onchain/bin/pip install 'pyarrow==26.0.0' 'fsspec==2026.2.0' 'aiohttp==3.14.5'
/tmp/prediction-market-onchain/bin/python research/prediction-markets/polymarket/onchain/scan_onchain.py \
  --output /tmp/british-2026-onchain-events.json
python3 -m unittest discover -s research/prediction-markets/polymarket/onchain -p 'test_*.py' -v
```

Compare the generated JSON with `british-2026-onchain-events.json`. This can
transfer substantial data and depends on access to Hugging Face and the pinned
archive. Recheck the actual contract rules and verify on-chain settlement before
using outcomes for any analysis.

## Austrian, Belgian and Hungarian race windows

A second, independent [market metadata archive](https://huggingface.co/datasets/benjessel/polymarket_trades)
at revision `3e38abb2847b904d418df9203ea921e6c886e638` identifies 24
matchups for each of these races. Its licence is unspecified. The JSON here
retains only the factual condition IDs, outcome names and token IDs.

The same on-chain archive was scanned for a comparable window for each race:
from Wednesday 00:00 UTC through strictly before first practice on Friday.
The FP1 cutoffs use official F1 schedules, converted from local time: [Austria,
26 June 11:30 UTC](https://www.formula1.com/en/latest/article/what-time-is-the-formula-1-2026-austrian-grand-prix-and-how-can-i-watch-it.5ZNb2LlQ4SwZ8JUrNVPL1H.5ZNb2LlQ4SwZ8JUrNVPL1H),
[Belgium, 17 July 11:30 UTC](https://www.formula1.com/en/latest/article/formula-1-moet-and-chandon-belgian-grand-prix-2026.6TSnaKuwMr6OvrtF0gZbXF.6TSnaKuwMr6OvrtF0gZbXF.6TSnaKuwMr6OvrtF0gZbXF.6TSnaKuwMr6OvrtF0gZbXF.6TSnaKuwMr6OvrtF0gZbXF),
and [Hungary, 24 July 11:30 UTC](https://www.formula1.com/en/latest/article/formula-1-aws-hungarian-grand-prix-2026.6rqroq0TO24FJxxSOxwXVq).

| Race | Raw event rows | Non-summary maker-event rows | Transactions | Matchups with events |
| --- | ---: | ---: | ---: | ---: |
| Austria | 2 | 1 | 1 | 1 of 24 |
| Belgium | 42 | 21 | 21 | 11 of 24 |
| Hungary | 21 | 11 | 10 | 8 of 24 |

The maker-event counts exclude rows where the event's `taker` is an exchange
contract, which are matching summaries. One Hungarian transaction contains two
non-summary maker-event rows, so maker events must not be equated to distinct
transactions. Contract-specific interpretation and multi-maker matching can
still require further analysis. The archived dataset and timing limitations
above apply to all three races; the window intentionally excludes activity
before Wednesday and after FP1, and the scan says nothing about omitted
contracts or inaccurate timestamps in the source archive.

`additional-onchain-events.json` contains the factual event fields and source
shards. `additional-shards.json` records every scanned June and July source path
and publisher-reported SHA-256. No whole-file hashes were independently checked
for this additional range-based scan. To reproduce with the same environment
and pinned exchange-data revision as above:

```sh
/tmp/prediction-market-onchain/bin/python research/prediction-markets/polymarket/onchain/scan_additional_races.py \
  --output /tmp/additional-races-onchain-events.json
```

Compare the generated file with `additional-onchain-events.json`. The scanner
requests Parquet metadata for all 81 June and July shards and the token and
other necessary columns only for row groups whose timestamp statistics overlap
one of the windows. It fails if timestamp statistics are missing; correct
pruning still depends on those source statistics being accurate. The publisher
states the archive covers both standard and negative-risk V2 contracts. This
study does not independently prove its completeness or event timestamps.

## Observed maker-side collateral amounts

The recorded non-summary maker-event rows have the following aggregate
collateral amounts across the 24 selected matchups per race. These are amounts
paid or received **from each maker order's perspective**, not a profitability
estimate, executable capacity, or independently verified total market volume.

| Race | Maker-event rows | Transactions | Maker-side collateral amount |
| --- | ---: | ---: | ---: |
| Austria | 1 | 1 | 0.587301 pUSD |
| Britain | 4 | 4 | 12.857142 pUSD |
| Belgium | 21 | 21 | 189.960338 pUSD |
| Hungary | 11 | 10 | 194.362146 pUSD |

For a maker BUY (`side = 0`), the maker pays collateral, so the amount is
`makerAmountFilled`; for a maker SELL (`side = 1`), the maker receives
collateral, so it is `takerAmountFilled`. The dataset describes pUSD and
outcome-token amounts as normally having six decimal places; the table applies
that conversion to these events. Exchange taker-summary rows are excluded.
Multiple maker events in one matching transaction are retained individually,
including the two rows in one Hungarian transaction, so the aggregation is a
sum of maker-side event amounts rather than a count or valuation of trades.
See the [source schema and side semantics](https://huggingface.co/datasets/wzsg/polymarket-orderfilled-v2).

These amounts cover only the four Wednesday 00:00 UTC to FP1 windows and the
24 identified matchups per event. They inherit the publisher's contract and
coverage claims, block-inclusion timestamp limitations and unverified
completeness described above. Earlier trading and omitted contracts are not
represented. Reproduce the integer micro-unit totals with:

```sh
python3 research/prediction-markets/polymarket/onchain/summarize_onchain.py
```
