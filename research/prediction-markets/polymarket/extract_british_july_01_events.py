"""Extract two British GP matchup recordings from the PMXT July 1 hour."""

import argparse
import hashlib
import json
from pathlib import Path

CONDITIONS = [
    "0xc681d9adb3ff2259b773f29e492c94da788340ca5bf96f2441c9a4b168d54627",
    "0xbc8f1aed945424d60a4530a7fae0b3e88e301423318ae1f580e2dd3a542c7720",
]
SHA256 = "92233becbede0be22e778cdd24c882df05fbcf106e8693adc478f535f736ea38"


def extract(inputs, expected_hashes, conditions, sources, output_path):
    for path, expected_hash in zip(inputs, expected_hashes, strict=True):
        with open(path, "rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        if digest != expected_hash:
            raise ValueError("Source hash does not match the documented PMXT file")
    import duckdb

    columns = ["condition", "asset", "type", "received", "source", "price", "size", "side", "bids", "asks", "transactionHash"]
    rows = duckdb.sql("""
        SELECT CAST(market AS VARCHAR), asset_id, event_type,
               epoch_ms(timestamp_received), epoch_ms(timestamp), price, size,
               side, bids, asks, transaction_hash
        FROM read_parquet(?) WHERE market IN (?, ?)
        ORDER BY timestamp_received
    """, params=[inputs, *conditions]).fetchall()
    output = {
        "source": "PMXT v2, https://archive.pmxt.dev/Polymarket/v2, CC BY 4.0",
        "sources": [{"url": url, "sha256": digest} for url, digest in zip(sources, expected_hashes, strict=True)],
        "coverageComplete": False,
        "description": "Filtered market book, level-change and trade-print observations; receive-time order, ties not proven ordered.",
        "rows": [dict(zip(columns, row)) for row in rows],
    }
    Path(output_path).write_text(json.dumps(output, indent=2, default=str) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Original PMXT July 1 09 UTC Parquet file")
    parser.add_argument("output", help="Path for the filtered JSON observations")
    args = parser.parse_args()
    extract([args.input], [SHA256], CONDITIONS,
            ["https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-01T09.parquet"], args.output)


if __name__ == "__main__":
    main()
