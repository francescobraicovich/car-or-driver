"""Describe one recorded pre-practice book per matchup, without inferring trades."""

import argparse
import hashlib
import json
import statistics
from decimal import Decimal, InvalidOperation
from pathlib import Path


def snapshot_metrics(bids, asks):
    """Return top-of-book observations, or the reason a snapshot cannot be used."""
    def read_levels(levels):
        if not isinstance(levels, list):
            raise ValueError("book levels must be an array")
        result = []
        for level in levels:
            if not isinstance(level, (list, tuple)) or len(level) != 2:
                raise ValueError("malformed level")
            try:
                price, quantity = map(lambda value: Decimal(str(value)), level)
            except InvalidOperation as exc:
                raise ValueError("invalid numeric level") from exc
            if not price.is_finite() or not quantity.is_finite() or not 0 < price < 1 or quantity <= 0:
                raise ValueError("invalid price or size")
            result.append((price, quantity))
        return result

    bid_levels = read_levels(bids)
    ask_levels = read_levels(asks)
    if not bid_levels or not ask_levels:
        return None
    bid, bid_size = max(bid_levels, key=lambda level: level[0])
    ask, ask_size = min(ask_levels, key=lambda level: level[0])
    if bid >= ask:
        return None
    return {"bid": float(bid), "bidShares": float(bid_size),
            "ask": float(ask), "askShares": float(ask_size),
            "spread": float(ask - bid),
            "bidNotional": float(bid * bid_size),
            "askNotional": float(ask * ask_size)}


def summarize(snapshots, conditions, cutoff):
    """Use only the latest received snapshot per market; ties break by token ID."""
    lookup = {item["conditionId"]: item["drivers"] for item in conditions}
    if not lookup or len(lookup) != len(conditions):
        raise ValueError("conditions must be nonempty and unique")
    latest = {}
    for condition, asset, received, source, bids, asks in snapshots:
        if condition not in lookup:
            continue
        if not isinstance(received, int) or not isinstance(source, int) or source > received:
            raise ValueError("invalid snapshot timestamps")
        if received >= cutoff:
            continue
        if condition not in latest or (received, asset) > (latest[condition][1], latest[condition][0]):
            latest[condition] = (asset, received, source, bids, asks)
    records, excluded = [], []
    for condition, drivers in lookup.items():
        if condition not in latest:
            excluded.append({"conditionId": condition, "drivers": drivers, "reason": "no observed snapshot"})
            continue
        asset, received, source, bids, asks = latest[condition]
        metrics = snapshot_metrics(json.loads(bids), json.loads(asks))
        if metrics is None:
            excluded.append({"conditionId": condition, "drivers": drivers, "reason": "one-sided or crossed book"})
            continue
        records.append({"conditionId": condition, "drivers": drivers, "assetId": asset,
                        "received": received, "sourceTimestamp": source,
                        "secondsBeforeCutoff": (cutoff - received) / 1000,
                        "sourceAgeSeconds": (received - source) / 1000, **metrics})
    records.sort(key=lambda record: record["conditionId"])
    def median(field):
        return statistics.median(record[field] for record in records) if records else None
    return {"marketCount": len(lookup), "marketsWithSnapshot": len(latest),
            "usableMarketCount": len(records), "cutoffExclusive": cutoff,
            "medianSpread": median("spread"), "medianBidShares": median("bidShares"),
            "medianAskShares": median("askShares"), "medianBidNotional": median("bidNotional"),
            "medianAskNotional": median("askNotional"),
            "medianSecondsBeforeCutoff": median("secondsBeforeCutoff"),
            "medianSourceAgeSeconds": median("sourceAgeSeconds"),
            "records": records, "excluded": excluded}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--conditions", required=True)
    parser.add_argument("--before", type=int, required=True, help="exclusive UTC Unix milliseconds")
    parser.add_argument("--output", required=True)
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()
    import duckdb
    conditions = json.loads(Path(args.conditions).read_text())
    identifiers = [item["conditionId"] for item in conditions]
    placeholders = ",".join("?" for _ in identifiers)
    connection = duckdb.connect()
    rows = connection.execute(f"""
        SELECT CAST(market AS VARCHAR), asset_id, epoch_ms(timestamp_received),
               epoch_ms(timestamp), bids, asks
        FROM read_parquet(?)
        WHERE CAST(market AS VARCHAR) IN ({placeholders}) AND event_type = 'book'
          AND epoch_ms(timestamp_received) < ?
        ORDER BY timestamp_received, asset_id
    """, [args.files, *identifiers, args.before]).fetchall()
    result = summarize(rows, conditions, args.before)
    result["source"] = "PMXT v2; https://archive.pmxt.dev/Polymarket/v2; CC BY 4.0"
    result["files"] = []
    for name in args.files:
        with open(name, "rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        result["files"].append({"name": Path(name).name, "sha256": digest})
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
