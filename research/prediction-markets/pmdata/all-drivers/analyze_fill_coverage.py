"""Compare transaction identifiers observed on-chain and in WebSocket prints."""

import json
from datetime import datetime, timedelta
from pathlib import Path

import pyarrow.parquet as parquet

ROOT = Path(__file__).resolve().parents[4]
DIRECTORY = Path(__file__).resolve().parent
EXCHANGES = {'0xe111180000d2663c0091e4f400237545b87b996b',
             '0xe2222d279d744050d28e00520010520000310f59'}
manifest = json.loads((DIRECTORY / 'manifest.json').read_text())
report = {'interpretation': 'Same-day transaction-hash comparison only; Block timestamps, transaction batching, and UTC boundaries can cause differences; exchange-summary taker rows are excluded. Chain fills cannot be treated as timely WebSocket observations.', 'races': []}
for race in manifest['races']:
    start = datetime.fromisoformat(race['date'])
    end = start + timedelta(days=1)
    summary = {'id': race['id'], 'drivers': []}
    for driver in race['drivers']:
        ws = driver['files'].get('trades', {})
        chain = driver['files'].get('onchain_fills', {})
        book = driver['files'].get('l2', {})
        if book.get('status') != 'available' or ws.get('status') not in ('available', 'not_found') or chain.get('status') not in ('available', 'not_found'):
            continue
        def hashes(file, column, chain_data=False):
            if file['status'] == 'not_found':
                return [], 0
            columns = ['timestamp', column, 'taker'] if chain_data else ['local_timestamp', column]
            data = parquet.read_table(ROOT / file['path'], columns=columns).to_pydict()
            time_column = 'timestamp' if chain_data else 'local_timestamp'
            rows = [(timestamp, value) for i, (timestamp, value) in enumerate(zip(data[time_column], data[column])) if timestamp is not None and start <= timestamp < end and (not chain_data or str(data['taker'][i]).lower() not in EXCHANGES)]
            return [value.lower() for _, value in rows if isinstance(value, str) and value], len(rows)
        ws_hashes, ws_rows = hashes(ws, 'trade_id')
        chain_hashes, chain_rows = hashes(chain, 'transactionHash', chain_data=True)
        ws_set, chain_set = set(ws_hashes), set(chain_hashes)
        unmatched = []
        if chain.get('status') == 'available' and chain_set - ws_set:
            details = parquet.read_table(ROOT / chain['path'], columns=['timestamp', 'transactionHash', 'taker', 'token_amount']).to_pylist()
            for transaction in sorted(chain_set - ws_set):
                legs = [row for row in details if row['transactionHash'] and row['transactionHash'].lower() == transaction and str(row['taker']).lower() not in EXCHANGES and start <= row['timestamp'] < end]
                block = min(row['timestamp'] for row in legs)
                unmatched.append({'transactionHash': transaction, 'blockTimeUtc': block.isoformat(),
                                  'secondsFromNearestBoundary': min((block - start).total_seconds(), (end - block).total_seconds()),
                                  'makerLegs': len(legs), 'makerShares': sum(row['token_amount'] or 0 for row in legs)})
        summary['drivers'].append({'name': driver['name'], 'driverId': driver['driverId'],
            'wsStatus': ws['status'], 'chainStatus': chain['status'], 'wsRows': ws_rows,
            'chainRows': chain_rows, 'wsRowsMissingHash': ws_rows - len(ws_hashes),
            'chainRowsMissingHash': chain_rows - len(chain_hashes),
            'wsTransactions': len(ws_set), 'chainTransactions': len(chain_set),
            'matchedTransactions': len(ws_set & chain_set),
            'wsOnlyTransactions': len(ws_set - chain_set),
            'chainOnlyTransactions': len(chain_set - ws_set), 'chainOnlyDetails': unmatched})
    report['races'].append(summary)
    print(race['id'], 'compared', len(summary['drivers']),
          'chain-only tx', sum(d['chainOnlyTransactions'] for d in summary['drivers']),
          'websocket-only tx', sum(d['wsOnlyTransactions'] for d in summary['drivers']), flush=True)
(DIRECTORY / 'fill-coverage.json').write_text(json.dumps(report, indent=2) + '\n')
