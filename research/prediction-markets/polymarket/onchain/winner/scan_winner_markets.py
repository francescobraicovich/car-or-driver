"""Scan recorded race-winner token fills in four pre-FP1 windows."""
import argparse
import concurrent.futures
from datetime import datetime
import json
from pathlib import Path
import sys

DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(DIRECTORY.parent))
from scan_additional_races import WINDOWS, scan_shard  # noqa: E402

WINNER_WINDOWS = {**WINDOWS, 'british': ('2026-07', '2026-07-01T00:00:00+00:00', '2026-07-03T11:30:00+00:00')}


def winner_windows(markets):
    return {name: (month, int(datetime.fromisoformat(start).timestamp()), int(datetime.fromisoformat(end).timestamp()),
                   {outcome['tokenId'] for market in markets[name] for outcome in market['outcomes']})
            for name, (month, start, end) in WINNER_WINDOWS.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    markets = json.loads((DIRECTORY / 'outcome-identifiers.json').read_text())
    windows = winner_windows(markets)
    shards = json.loads((DIRECTORY.parent / 'additional-shards.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        events = [event for result in executor.map(lambda shard: scan_shard(shard, windows), shards) for event in result]
    events.sort(key=lambda event: (event['timestamp'], event['blockNumber'], event['transactionHash'], event['logIndex']))
    Path(args.output).write_text(json.dumps(events, indent=2) + '\n')
    print(f'{len(events)} on-chain event rows for the four race-winner groups')


if __name__ == '__main__':
    main()
