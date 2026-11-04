"""Extract two Austrian GP race-winner markets from PMXT June 25 hours."""

import argparse

from extract_british_july_01_events import extract

CONDITIONS = [
    "0x4660332081e4aca6fe2456ceb6370f49366257ee43ed138cdb14ced55158a3b5",
    "0xecb91145f7ed41128c538bd4828072c8e3f47f11253f80b252123c6890a3a94f",
]
HASHES = [
    "b14013f8cfb4addf4865667e7ec2d15a27b299e744d3cb6cdf1fed195ca670f5",
    "50a97585f2de6db09fd2b58b0b4df3bbdf4279ee99e22766e7343ab972f9a684",
]
URLS = [
    "https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-25T14.parquet",
    "https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-25T15.parquet",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hour_14", help="Original PMXT June 25 14 UTC Parquet file")
    parser.add_argument("hour_15", help="Original PMXT June 25 15 UTC Parquet file")
    parser.add_argument("output", help="Path for the filtered JSON observations")
    args = parser.parse_args()
    extract([args.hour_14, args.hour_15], HASHES, CONDITIONS, URLS, args.output)


if __name__ == "__main__":
    main()
