# Polymarket pre-practice sample

`british-2026-hamilton-verstappen.json` is a small extract of the PMXT v2
order-book recording for the British Grand Prix Hamilton–Verstappen matchup.
Hamilton is the selected outcome token; the other outcome is Verstappen. The
original recorder's data is licensed **CC BY 4.0**: credit PMXT,
<https://archive.pmxt.dev/Polymarket/v2>. Schema and known coverage limitations:
<https://archive.pendulumflow.com/formats/v2>.

The condition ID and outcome-token mapping were identified from the publicly
available [od2961 Polymarket market metadata archive](https://huggingface.co/datasets/od2961/polymarket-full-market-dataset),
snapshot `2026_07_12_235011`. Its dataset card describes the source as
Polymarket data provided for research; it does not specify a separate open
license. Only identifying facts are included here, not its metadata rows.
The [market](https://polymarket.com/event/f1-british-grand-prix-h2h-2026-07-05/f1-british-grand-prix-h2h-verstappen-vs-hamilton-2026-07-05)
has a creation timestamp of 6 June 2026 11:30:37.969990 UTC in that metadata
snapshot. It also records a `market_start_time` of 11:33:40.471040 UTC and an
`accepting_orders_timestamp` of 11:32:52 UTC. These fields do not independently
establish when orders were actually accepted. The official [F1 timetable](https://www.formula1.com/en/latest/article/formula-1-pirelli-british-grand-prix-2026.6doq6E52hg1t1YuKl8xtFR)
places first practice at 12:30 local time on 3 July, or 11:30 UTC.

The extract starts with the first available Hamilton book at **09:18:01.192 UTC**
on 3 July 2026 and ends before the chosen 11:29 UTC exit, itself before FP1.
It contains 4 book snapshots, 74 level updates and **no observed trades**.
These are observation counts, not evidence that no other trades occurred. The
archive provides no assurance of uninterrupted coverage for this market, so
`coverage.complete` is deliberately false and the sample is not a validated
market-making backtest.

Reconstructing the book from updates between successive snapshots reveals
discrepancies: at 09:54:02.818 UTC the 0.01 bid was 6.95 in the reconstructed
book and 206.95 in the snapshot; at 10:19:40.580 UTC the reconstructed 0.14
bid was 50 while the snapshot did not contain that level. The 11:25 snapshot
matched the preceding reconstruction. Delayed records, event ordering, capture
gaps, or other source behavior could explain differences; no particular cause
is established. Receive time is used as `timestamp`, and `sourceTimestamp`
preserves the exchange timestamp separately. A long difference between these
timestamps does not by itself prove a snapshot is stale; the archive documents
that source timestamps on quiet books may be old. Same-millisecond ordering is
not guaranteed to represent exchange sequence.

## Reproduce the extract

Install DuckDB in a Python environment, then download these public PMXT files.
They total roughly 1.5 GB and are not included in this repository. Verify their
SHA-256 hashes because the extract depends on the exact inputs:

| UTC hour on 2026-07-03 | SHA-256 |
| --- | --- |
| 09 | `1c4b79f3fe439bfd412c55c6c9d1fa4374938a783afda67bb2229a62a80cade7` |
| 10 | `d8e9098c84c617c033f0dfe013337353de841afa2b22d175bf4e9ca4443a01a8` |
| 11 | `3504bc9f1ec2ac74544f2d9a1702c974692e4d9c98a17c5dba44c973cdceabc2` |

From the repository root, with the files downloaded into the current directory:

```sh
python3 -m pip install duckdb
curl -fL -o pmxt-2026-07-03T09.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-03T09.parquet
curl -fL -o pmxt-2026-07-03T10.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-03T10.parquet
curl -fL -o pmxt-2026-07-03T11.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-03T11.parquet
python3 research/prediction-markets/polymarket/extract_pmxt.py \
  --condition-id 0xea277b3a112a9f8a9899216ed88fa1d78133df5bf22fb41f8c3db9fa1445abd3 \
  --asset-id 90601360808796642544950960866363215614863149057764026015316010742856784968913 \
  --driver-a Hamilton --driver-b Verstappen \
  --first-practice 1783078200000 --exit-time 1783078140000 \
  --output /tmp/british-2026-hamilton-verstappen.json \
  pmxt-2026-07-03T09.parquet pmxt-2026-07-03T10.parquet pmxt-2026-07-03T11.parquet
```

The extractor intentionally does not assert market coverage from the existence
of hourly files. Trades, queue position and fills cannot be inferred from level
changes alone. Tick-size changes require separate handling and stop extraction.

## Scan of the other British matchups

The factual condition identifiers in `british-2026-condition-identifiers.json`
cover all 24 head-to-head markets in the same event. Scanning the same three
PMXT files for those conditions and receipt times before 11:30 UTC found data
for all 24: 155 `book` events, 5,265 `price_change` events and **zero
`last_trade_price` events** across both outcome tokens. These are observations
in these hours only; missing trade prints do not prove no transactions occurred.
The per-condition counts and file hashes are in
`british-2026-observation-counts.json`. With the same files in the working
directory, reproduce the scan using:

```sh
python3 research/prediction-markets/polymarket/scan_pmxt.py \
  --conditions research/prediction-markets/polymarket/british-2026-condition-identifiers.json \
  --before 1783078200000 --output /tmp/british-observation-counts.json \
  pmxt-2026-07-03T09.parquet pmxt-2026-07-03T10.parquet pmxt-2026-07-03T11.parquet
```

An independent source, [PMData](https://pmdata.dev/docs/schemas/markets-catalog),
provides a free public market catalog. Its index lists all 24 British matchups
with recording-date ranges covering 3 July. Individual L2 and trade files
require a free-trial account and API key; a keyless request for the
Hamilton–Verstappen book returned HTTP 401. Catalog date ranges do not establish
that the required individual events or a gap-free book are available. We have
not verified this alternative's actual observations or its suitability for a
backtest.

## Additional pre-practice hours

Two further nonadjacent PMXT hours on 2 July were scanned using the same 24
conditions. The 18:00 UTC file contains 44 book snapshots and 2,096 level
changes; the 20:00 UTC file contains 32 snapshots and 1,954 changes. Both
contain data for all 24 matchups and zero reported `last_trade_price` events
for those conditions. The July 3 10:00 file contains 82,867 such events across
all markets, showing the archive does record this event type in general. These
counts describe the recorder and do not prove whether the exchange had trades.

The exact results and input hashes are retained in
`british-2026-july-02-18-observation-counts.json` and
`british-2026-july-02-20-observation-counts.json`. The following commands
download and rescan the original files using the existing DuckDB script:

```sh
curl -fL -o pmxt-2026-07-02T18.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-02T18.parquet
curl -fL -o pmxt-2026-07-02T20.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-02T20.parquet
python3 research/prediction-markets/polymarket/scan_pmxt.py \
  --conditions research/prediction-markets/polymarket/british-2026-condition-identifiers.json \
  --before 1783078200000 --output /tmp/british-july-02-18-counts.json pmxt-2026-07-02T18.parquet
python3 research/prediction-markets/polymarket/scan_pmxt.py \
  --conditions research/prediction-markets/polymarket/british-2026-condition-identifiers.json \
  --before 1783078200000 --output /tmp/british-july-02-20-counts.json pmxt-2026-07-02T20.parquet
```

The source SHA-256 hashes are `0870e4cb88821b12569b5e148c61a87fa77be434ea42f79291097b2bed72864a`
for 18:00 and `676a1f458da14682e485bbdf23450c9aa327993ea4927b6ee931505108019204`
for 20:00. Reproduce the global event-type comparison with DuckDB:

```sql
SELECT event_type, count(*) FROM read_parquet('pmxt-2026-07-03T10.parquet') GROUP BY event_type;
```

## July 1 trade-and-book sample

The 1 July 09:00 UTC archive hour contains a trade print in each of two
matchups: Norris versus Verstappen, and Verstappen versus Piastri. The printed
transaction hashes match independently obtained on-chain fills. The matched
prints are for the complementary outcome token to the token in the on-chain
fill; token mappings and prices must therefore be handled explicitly. The
time of an on-chain block is not necessarily the matching time.

The recorded books on the other outcome token, shortly before the prints, had
bids of 10 shares at $0.50 and 50 shares at $0.30 respectively. Each later
observed snapshot on those tokens agrees with the intervening absolute
price-level changes (five and four later snapshots respectively). That does not
prove every update or trade was recorded. The source timestamps of the initial
snapshots are approximately 138 seconds before their receipt timestamps; a
quiet book can retain an old source timestamp, so this age alone does not prove
the book was stale. These caveats preclude asserting uninterrupted coverage.

The filtered raw observations, including original transaction hashes, are in
`british-2026-july-01-matchup-events.json`. To reproduce, first install DuckDB,
then run:

```sh
curl -fL -o pmxt-2026-07-01T09.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-01T09.parquet
python3 research/prediction-markets/polymarket/extract_british_july_01_events.py \
  pmxt-2026-07-01T09.parquet /tmp/british-2026-july-01-matchup-events.json
```

The extractor checks SHA-256
`92233becbede0be22e778cdd24c882df05fbcf106e8693adc478f535f736ea38`.
Receive times are used to order the observations; order among events with the
same receive timestamp is not guaranteed to match exchange sequence.

## July 2 trade-and-book sample

Two more matched transaction hashes appear in the July 2 14:00 and 15:00 UTC
files. For Norris–Piastri, reconstructing the Norris-token book strictly before
the print's receipt yields a best bid of $0.50 for 10 shares; the complementary
Piastri-token print was a 2-share buy at $0.50. For Norris–Hamilton, the earlier
Hamilton-token snapshot from the 14:00 file and subsequent updates imply a best
ask of $0.70 for 10 shares before the print, which was a Hamilton-token buy of
1.42857 shares at $0.70. The corresponding synthetic Norris bid is $0.30 for
10 shares, assuming the venue's complementary-token transformation; there is
no directly recorded Norris-token pre-trade snapshot in these two hours.

The trade, book and update messages can share an identical receipt timestamp,
so their order is not assumed. The latter print arrived roughly eight seconds
after its source timestamp. A reconstruction using all earlier received data
cannot establish the true book at the exchange matching instant. Coverage and
queue priority remain unverified.

The raw filtered events and transaction hashes are in
`british-2026-july-02-matchup-events.json`. To reproduce, install DuckDB and run:

```sh
curl -fL -o pmxt-2026-07-02T14.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-02T14.parquet
curl -fL -o pmxt-2026-07-02T15.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-02T15.parquet
python3 research/prediction-markets/polymarket/extract_british_july_02_events.py \
  pmxt-2026-07-02T14.parquet pmxt-2026-07-02T15.parquet /tmp/british-2026-july-02-matchup-events.json
```

The extractor verifies SHA-256
`d614dd63d78aad3c7ffad86d66b6d14435cb0970a79ae41875c9619a529d905e` for 14:00
and `9fb63697d8c58448c21870f539af189d5613c42cb55f3a68f9c6b7a64291bb8d` for 15:00.
