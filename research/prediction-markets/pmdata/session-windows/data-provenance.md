# Weekend data provenance

This archive supports retrospective Monaco and Singapore studies. It is not an
attestation of exchange-feed completeness or actual executable fills. Driver
and market identities come from the existing previous-race-roster Gamma
[manifest](../all-drivers/manifest.json); the target race outcomes are not used
to select contracts. The new [manifest](manifest.json) records dates, file
status, safe source URLs, byte lengths, and SHA-256 hashes. Raw Parquet files
and the API credential remain in ignored `tmp/`.

All times below are UTC and end points are exclusive:

| Race | Before qualifying | Before race |
| --- | --- | --- |
| Monaco | 2026-06-06 00:00–14:00 | 2026-06-07 10:00–13:00 |
| Singapore | 2026-10-10 00:00–13:00 | 2026-10-11 09:00–12:00 |

The Saturday window includes Singapore's sprint, which started at 09:00. The
model input timing must explicitly account for which sprint and qualifying
information was available; scheduled start is not a verified publication time
for an official classification. The pre-race windows end at the scheduled
Grand Prix starts and use no subsequent events.

The collector obtained 190 new successful files and stopped at its explicit
quota-preserving cap without an API error. Each requested race-day has 22 L2
files and a completed trade/on-chain endpoint status for each driver. On
qualifying day, Monaco has 16 complete driver triples; Singapore has 15 complete
triples and one further L2 file. The remaining entries are marked
`not_requested_quota_cap` and are not zero-trading observations. Qualifying-day
requests were interleaved across events in existing prior-roster order, one
driver's book, trade, and chain files at a time, before seeing trade results.
Some recorded trade and on-chain endpoints returned 404. PMData states that a
trade or on-chain 404 on a recorded market-day indicates no trades and that a
404 consumes no quota. See the [API reference](https://pmdata.dev/docs/api-reference).

The independent [window-coverage audit](window-coverage.json) counts snapshots,
timestamps, and same-provider chain-to-trade transaction hashes. On Monaco
qualifying day 4,263 L2 messages have source timestamps 1–4 ms after receipt;
all other L2 windows and all trade-print windows have no such messages. No
messages in the audited windows have source age above 120 seconds. Adjusting
for a presumed clock offset is a sensitivity assumption, not proof of actual
event order. The audit identified 12 chain transaction hashes during each
Monaco window without a same-day trade ID. Block time and venue execution time
can differ, so these are potential missing prints, not proof of match timing.
No such unmatched window transactions were found for Singapore. Source
ordering, in-flight orders, and queue positions still require caution.

Recorded trade receipt lag exceeds one second for seven of 1,174 Monaco
qualifying-window prints (maximum 3.680 seconds) and six of 1,398 Monaco
race-window prints (maximum 3.332 seconds). No downloaded Singapore window
prints exceed one second; maxima are 0.229 and 0.897 seconds. The separate
[qualifying blackout audit](qualifying-blackout-audit.json) found no downloaded
print with a pre-qualifying source time, a receipt at or after two seconds
before qualifying, and a delay over one second. These checks do not establish
that missing prints could not affect cancellations.

The [midnight blackout audit](midnight-blackout-audit.json) examines both
downloaded day files. It found no recorded print with source time before Sunday
midnight and receipt at or after two seconds before midnight. Unrequested files
and feed completeness remain unknown.

With pandas and PyArrow installed, rerun the audit offline without credentials:

```sh
python3 research/prediction-markets/pmdata/session-windows/audit_data.py
python3 research/prediction-markets/pmdata/session-windows/audit_qualifying_blackout.py
python3 research/prediction-markets/pmdata/session-windows/audit_midnight_blackout.py
```
