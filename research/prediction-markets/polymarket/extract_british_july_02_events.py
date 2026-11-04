"""Extract two British GP matchup recordings from the PMXT July 2 hours."""

import argparse

from extract_british_july_01_events import extract

CONDITIONS = [
    "0x187ab0d2c601e1d9f881d817fdfb31817e49b37e22b229e367d7775f43b53876",
    "0xb4d2525fb9a7a812dc4aa433a4ce747b0b7a631758c0b5f11ed96a6e1fa663a2",
]
HASHES = [
    "d614dd63d78aad3c7ffad86d66b6d14435cb0970a79ae41875c9619a529d905e",
    "9fb63697d8c58448c21870f539af189d5613c42cb55f3a68f9c6b7a64291bb8d",
]
URLS = [
    "https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-02T14.parquet",
    "https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-02T15.parquet",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hour_14", help="Original PMXT July 2 14 UTC Parquet file")
    parser.add_argument("hour_15", help="Original PMXT July 2 15 UTC Parquet file")
    parser.add_argument("output", help="Path for the filtered JSON observations")
    args = parser.parse_args()
    extract([args.hour_14, args.hour_15], HASHES, CONDITIONS, URLS, args.output)


if __name__ == "__main__":
    main()
