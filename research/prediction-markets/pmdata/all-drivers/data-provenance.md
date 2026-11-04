# All-driver data and coverage

The selected race-day roster is the previous race's roster, as recorded by the existing strategy feature files. The script maps those names to Polymarket's Gamma winner contracts; it does not use the target race results to choose the roster. Italy's prior roster includes Yuki Tsunoda, for whom the event has no named matching contract. The public PMData catalog has exactly one match for each of the 175 mapped contracts. Gamma metadata retrieved after the events identifies contracts and outcomes; it must not be used as a historical feature.

For each mapped market, the local manifest records the source, status, path and SHA-256 of each downloaded file. Raw Parquet files and Gamma responses are in ignored `tmp/pmdata-all/`. The existing four-driver files were reused via hard links. In total 287 new requests succeeded, 96 files were reused and 142 endpoints returned 404; no rate-limit or quota error occurred. The [PMData API reference](https://pmdata.dev/docs/api-reference) says a trades or on-chain fills 404 on a recorded day indicates no trades and does not consume quota. All 175 markets have a recorded-day L2 file. No API key is included in the manifest, audit outputs or scripts.

The full-day coverage audit reports real snapshots, synthetic-boundary candidates, elapsed time to an eligible non-boundary snapshot, last quote time, and source-to-receipt delays. The provider describes [generated midnight snapshots](https://pmdata.dev/docs/historical-data-details/overview): timestamps alone do not expose the age of their underlying prior-day data. There are 131 market-days with non-boundary snapshots and 44 without; the optimizer applies further eligibility checks. Snapshot existence does not establish feed completeness, exchange sequencing or real queue position.

The same-provider reverse audit compares non-exchange-summary on-chain maker transaction hashes with trade IDs. Seven chain-only transactions occur in six market-days (Monaco Antonelli; Barcelona Antonelli, Hadjar, Leclerc and Verstappen; Britain Hamilton). All are at least 885 seconds from a UTC boundary; block time is not matching time and same-provider comparison cannot establish feed completeness. Previously independent verification identified the Barcelona Leclerc transaction as a missing print. All six market-days are excluded by the normalized preparation.

With the raw input files in place and Python packages `pyarrow` and `duckdb` installed, reproduce the data audits from the repository root without any network requests or credentials:

```sh
python3 research/prediction-markets/pmdata/all-drivers/analyze_market_coverage.py
python3 research/prediction-markets/pmdata/all-drivers/analyze_fill_coverage.py
python3 research/prediction-markets/pmdata/all-drivers/analyze_catalog_coverage.py
```

The corresponding outputs are `coverage.json`, `fill-coverage.json` and `catalog-coverage.json`. Catalog `record_start` and `record_end` are bounds, not proof of coverage for each intervening day. The optimizer's separate 120-second source-age quality gate can exclude an entire market-day: all 21 mapped Italian markets contain at least one older L2 event, so Italy is unavailable under that gate.
