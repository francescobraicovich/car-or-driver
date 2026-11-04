"""Extract one outcome's observed PMXT v2 book events from local Parquet files.

PMXT data is CC BY 4.0: https://archive.pmxt.dev/Polymarket/v2.
Requires DuckDB. The archive does not establish uninterrupted market coverage;
the output therefore always marks coverage as unverified.
"""

import argparse
import hashlib
import json
from pathlib import Path


def normalize(rows, first_practice, exit_time, driver_a, driver_b):
    if exit_time >= first_practice:
        raise ValueError("exit time must precede first practice")
    events = []
    for row in rows:
        received, source, kind, bids, asks, price, size, side = row
        if received >= exit_time:
            continue
        common = {"timestamp": received, "sourceTimestamp": source}
        if kind == "book":
            events.append({"type": "snapshot", **common,
                           "bids": [[float(p), float(q)] for p, q in json.loads(bids)],
                           "asks": [[float(p), float(q)] for p, q in json.loads(asks)]})
        elif kind in ("price_change", "last_trade_price"):
            if not events:
                continue
            if side not in ("BUY", "SELL") or price is None or size is None:
                raise ValueError("invalid PMXT price-change or trade event")
            events.append({"type": "update" if kind == "price_change" else "trade",
                           **common, "side": side.lower(), "price": float(price),
                           "quantity": float(size)})
        elif kind == "tick_size_change":
            raise ValueError("tick size changed; this extract needs separate handling")
        else:
            raise ValueError(f"unsupported PMXT event type: {kind}")
    if not events:
        raise ValueError("no initial book snapshot before the exit time")
    return {"pair": {"driverA": driver_a, "driverB": driver_b},
            "firstPractice": first_practice, "exitTime": exit_time,
            "exitMode": "liquidation",
            "coverage": {"start": events[0]["timestamp"], "end": exit_time,
                         "complete": False}, "events": events}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--condition-id", required=True)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--driver-a", required=True, help="driver represented by the selected outcome token")
    parser.add_argument("--driver-b", required=True)
    parser.add_argument("--first-practice", type=int, required=True, help="UTC Unix milliseconds")
    parser.add_argument("--exit-time", type=int, required=True, help="exclusive UTC Unix milliseconds")
    parser.add_argument("--output", required=True)
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()
    import duckdb
    connection = duckdb.connect()
    rows = []
    for name in args.files:
        # Preserve file order when receive timestamps tie; source order is not a
        # guarantee of matching-engine sequence.
        rows.extend(connection.execute("""
            SELECT epoch_ms(timestamp_received), epoch_ms(timestamp), event_type,
                   bids, asks, price, size, side
            FROM read_parquet(?, file_row_number = true)
            WHERE CAST(market AS VARCHAR) = ? AND asset_id = ?
            ORDER BY timestamp_received, file_row_number
        """, [name, args.condition_id, args.asset_id]).fetchall())
    rows.sort(key=lambda row: row[0])
    result = normalize(rows, args.first_practice, args.exit_time, args.driver_a, args.driver_b)
    files = []
    for name in args.files:
        with open(name, "rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        files.append({"name": Path(name).name, "sha256": digest})
    result["provenance"] = {
        "collector": "PMXT", "license": "CC BY 4.0",
        "archive": "https://archive.pmxt.dev/Polymarket/v2",
        "conditionId": args.condition_id, "assetId": args.asset_id,
        "files": files,
        "limitation": "Archive completeness and uninterrupted market coverage are not established."
    }
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
