"""Extract a Belgian GP matchup recording from the PMXT July 16 hours."""

import argparse

from extract_british_july_01_events import extract

CONDITION = "0x201837def9546e36162485a032d42e122e0fc178e3edd101829f023229c9353b"
HASHES = [
    "7b6fb054149f636ffa6313413bf2020cec71264464668c4cae1edb99717c24ff",
    "5cc1441d76b93b904635e6e37a4038147b52b45ef71bb6c89aaacd4f2061f23e",
]
URLS = [
    "https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-16T10.parquet",
    "https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-16T11.parquet",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hour_10", help="Original PMXT July 16 10 UTC Parquet file")
    parser.add_argument("hour_11", help="Original PMXT July 16 11 UTC Parquet file")
    parser.add_argument("output", help="Path for the filtered JSON observations")
    args = parser.parse_args()
    extract([args.hour_10, args.hour_11], HASHES, [CONDITION, CONDITION], URLS, args.output)


if __name__ == "__main__":
    main()
