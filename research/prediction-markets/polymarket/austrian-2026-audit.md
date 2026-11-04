# Austrian Grand Prix pre-practice archive audit

The official [Formula 1 timetable](https://www.formula1.com/en/latest/article/formula-1-lenovo-austrian-grand-prix-2026.7jl4utJeIV75DpBVcPFDQU)
places FP1 at 13:30 local time on June 26, 2026, or 11:30 UTC. We selected three
non-contiguous one-hour PMXT v2 files before FP1. Across the 24 identified driver
matchups, the files contain 31 book snapshots and 16,320 level changes, but no
recorded `last_trade_price` events. All 24 conditions have level-change records
in each selected hour. This is a finding about the archive, not proof that the
exchange saw no trades, or that other hours have no trade prints.

Factual market condition IDs and outcome labels were obtained from the public
[benjessel market metadata](https://huggingface.co/datasets/benjessel/polymarket_trades/blob/main/markets.parquet).
That dataset does not specify a separate open license; the committed identifier
list contains identifying facts, not source rows. PMXT's v2 archive is licensed
CC BY 4.0, attribution PMXT, <https://archive.pmxt.dev/Polymarket/v2>.
`austrian-2026-observation-counts.json` holds per-condition counts and hashes.

With DuckDB installed, reproduce the scan from the repository root:

```sh
curl -fL -o pmxt-2026-06-25T14.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-25T14.parquet
curl -fL -o pmxt-2026-06-25T15.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-25T15.parquet
curl -fL -o pmxt-2026-06-26T10.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-26T10.parquet
python3 research/prediction-markets/polymarket/scan_pmxt.py \
  --conditions research/prediction-markets/polymarket/austrian-2026-condition-identifiers.json \
  --before 1782473400000 --output /tmp/austrian-observation-counts.json \
  pmxt-2026-06-25T14.parquet pmxt-2026-06-25T15.parquet pmxt-2026-06-26T10.parquet
```

The source SHA-256 values are:

- June 25 14:00: `b14013f8cfb4addf4865667e7ec2d15a27b299e744d3cb6cdf1fed195ca670f5`
- June 25 15:00: `50a97585f2de6db09fd2b58b0b4df3bbdf4279ee99e22766e7343ab972f9a684`
- June 26 10:00: `d0617b70b497233ac61d9bffa4e721cc54d3eda3b183f6870225d769473c1401`

## A separately selected matched trade on June 24

An independent on-chain scan identified a Leclerc–Hamilton transaction in the
June 24 18:00 UTC hour. PMXT recorded a matching Hamilton-token buy at $0.63
for 1.5873 shares; the PMXT and on-chain transaction hash is
`0x783c88f6d39044eb2d91e6880e480430c5b2686bcb8b74fbc9df8ecc12ac081b`.
The prior hour contains a Leclerc-token snapshot; applying 26 subsequent
absolute price-level updates strictly before the trade print's receipt produces
a $0.37 bid for 25.23 shares and a $0.86 ask for 6.79 shares. The Hamilton-token
buy is complementary to a Leclerc-token sell under the venue's token-book
mapping. An order joining the displayed bid behind its existing quantity would
not fill on this print under that assumption.

The trade and book records at the print's receipt timestamp cannot be ordered
from receipt time alone, so they were excluded from the pre-trade state.
The initial snapshot is older than the print; independently uninterrupted
coverage and actual queue ordering cannot be established from this extract.
This selected trade is a case study, not a profitability estimate.

The filtered two-outcome recording is `austrian-2026-june-24-matchup-events.json`.
Reproduce with DuckDB installed:

```sh
curl -fL -o pmxt-2026-06-24T17.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-24T17.parquet
curl -fL -o pmxt-2026-06-24T18.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-24T18.parquet
python3 research/prediction-markets/polymarket/extract_austrian_june_24_events.py \
  pmxt-2026-06-24T17.parquet pmxt-2026-06-24T18.parquet /tmp/austrian-matchup-events.json
```

The extractor validates source SHA-256 values
`290fd8a424d3d5aa086bb62474aaca974dd9f2cf22553089b940e43d9f09a0cd` and
`dd1fcf2ee5554270f1a4b4e9f579c8173d2c5d42cc523fba93d40e567aa544f1`,
respectively.
