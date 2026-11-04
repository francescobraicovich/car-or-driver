"""Evaluate causal recovery from old source events using later full book snapshots."""

import bisect
import json
from datetime import datetime, timedelta
from pathlib import Path

import pyarrow.parquet as parquet

ROOT = Path(__file__).resolve().parents[4]
DIRECTORY = Path(__file__).resolve().parent
manifest = json.loads((DIRECTORY / 'manifest.json').read_text())
race = next(item for item in manifest['races'] if item['id'] == 'italian')
start = datetime.fromisoformat(race['date'])
cutoff = start + timedelta(hours=23)
end = start + timedelta(days=1)
report = {'race': race['id'], 'date': race['date'],
          'definition': 'Source older than receipt by over 120 seconds causes quarantine. Recovery requires a subsequent non-midnight full book with source age between zero and 120 seconds, received strictly after the stale event. A fresh book is not evidence of full feed continuity, executable queue position or correct cancellation latency.',
          'drivers': []}
for driver in race['drivers']:
    market = driver['market']
    if not market:
        continue
    all_events = []
    for kind in ('l2', 'trades'):
        file = driver['files'].get(kind, {})
        if file.get('status') != 'available':
            continue
        data = parquet.read_table(ROOT / file['path'], columns=['timestamp', 'local_timestamp', 'event_type']).to_pydict()
        for source, received, event in zip(data['timestamp'], data['local_timestamp'], data['event_type']):
            if source is None or received is None or not start <= received < end:
                continue
            age = (received - source).total_seconds()
            all_events.append((received, source, event, kind, age))
    books = sorted(received for received, source, event, kind, age in all_events
                   if kind == 'l2' and event == 'book' and (source != start or received != start) and (source != end - timedelta(microseconds=1) or received != end - timedelta(microseconds=1)) and 0 <= age <= 120)
    first = books[0] if books else None
    stale = []
    for received, source, event, kind, age in all_events:
        if age <= 120:
            continue
        index = bisect.bisect_right(books, received)
        next_book = books[index] if index < len(books) else None
        stale.append({'receivedUtc': received.isoformat(), 'sourceUtc': source.isoformat(),
                      'sourceAgeSeconds': age, 'kind': kind, 'event': event,
                      'phase': 'after_quoting' if received >= cutoff else ('pre_initial_snapshot' if first is None or received < first else 'after_initial_snapshot'),
                      'nextFreshSnapshotUtc': next_book.isoformat() if next_book else None,
                      'recoverBeforeQuotingEnds': bool(next_book and next_book < cutoff)})
    report['drivers'].append({'driverId': driver['driverId'], 'name': driver['name'],
                              'firstFreshSnapshotUtc': first.isoformat() if first else None,
                              'initialSnapshotBeforeQuotingEnds': bool(first and first < cutoff),
                              'freshSnapshotsBeforeQuotingEnds': sum(value < cutoff for value in books),
                              'staleEvents': sorted(stale, key=lambda x: x['receivedUtc'])})
(DIRECTORY / 'italian-recovery.json').write_text(json.dumps(report, indent=2) + '\n')
for d in report['drivers']:
    phases = {name: sum(e['phase'] == name for e in d['staleEvents']) for name in ('pre_initial_snapshot', 'after_initial_snapshot', 'after_quoting')}
    unrecovered = sum(not e['recoverBeforeQuotingEnds'] for e in d['staleEvents'] if e['phase'] == 'after_initial_snapshot')
    print(d['name'], 'first=', d['firstFreshSnapshotUtc'], 'fresh books=', d['freshSnapshotsBeforeQuotingEnds'],
          'stale=', phases, 'post-start without recovery=', unrecovered)
