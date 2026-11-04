# Teammate market-window audit

This is a data-quality audit, not proof of complete exchange capture or
executable fills. The [machine-readable results](teammate-window-audit.json)
cover the Leclerc and Piastri race-winner markets across seven researcher-selected
Thursday windows, 14:00–16:00 UTC. Inputs are the 42 protected PMData files
listed with hashes in the report, retained locally in ignored `tmp/pmdata/`.
The June-to-October study is retrospective; publication-time vintages,
first-practice schedules and historical fee/tick settings need separate checks.

All 14 markets have a book at or before the window. Hungary Piastri has no
book snapshot **within** the window, so an adapter requiring a new in-window
snapshot cannot run it without a separately justified warm start. British
Leclerc and Piastri each have a snapshot discrepancy after a recorded trade and
three and two crossed/locked-book events, respectively. Austrian Piastri has
five best-ask and one best-bid discrepancies. Early-race windows contain many
identical L2 receipt timestamps; their within-timestamp order is not proven.

For the first four races, each nonempty selected-window print-hash set matched
our separately sourced on-chain winner extract within a ±60-second block-time
buffer. Matching hashes do not establish that either feed is complete, that
maker prices and quantities reconcile, or that a hypothetical order fills.
Dutch and Singapore teammates and Hungary/Italy Piastri have no recorded
selected-window prints; this does not prove no exchange trades occurred. All
coverage flags remain false.

To regenerate after obtaining the exact files and manifest, install DuckDB and
run from the repository root:

```sh
python3 research/prediction-markets/pmdata/optimization/audit_teammate_windows.py
```

The audit uses the existing `audit_l2.py` module and makes no network calls or
reads of credentials. PMData raw-file usage and redistribution terms apply.
