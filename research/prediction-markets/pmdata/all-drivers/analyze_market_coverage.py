"""Audit full-Thursday market-data coverage and snapshot availability."""

import json
from datetime import datetime, timedelta
from pathlib import Path

import pyarrow.parquet as parquet

ROOT = Path(__file__).resolve().parents[4]
DIRECTORY = Path(__file__).resolve().parent
manifest = json.loads((DIRECTORY / 'manifest.json').read_text())
report = {'window': '[00:00, 24:00) UTC Thursday', 'races': []}
for race in manifest['races']:
    start = datetime.fromisoformat(race['date'])
    end = start + timedelta(days=1)
    summary = {'id': race['id'], 'date': race['date'], 'drivers': []}
    for driver in race['drivers']:
        record = {'name': driver['name'], 'driverId': driver['driverId'],
                  'marketStatus': 'matched' if driver['market'] else 'unmatched',
                  'files': {k: v['status'] for k, v in driver['files'].items()}}
        if driver['market']:
            record['marketSlug'] = driver['market']['slug']
        book = driver['files'].get('l2', {})
        if book.get('status') == 'available':
            path = ROOT / book['path']
            source = parquet.ParquetFile(path)
            columns = ['timestamp', 'local_timestamp', 'event_type', 'bid_prices', 'ask_prices', 'best_bid', 'best_ask']
            first_snapshot = first_non_boundary_snapshot = first_two_sided_snapshot = first_event = last_quote = None
            boundary_snapshots = snapshot_count = event_count = 0
            maximum_delay = 0.0
            minimum_delay = 0.0
            negative_delays = stale_delays = 0
            for batch in source.iter_batches(batch_size=32768, columns=columns):
                rows = batch.to_pydict()
                for i, event in enumerate(rows['event_type']):
                    timestamp, received = rows['timestamp'][i], rows['local_timestamp'][i]
                    if timestamp is None or received is None or not start <= received < end:
                        continue
                    event_count += 1
                    if first_event is None or received < first_event:
                        first_event = received
                    delay = (received - timestamp).total_seconds()
                    maximum_delay = max(maximum_delay, delay)
                    minimum_delay = min(minimum_delay, delay)
                    negative_delays += delay < 0
                    stale_delays += delay > 120
                    if event == 'book':
                        snapshot_count += 1
                        if received == start:
                            boundary_snapshots += 1
                        if first_snapshot is None or received < first_snapshot:
                            first_snapshot = received
                        if (timestamp != start or received != start) and (first_non_boundary_snapshot is None or received < first_non_boundary_snapshot):
                            first_non_boundary_snapshot = received
                        if rows['bid_prices'][i] and rows['ask_prices'][i]:
                            if first_two_sided_snapshot is None or received < first_two_sided_snapshot:
                                first_two_sided_snapshot = received
                    if event == 'book' or rows['best_bid'][i] is not None or rows['best_ask'][i] is not None:
                        if last_quote is None or received > last_quote:
                            last_quote = received
            record.update({'eventsInWindow': event_count, 'snapshotsInWindow': snapshot_count,
                'firstEventUtc': first_event.isoformat() if first_event else None,
                'firstSnapshotUtc': first_snapshot.isoformat() if first_snapshot else None,
                'firstNonBoundarySnapshotUtc': first_non_boundary_snapshot.isoformat() if first_non_boundary_snapshot else None,
                'secondsUntilFirstNonBoundarySnapshot': (first_non_boundary_snapshot - start).total_seconds() if first_non_boundary_snapshot else None,
                'firstTwoSidedSnapshotUtc': first_two_sided_snapshot.isoformat() if first_two_sided_snapshot else None,
                'secondsUntilFirstSnapshot': (first_snapshot - start).total_seconds() if first_snapshot else None,
                'lastQuoteReceivedUtc': last_quote.isoformat() if last_quote else None,
                'secondsSinceLastQuoteAtEnd': (end - last_quote).total_seconds() if last_quote else None,
                'maximumReceiptDelaySeconds': maximum_delay,
                'minimumReceiptDelaySeconds': minimum_delay,
                'negativeReceiptDelayEvents': negative_delays,
                'receiptDelayOver120SecondsEvents': stale_delays,
                'snapshotsExactlyAtBoundary': boundary_snapshots})
        record['tradePrintsInWindow'] = driver['files'].get('trades', {}).get('rowsInWindow')
        summary['drivers'].append(record)
    report['races'].append(summary)
    available = sum(d['files'].get('l2') == 'available' for d in summary['drivers'])
    snapshots = sum(d.get('snapshotsInWindow', 0) > 0 for d in summary['drivers'])
    print(race['id'], 'books', available, 'with snapshots', snapshots,
          'trade prints', sum(d.get('tradePrintsInWindow') or 0 for d in summary['drivers']), flush=True)
(DIRECTORY / 'coverage.json').write_text(json.dumps(report, indent=2) + '\n')
