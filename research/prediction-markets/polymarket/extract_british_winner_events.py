"""Extract two British GP race-winner markets from PMXT July 2 hours."""

import argparse

from extract_british_july_01_events import extract

CONDITIONS = [
    "0x1db5a5491de96ac6ca50275331426e6df630aed16a54757a2d8ea46c07a4cf66",
    "0x83edde07b222f24d64b6afb1009c3982835294a3f349ae8c07c784b9ebfeeb93",
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
