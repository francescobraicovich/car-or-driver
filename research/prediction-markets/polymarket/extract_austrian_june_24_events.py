"""Extract an Austrian GP matchup recording from the PMXT June 24 hours."""

import argparse

from extract_british_july_01_events import extract

CONDITION = "0xf8f005ade2a08b66cb628c6830909c6fa8a097bb5579f7b46a4e2a20a8062a7d"
HASHES = [
    "290fd8a424d3d5aa086bb62474aaca974dd9f2cf22553089b940e43d9f09a0cd",
    "dd1fcf2ee5554270f1a4b4e9f579c8173d2c5d42cc523fba93d40e567aa544f1",
]
URLS = [
    "https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-24T17.parquet",
    "https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-24T18.parquet",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hour_17", help="Original PMXT June 24 17 UTC Parquet file")
    parser.add_argument("hour_18", help="Original PMXT June 24 18 UTC Parquet file")
    parser.add_argument("output", help="Path for the filtered JSON observations")
    args = parser.parse_args()
    extract([args.hour_17, args.hour_18], HASHES, [CONDITION, CONDITION], URLS, args.output)


if __name__ == "__main__":
    main()
