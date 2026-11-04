# Dutch and Italian GP: PendulumFlow v3 samples

These are two **selected one-hour research samples**, not verified complete
market histories or trading backtests. They cover Norris and Hamilton
race-winner YES/NO markets on the Thursday before each race. PendulumFlow v3 is
[CC BY-NC 4.0](https://archive.pendulumflow.com/formats/v3); credit
PendulumFlow. Commercial use requires a separate licence. The hour and market
selection were made after reviewing availability, so they are not an untouched
test set.

The archive's own [v3 audit](https://archive.pendulumflow.com/audit/v3) found
all traded markets represented in six preselected hours, but explicitly warns
that this does not establish coverage of the whole corpus. The two selected
hour reports each show 60/60 globally active minutes and `AUDIT PASS`; Dutch
has 5/8 checks passed with three skipped, and Italian has 8/8 checks passed
with four expected collectors contributing. Those are hour-level evidence,
not proof that either target market's order updates and trades are complete.
Source-local sequence is not an exchange-global order and merged recorders may
observe messages in different orders.

| YES market and archive hour UTC | Book snapshots | Level changes | Trade prints | Later snapshots differing from a simple reconstruction |
| --- | ---: | ---: | ---: | ---: |
| Dutch Norris, Aug 20 14:00 | 6 | 148 | 0 | 4 of 5 |
| Dutch Hamilton, Aug 20 14:00 | 6 | 156 | 0 | 4 of 5 |
| Italian Norris, Sep 3 14:00 | 2 | 316 | 0 | 0 of 1 |
| Italian Hamilton, Sep 3 14:00 | 3 | 282 | 0 | 0 of 2 |

The reconstruction sorts by recorded receipt time and collector-local
sequence, then applies absolute level changes. Differences may arise from
source ordering or data gaps; their cause is not established. Agreement at a
later snapshot likewise does not prove every intervening event was captured.
The first Dutch YES snapshots were received at 14:00:53.846334 and
14:01:15.734687 UTC. Italian snapshots were first received at 14:32:22.558601
and 14:31:50.009152 UTC, respectively. They do not establish tradable quotes at
the 14:00 model decision time. Neither selected hour contains any target-market
trade prints or tick-size changes, so they do not establish fills or historical
tick settings. Across all 22 named driver-winner markets in those hours, Dutch
has one print and Italian has six; those are not the selected two markets.

The official Data API returned a Dutch Hamilton trade record timestamped
14:34:19 UTC on Aug 20, transaction
`0x4febc9d59d1a9b156d8647942bfc78a460c8e441bb090db2504d04e205b157f6`.
The selected v3 hour contains no print with that transaction hash or condition.
The selected, non-profile fields and source hash are in
`dutch-2026-hamilton-v3-discrepancy.json`. The API timestamp may reflect a
different point in matching or settlement than the recorder's timestamp, so
this is a cross-source discrepancy, not conclusive proof of a dropped trade.

The raw filtered samples, official market metadata and audit summaries are:

- `dutch-2026-august-20-winner-v3-events.json`, `dutch-2026-official-outcomes.json`,
  `dutch-2026-winner-v3-audit.json`
- `italian-2026-september-03-winner-v3-events.json`, `italian-2026-official-outcomes.json`,
  `italian-2026-winner-v3-audit.json`

`dutch-2026-winner-v3-field-counts.json` and
`italian-2026-winner-v3-field-counts.json` preserve the event-count scan for
all event conditions, not just the two selected drivers.

`receivedUs` preserves the raw collector timestamp in UTC microseconds;
`received` is milliseconds for compatibility with existing research code and
may lose sub-millisecond precision. Exchange `source` times are milliseconds;
large `sequence` values are strings to avoid JavaScript integer rounding. These
records deliberately carry `coverageComplete: false`. No current fee flag,
order minimum or tick is asserted to hold historically.

## Reproduce

With DuckDB installed, download each original manifest and its exact hourly
file. Do not hammer the archive: honor HTTP 429 and `Retry-After`; its operator
explicitly asks clients to download files only once. The extractor verifies the
full file against the manifest SHA-256 before filtering the two conditions.
Original Parquet files total roughly 1.9 GB and are not included here.

```sh
curl -fL -o dutch-manifest.json https://dl.pendulumflow.com/v3/2026-08-20/14/manifest.json
curl -fL -o dutch-hour.parquet https://dl.pendulumflow.com/v3/2026-08-20/14/2026-08-20T14.parquet
python3 research/prediction-markets/polymarket/extract_pendulum_winner_events.py \
  dutch-hour.parquet dutch-manifest.json research/prediction-markets/polymarket/dutch-2026-official-outcomes.json /tmp/dutch-v3-events.json
python3 research/prediction-markets/polymarket/audit_pendulum_winner_events.py \
  /tmp/dutch-v3-events.json research/prediction-markets/polymarket/dutch-2026-official-outcomes.json /tmp/dutch-v3-audit.json

curl -fL -o italian-manifest.json https://dl.pendulumflow.com/v3/2026-09-03/14/manifest.json
curl -fL -o italian-hour.parquet https://dl.pendulumflow.com/v3/2026-09-03/14/2026-09-03T14.parquet
python3 research/prediction-markets/polymarket/extract_pendulum_winner_events.py \
  italian-hour.parquet italian-manifest.json research/prediction-markets/polymarket/italian-2026-official-outcomes.json /tmp/italian-v3-events.json
python3 research/prediction-markets/polymarket/audit_pendulum_winner_events.py \
  /tmp/italian-v3-events.json research/prediction-markets/polymarket/italian-2026-official-outcomes.json /tmp/italian-v3-audit.json
```

Original hourly SHA-256: Dutch
`afea89fea49601fe9756fa83ab910ca64eea28d82180700cb9fbbc79be76af48`;
Italian `aeda1ba9d75a28e4c82e8440e8d5ffdb5988dd17f8f8c6b2a4804defd13a7886`.
Official selected outcomes are current Gamma responses: Dutch Norris YES=1,
Hamilton YES=0; Italian Norris/Hamilton YES=0 and Antonelli YES=1. These are
exchange-reported resolutions, not independent on-chain oracle checks, and must
not fund another race before the recorded resolution times.
