"""Audit recorded trade prints delayed across the qualifying cancellation boundary."""

import json
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[4]
DIRECTORY = Path(__file__).resolve().parent
STARTS = {'monaco': '2026-06-06T14:00:00', 'singapore': '2026-10-10T13:00:00'}


def main():
    manifest = json.loads((DIRECTORY / 'manifest.json').read_text())
    result = {'description': 'Trade source before qualifying, local receipt at or after two seconds before qualifying, and receipt delay over one second. Unrequested files and source completeness remain unknown.', 'races': []}
    for race in manifest['races']:
        start = datetime.fromisoformat(STARTS[race['id']])
        day = race['dates'][0]
        summary = {'race': race['id'], 'qualifyingStartUtc': STARTS[race['id']] + 'Z', 'drivers': []}
        for driver in race['drivers']:
            status = driver['days'][day]['trades']
            row = {'name': driver['name'], 'status': status['status'], 'boundaryPrints': []}
            if status['status'] == 'available':
                frame = pd.read_parquet(ROOT / status['path'], columns=['timestamp', 'local_timestamp', 'trade_id'])
                lag = (frame.local_timestamp - frame.timestamp).dt.total_seconds()
                matches = frame[(frame.local_timestamp >= start - timedelta(seconds=2)) & (frame.timestamp < start) & (lag > 1)]
                row['boundaryPrints'] = [{'sourceUtc': item.timestamp.isoformat() + 'Z',
                                          'receiptUtc': item.local_timestamp.isoformat() + 'Z',
                                          'transactionHash': item.trade_id}
                                         for item in matches.itertuples()]
            summary['drivers'].append(row)
        result['races'].append(summary)
        print(race['id'], 'qualifying-boundary delayed prints:',
              sum(len(driver['boundaryPrints']) for driver in summary['drivers']))
    (DIRECTORY / 'qualifying-blackout-audit.json').write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
