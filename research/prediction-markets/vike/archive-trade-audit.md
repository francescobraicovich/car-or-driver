# Vike archived race-winner trade audit

This audit compares Vike's daily and sports-inclusive family trade partitions
with Gamma winner-market identifiers. It does not inspect the order book or
prove that the exchange had no trades.

For 2026-10-22 the selected USA Norris, Hamilton, Leclerc, Antonelli,
Verstappen, Piastri, Russell and Other YES tokens have zero rows in the
14:00–15:00 UTC window and zero across the UTC day. No trade row for any of
the 29 USA winner-event condition IDs appears in either daily file or the
`other/other` family file across that day. For 2026-08-20 the selected Dutch
Norris and Hamilton YES tokens likewise have zero rows in the target hour and
the day, and their two condition IDs have zero rows in either file. The Dutch
metadata used here contains only those two markets, not the full event.

The [sanitized results](archive-trade-audit.json) list token and condition
IDs, file URLs, byte counts, SHA-256 digests and filters. The audit filters
`local_ts`, the recorder's receive time, over the half-open interval
14:00:00–15:00:00 UTC. The Vike trade schema contains `token_id`,
`condition_id`, `ts`, `local_ts`, `seq`, `price`, `size` and `side`; it does
not contain transaction hashes. Absence from this tape is not proof that no
trade occurred on Polymarket or that its books were continuously recorded.

Vike identifies its archive as CC BY 4.0; attribution and download details
are in the [provider archive documentation](https://vike.io/docs/data/polymarket/files).
The source files are retained locally in ignored `tmp/`, not committed:

| UTC date | Full daily trades | Sports-inclusive other/other trades |
| --- | ---: | ---: |
| 2026-10-22 | 11,883,841 bytes | 3,632,563 bytes |
| 2026-08-20 | 18,193,718 bytes | 4,069,066 bytes |

To reproduce on another machine, download the four exact archive URLs shown
in the results to `tmp/vike-daily-trades-YYYY-MM-DD.parquet` and
`tmp/vike-other-trades-YYYY-MM-DD.parquet`; authenticated archive downloads
require a Vike API key. The script checks each file's length and SHA-256
before reading. Download the public Gamma event metadata for
`f1-united-states-grand-prix-winner-2026-10-25` to
`tmp/united-states-2026-gamma-event.json`; the two Dutch markets use the
checked-in official outcome metadata. The metadata hashes are recorded in the
results; a newly retrieved Gamma response can differ as metadata is updated.
With DuckDB installed in the chosen Python environment, run:

```sh
python3 research/prediction-markets/vike/audit_archived_trades.py
```

This regenerates the results JSON. It makes no network requests and does not
read or store the API key. The underlying Parquet files are CC BY 4.0 Vike data.
