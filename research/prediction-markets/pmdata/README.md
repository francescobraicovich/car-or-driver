# PMData historical capture

The [public catalog check](catalog-coverage.md) identifies candidate driver
winner markets. A catalog date range does not prove that any particular day is
complete or even has a file. Downloaded data must be reconciled and audited
before it can support a backtest.

`download_market_day.py` requests one Parquet file for one Polymarket market,
UTC day and data type. Set `PMDATA_API_KEY` in the process environment; it is
sent in the `api_key` HTTPS header and never added to the URL or output. The
client refuses redirects and never prints response error bodies. It writes to a
temporary file first, checks the Parquet envelope and publishes atomically
without overwriting an existing file. A valid envelope is not a full Parquet
integrity or market-data coverage check.

Each successful API request costs one download unit, including a repeat request.
An unavailable file may return 404. HTTP 429 can indicate that quota is
exhausted. The client makes **one request only** and does not automatically
retry any error; if a download fails after the server returned 200, quota may
already have been consumed. Do not re-download existing data unnecessarily.
The provider documents these policies in its [API reference](https://pmdata.dev/docs/api-reference).

```sh
# PMDATA_API_KEY must already be available in the environment.
python3 research/prediction-markets/pmdata/download_market_day.py \
  --type l2 --date 2026-07-02 \
  --market f1-british-grand-prix-winner-norris-2026-07-05 \
  --output tmp/pmdata/british-norris-l2.parquet
python3 -m unittest discover -s research/prediction-markets/pmdata -p 'test_*.py' -v
```

The supported types are `l2`, `trades` and `onchain_fills`. PMData's standard
`l2` file is the YES-token book. Its documented free tier only covers data
older than 21 days. See the [provider documentation](https://pmdata.dev/docs/historical-data-details/polymarket)
for data fields, pricing and usage terms. Preserve source metadata and hashes,
and check redistribution rights before committing downloaded Parquet files.
