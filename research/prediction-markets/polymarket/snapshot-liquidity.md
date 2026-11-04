# Observed pre-practice liquidity: 2026 British Grand Prix

This is a descriptive study of the 24 Polymarket driver-matchup conditions in
`british-2026-condition-identifiers.json`, not a backtest or a claim of
executable profit. The source is the [PMXT v2 archive](https://archive.pendulumflow.com/pmxt/v2/),
CC BY 4.0. We used its 09:00, 10:00 and 11:00 UTC files on 3 July 2026,
retaining only records received strictly before the 11:30 UTC start of first
practice. The source files, checksums, market identification and known capture
problems are documented in [README.md](README.md).

For each condition we select the last **received full snapshot** among either
outcome token before that cutoff. If both tokens have the same latest receipt
time, the lexicographically larger token ID is selected deterministically. We
compute the best recorded bid, best recorded ask, and their displayed share
quantities. A one-sided, crossed, or missing snapshot is excluded. This rule
avoids counting the two complementary outcomes as independent markets; it
selects whichever outcome has the later snapshot, and it does **not** construct
a combined or synthetic book across both outcomes. The selection and all
results are recorded per market in `british-2026-snapshot-liquidity.json`.

| Recorded measurement | Result |
| --- | ---: |
| Conditions with a usable two-sided snapshot | 24 of 24 |
| Median displayed bid–ask spread | $0.485 per share |
| Minimum / maximum displayed spread | $0.25 / $0.87 per share |
| Median size at best bid / best ask | 100 / 55 shares |
| Median best-bid / best-ask notional | $24 / $32.50 |
| Median receipt time before practice | 17.9 minutes |
| Median difference between source and receipt time | 3.9 minutes |

These snapshots do not represent a synchronized view: the latest selected
receipt times range from 13.8 seconds to 100.4 minutes before practice. A long
source-to-receipt time does not, on its own, mean the book was stale; an old
source timestamp can occur in a quiet market. Separately, the previously documented
snapshot/update discrepancies and the archive's incomplete coverage mean we do
not know that the selected books were complete or that the quotes remained
available. These displayed spreads exclude actual executions, fees, queue
position, other ways to trade complementary tokens, market impact, and the
possibility of changes between snapshots. The 24 matchups are one race, not
independent events. Do not interpret a wide displayed spread as earnings or
infer fills from it.

Reproduce the output after downloading the three files as documented in the
README and installing DuckDB:

```sh
python3 research/prediction-markets/polymarket/analyze_snapshot_liquidity.py \
  --conditions research/prediction-markets/polymarket/british-2026-condition-identifiers.json \
  --before 1783078200000 --output /tmp/british-snapshot-liquidity.json \
  pmxt-2026-07-03T09.parquet pmxt-2026-07-03T10.parquet pmxt-2026-07-03T11.parquet
python3 -m unittest discover -s research/prediction-markets/polymarket -p 'test_snapshot_liquidity.py' -v
```
