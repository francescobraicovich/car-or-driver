"""Audit downloaded prints potentially crossing the UTC-midnight blackout."""

import json
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[4]
DIRECTORY = Path(__file__).resolve().parent


def main():
    manifest = json.loads((DIRECTORY / 'manifest.json').read_text())
    result = {'description': 'Trade source before midnight with receipt at or after the two-second pre-midnight cancellation boundary, across both downloaded day files. Unrequested files and source completeness remain unknown.', 'races': []}
    for race in manifest['races']:
        midnight = datetime.fromisoformat(race['dates'][1])
        summary = {'race': race['id'], 'midnightUtc': midnight.isoformat() + 'Z', 'drivers': []}
        for driver in race['drivers']:
            row = {'name': driver['name'], 'files': {}, 'boundaryPrints': []}
            seen = set()
            for day in race['dates']:
                status = driver['days'][day]['trades']
                row['files'][day] = status['status']
                if status['status'] != 'available':
                    continue
                frame = pd.read_parquet(ROOT / status['path'], columns=['timestamp', 'local_timestamp', 'trade_id'])
                matches = frame[(frame.timestamp < midnight) & (frame.local_timestamp >= midnight - timedelta(seconds=2))]
                for item in matches.itertuples():
                    key = (item.trade_id, item.timestamp, item.local_timestamp)
                    if key in seen:
                        continue
                    seen.add(key)
                    row['boundaryPrints'].append({'sourceUtc': item.timestamp.isoformat() + 'Z',
                                                  'receiptUtc': item.local_timestamp.isoformat() + 'Z',
                                                  'transactionHash': item.trade_id, 'fileDay': day})
            summary['drivers'].append(row)
        result['races'].append(summary)
        print(race['id'], 'midnight-boundary prints:', sum(len(driver['boundaryPrints']) for driver in summary['drivers']))
    (DIRECTORY / 'midnight-blackout-audit.json').write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
