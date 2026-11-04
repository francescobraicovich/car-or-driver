"""Audit timestamps, snapshots and same-provider chain-to-print coverage offline."""

import json
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[4]
DIRECTORY = Path(__file__).resolve().parent
EXCHANGES = {'0xe111180000d2663c0091e4f400237545b87b996b',
             '0xe2222d279d744050d28e00520010520000310f59'}
WINDOWS = {'monaco': (('2026-06-06T00:00:00', '2026-06-06T14:00:00'),
                      ('2026-06-07T10:00:00', '2026-06-07T13:00:00')),
           'singapore': (('2026-10-10T00:00:00', '2026-10-10T13:00:00'),
                         ('2026-10-11T09:00:00', '2026-10-11T12:00:00'))}


def read(path, columns):
    return pd.read_parquet(ROOT / path, columns=columns)


def main():
    manifest = json.loads((DIRECTORY / 'manifest.json').read_text())
    report = {'description': 'Per-window audit; source age uses receipt minus venue timestamp. Chain blocks and exchange receipt times differ, so unmatched hashes indicate possible gaps, not proven precise fill times. Completeness and ordering are unverified.', 'races': []}
    for race in manifest['races']:
        output = {'id': race['id'], 'windows': []}
        for date, (start_text, end_text) in zip(race['dates'], WINDOWS[race['id']]):
            start, end = datetime.fromisoformat(start_text), datetime.fromisoformat(end_text)
            day_start = datetime.fromisoformat(date)
            day_end = day_start + timedelta(days=1)
            window = {'date': date, 'startUtc': start_text + 'Z', 'endUtcExclusive': end_text + 'Z', 'drivers': []}
            for driver in race['drivers']:
                files = driver['days'][date]
                result = {'driverId': driver['driverId'], 'name': driver['name'],
                          'statuses': {kind: files.get(kind, {}).get('status', 'not_requested')
                                       for kind in ('l2', 'trades', 'onchain_fills')}}
                if files.get('l2', {}).get('status') == 'available':
                    frame = read(files['l2']['path'], ['event_type', 'timestamp', 'local_timestamp'])
                    frame = frame[(frame.local_timestamp >= start) & (frame.local_timestamp < end)]
                    age = (frame.local_timestamp - frame.timestamp).dt.total_seconds()
                    books = frame[(frame.event_type == 'book') & (frame.local_timestamp != day_start)]
                    result['l2'] = {'events': len(frame), 'books': len(books),
                                    'firstBookUtc': None if books.empty else books.local_timestamp.min().isoformat() + 'Z',
                                    'lastBookUtc': None if books.empty else books.local_timestamp.max().isoformat() + 'Z',
                                    'olderThan120Seconds': int((age > 120).sum()),
                                    'negativeAge': int((age < 0).sum()),
                                    'futureSourceOver5ms': int((age < -0.005).sum()),
                                    'maxFutureSourceLeadMs': None if age.empty or age.isna().all() else max(0.0, float(-age.min() * 1000)),
                                    'missingTimestamp': int(age.isna().sum()),
                                    'maxAgeSeconds': None if age.empty or age.isna().all() else float(age.max()),
                                    'eventCounts': {str(key): int(value) for key, value in frame.event_type.value_counts().items()}}
                hashes = {}
                for kind in ('trades', 'onchain_fills'):
                    if files.get(kind, {}).get('status') == 'not_found':
                        hashes[kind] = set()
                    elif files.get(kind, {}).get('status') == 'available':
                        if kind == 'trades':
                            frame = read(files[kind]['path'], ['timestamp', 'local_timestamp', 'trade_id'])
                            values = frame[(frame.local_timestamp >= day_start) & (frame.local_timestamp < day_end)]
                            within = values[(values.local_timestamp >= start) & (values.local_timestamp < end)]
                            trade_age = (within.local_timestamp - within.timestamp).dt.total_seconds()
                            result['trades'] = {'windowRows': len(within), 'missingWindowIds': int(within.trade_id.isna().sum()),
                                                'negativeAge': int((trade_age < 0).sum()),
                                                'futureSourceOver5ms': int((trade_age < -0.005).sum()),
                                                'maxFutureSourceLeadMs': None if trade_age.empty or trade_age.isna().all() else max(0.0, float(-trade_age.min() * 1000)),
                                                'delayOverOneSecond': int((trade_age > 1).sum()),
                                                'maxReceiptDelaySeconds': None if trade_age.empty or trade_age.isna().all() else float(trade_age.max()),
                                                'olderThan120Seconds': int((trade_age > 120).sum()),
                                                'missingTimestamp': int(trade_age.isna().sum())}
                            hashes[kind] = {str(value).lower() for value in values.trade_id.dropna() if value}
                        else:
                            frame = read(files[kind]['path'], ['timestamp', 'transactionHash', 'taker'])
                            values = frame[(frame.timestamp >= day_start) & (frame.timestamp < day_end) &
                                           (~frame.taker.astype(str).str.lower().isin(EXCHANGES))]
                            within = values[(values.timestamp >= start) & (values.timestamp < end)]
                            hashes[kind] = {str(value).lower() for value in values.transactionHash.dropna() if value}
                            result['chain'] = {'windowMakerRows': len(within), 'missingWindowIds': int(within.transactionHash.isna().sum())}
                            result['_chainWindowHashes'] = {str(value).lower() for value in within.transactionHash.dropna() if value}
                if len(hashes) == 2:
                    result['chainOnlySameDay'] = len(hashes['onchain_fills'] - hashes['trades'])
                    result['chainOnlyWindow'] = len(result.pop('_chainWindowHashes', set()) - hashes['trades'])
                else:
                    result.pop('_chainWindowHashes', None)
                window['drivers'].append(result)
            output['windows'].append(window)
            print(race['id'], date, 'books', sum(bool(row.get('l2', {}).get('books')) for row in window['drivers']),
                  'chain-only in window', sum(row.get('chainOnlyWindow', 0) for row in window['drivers']), flush=True)
        report['races'].append(output)
    (DIRECTORY / 'window-coverage.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
