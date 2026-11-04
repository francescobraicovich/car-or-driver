# PMData pre-practice window audit

The [machine-readable report](window-audit.json) audits Norris and Hamilton
winner-market files for seven Thursday windows, 14:00–16:00 UTC. These windows
were chosen after earlier research and are not a held-out experiment. The
original PMData Parquet files and download manifests remain in ignored `tmp/`;
the report contains only counts, diagnostics and file hashes. The source and
receive times are interpreted as UTC. First-practice times come from the
repository's retrospective 2026 forecast metadata and must be verified before
any live use. The audit never marks historical coverage complete.

| Race | Driver | Snapshots | Price changes | Trade prints | Equal receipt-time L2 rows |
| --- | --- | ---: | ---: | ---: | ---: |
| Austria | Hamilton | 20 | 3,388 | 20 | 393 |
| Austria | Norris | 18 | 1,148 | 18 | 179 |
| Britain | Hamilton | 4 | 2,014 | 4 | 303 |
| Britain | Norris | 4 | 1,160 | 4 | 126 |
| Belgium | Hamilton | 3 | 1,072 | 3 | 222 |
| Belgium | Norris | 1 | 606 | 1 | 129 |
| Hungary | Hamilton | 1 | 944 | 1 | 263 |
| Hungary | Norris | 1 | 1,389 | 1 | 499 |
| Netherlands | Hamilton | 2 | 389 | 1 | 0 |
| Netherlands | Norris | 2 | 330 | 0 | 0 |
| Italy | Hamilton | 3 | 505 | 0 | 0 |
| Italy | Norris | 5 | 575 | 2 | 0 |
| Singapore | Hamilton | 2 | 517 | 0 | 0 |
| Singapore | Norris | 4 | 502 | 1 | 0 |

All 14 markets have at least one recorded book at or before the window start.
Applying recorded price changes in file order produced no later snapshot
mismatches in these windows, but books after a trade can legitimately change
without a price-change row. The audit counts snapshot differences according to
whether a recorded trade also occurred in the interval; neither category proves
why a difference occurred. It also found no L2 source- or receive-time
reversals within the windows, but the equal receipt times in the table make
within-timestamp ordering uncertain. Italy Norris had one crossed/locked book
event, and recorded best asks disagreed with the incrementally rebuilt book
three times for Austria Hamilton, once for Italy Norris and once for Singapore
Hamilton. These are diagnostics, not proven missing messages. No unsupported
tick change was observed in the selected windows.

For Austria, Britain, Belgium and Hungary, trade transaction hashes were
compared with the separate [on-chain winner extract](../polymarket/onchain/winner/README.md),
matching both YES and NO token IDs. A one-minute buffer surrounds the window
for on-chain block-inclusion times, which are not exchange match times. In
Hungary Hamilton one extra chain hash appears in the buffer: its block time was
13:59:09 UTC and its recorded trade receipt time 13:59:06.712 UTC, both before
our 14:00 start. All other selected-window tape hashes matched, and no other
extra reference hashes appeared in the buffered scope. The independent source's
completeness is itself unverified. The PMData on-chain files were also checked
for all seven races, but are a **same-provider** check. Three windows had no
trade hashes, so provide no transaction-level match to assess. Comparing hashes
alone does not reconcile the individual maker levels, prices or quantities.

The provider's public BTC example lacked the documented `trade_id` column,
used lowercase outcomes, and stored `new_tick_size` as a string. The Austrian
F1 files did contain transaction hashes; consumers should inspect actual schemas.
The code rejects invalid required fields and unrecognized stream event types,
records timestamp ambiguity, and always leaves `coverage_complete` false. It
cannot detect silent websocket disconnects, reconstruct historical queue
positions, establish feasible fills or authenticate historical model inputs.

Reproduce after downloading the manifest files and 42 Parquet files to the
paths in `tmp/pmdata/`, and installing DuckDB in the Python environment:

```sh
python3 research/prediction-markets/pmdata/audit_study.py \
  --output /private/tmp/pmdata-window-audit.json
python3 -m unittest discover -s research/prediction-markets/pmdata \
  -p 'test_audit_l2.py' -v
```
