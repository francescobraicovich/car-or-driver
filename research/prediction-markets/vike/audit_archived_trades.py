"""Audit selected race-winner trade rows in downloaded Vike Parquet files."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[3]
TMP = ROOT / 'tmp'
ARCHIVE = 'https://data.vike.io/archive/venue=polymarket'
CASES = [
    ('2026-10-22', TMP / 'united-states-2026-gamma-event.json',
     ['norris', 'hamilton', 'leclerc', 'antonelli', 'verstappen', 'piastri', 'russell', 'other']),
    ('2026-08-20', ROOT / 'research/prediction-markets/polymarket/dutch-2026-official-outcomes.json',
     ['norris', 'hamilton']),
]
FILES = {
    ('2026-10-22', 'daily'): (11883841, '43f04dd4e5ae64634ac7ef18cebf1194fefe3939be26c3d46767e082302e0b81'),
    ('2026-10-22', 'other'): (3632563, '96217c80d64d8298bfe73bbde2928117be25a4a8cb4c8629402a1d76cedfc97b'),
    ('2026-08-20', 'daily'): (18193718, 'd4995c929b318a525f37541a218a9ef7bb7caaba7f08f2677f3b64657acda0d7'),
    ('2026-08-20', 'other'): (4069066, 'fa7b9325b3abad279acf48666d3ab41db486a80bf10add2a40e0cba3b3759dc3'),
}


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def parse_list(value):
    return json.loads(value) if isinstance(value, str) else value


def main():
    result = {
        'classification': 'Recorded trades only; not proof of no exchange activity or complete books',
        'timeFilter': 'local_ts >= 14:00:00 UTC and local_ts < 15:00:00 UTC; UTC-day file',
        'datePartitionSource': ARCHIVE,
        'metadataNote': 'Gamma outcome-token and condition IDs; USA metadata contains 29 conditions, Dutch metadata contains two selected conditions',
        'races': [],
    }
    for day, metadata_path, names in CASES:
        markets = json.loads(metadata_path.read_text())['markets']
        selected = []
        for name in names:
            market = next(m for m in markets if f'-{name}-' in m['slug'])
            outcomes = parse_list(market['outcomes'])
            tokens = parse_list(market['clobTokenIds'])
            selected.append({'driver': name, 'conditionId': market['conditionId'],
                             'yesTokenId': tokens[outcomes.index('Yes')]})
        conditions = [m['conditionId'] for m in markets if m.get('conditionId')]
        start = int(datetime.fromisoformat(day + 'T14:00:00+00:00').timestamp() * 1000)
        partitions = []
        for layout in ('daily', 'other'):
            path = TMP / f'vike-{layout}-trades-{day}.parquet'
            size, expected_digest = FILES[(day, layout)]
            if path.stat().st_size != size or digest(path) != expected_digest:
                raise ValueError(f'Size or SHA-256 mismatch: {path}')
            rows = []
            for market in selected:
                counts = duckdb.sql(
                    'SELECT count(*), count(*) FILTER (WHERE local_ts >= ? AND local_ts < ?), '
                    'min(local_ts), max(local_ts) FROM read_parquet(?) WHERE token_id = ?',
                    params=[start, start + 3600000, str(path), market['yesTokenId']],
                ).fetchall()[0]
                rows.append({**market, 'dailyTradeRows': counts[0], 'hourTradeRows': counts[1],
                             'firstReceiptMs': counts[2], 'lastReceiptMs': counts[3]})
            sql = ('SELECT count(*), count(DISTINCT condition_id) FROM read_parquet(?) '
                   'WHERE condition_id IN (' + ','.join('?' for _ in conditions) + ')')
            condition_counts = duckdb.sql(sql, params=[str(path), *conditions]).fetchall()[0]
            prefix = f'{ARCHIVE}/date={day}' if layout == 'daily' else f'{ARCHIVE}/asset=other/tenor=other/date={day}'
            partitions.append({'layout': layout, 'url': prefix + '/trades.parquet', 'bytes': size,
                               'sha256': expected_digest, 'selectedMarkets': rows,
                               'eventConditionsChecked': len(conditions),
                               'eventConditionsWithTrades': condition_counts[1],
                               'eventConditionTradeRows': condition_counts[0]})
        result['races'].append({'utcDate': day, 'windowStartMs': start, 'windowEndMsExclusive': start + 3600000,
                                'metadataSha256': digest(metadata_path), 'partitions': partitions})
    output = ROOT / 'research/prediction-markets/vike/archive-trade-audit.json'
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(f'Wrote trade audit for {len(result["races"])} UTC days; archive coverage remains unverified.')


if __name__ == '__main__':
    main()
