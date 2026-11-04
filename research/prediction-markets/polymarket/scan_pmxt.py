"""Count PMXT event types for specified conditions before an exclusive cutoff."""

import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--conditions", required=True, help="JSON array of conditionId and drivers")
    parser.add_argument("--before", type=int, required=True, help="exclusive UTC Unix milliseconds")
    parser.add_argument("--output", required=True)
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()

    import duckdb
    conditions = json.loads(Path(args.conditions).read_text())
    identifiers = [item["conditionId"] for item in conditions]
    if not identifiers or len(set(identifiers)) != len(identifiers):
        raise ValueError("conditions must be nonempty and unique")
    placeholders = ",".join("?" for _ in identifiers)
    connection = duckdb.connect()
    rows = connection.execute(f"""
        SELECT CAST(market AS VARCHAR), event_type, COUNT(*),
               COUNT(DISTINCT asset_id), epoch_ms(MIN(timestamp_received)),
               epoch_ms(MAX(timestamp_received))
        FROM read_parquet(?)
        WHERE CAST(market AS VARCHAR) IN ({placeholders})
          AND epoch_ms(timestamp_received) < ?
        GROUP BY 1, 2
        ORDER BY 1, 2
    """, [args.files, *identifiers, args.before]).fetchall()
    files = []
    for name in args.files:
        with open(name, "rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        files.append({"name": Path(name).name, "sha256": digest})
    output = {
        "source": "PMXT v2; https://archive.pmxt.dev/Polymarket/v2; CC BY 4.0",
        "files": files,
        "cutoffExclusive": args.before,
        "conditionCount": len(identifiers),
        "observedConditionCount": len({row[0] for row in rows}),
        "coverageComplete": False,
        "rows": [{"conditionId": condition, "eventType": kind, "count": count,
                  "observedAssetCount": assets, "firstReceived": first,
                  "lastReceived": last}
                 for condition, kind, count, assets, first, last in rows],
    }
    Path(args.output).write_text(json.dumps(output, indent=2) + "\n")


if __name__ == "__main__":
    main()
