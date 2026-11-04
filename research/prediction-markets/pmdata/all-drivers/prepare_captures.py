"""Prepare per-market full-Thursday PMData captures from an audited local manifest."""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from normalize_portfolio_capture import micros, normalize_fills, normalize_market  # noqa: E402


def prepare_driver(driver, start_us, end_us, output):
    market = driver.get('market')
    if market is None:
        raise ValueError('No uniquely matched contract in the market metadata')
    files = driver.get('files', {})
    if files.get('l2', {}).get('status') != 'available':
        raise ValueError('Recorded-day L2 data are unavailable')
    trade_status = files.get('trades', {}).get('status')
    if trade_status not in ('available', 'not_found'):
        raise ValueError('Trade file status is unavailable')
    l2 = pd.read_parquet(files['l2']['path'])
    # PMData states that a trades 404 on a recorded day means no recorded
    # trades. An available L2 file establishes this market-day was recorded.
    trades = pd.read_parquet(files['trades']['path']) if trade_status == 'available' else pd.DataFrame(columns=['market_slug', 'local_timestamp'])
    rows = normalize_market(l2, trades, market, start_us, end_us)
    # Exact day-boundary snapshots can be provider-generated rather than live
    # venue liquidity. The age of the underlying state is not known.
    boundary_start = sum(row['type'] == 'book' and row['receivedUs'] == start_us for row in rows)
    boundary_end = sum(row['type'] == 'book' and row['receivedUs'] == end_us - 1 for row in rows)
    rows = [row for row in rows if not (row['type'] == 'book' and row['receivedUs'] in (start_us, end_us - 1))]
    if not any(row['type'] == 'book' for row in rows):
        raise ValueError('No non-boundary snapshot in the trading window')
    trade_count = sum(row['type'] == 'last_trade_price' for row in rows)
    records = []
    chain_status = files.get('onchain_fills', {}).get('status')
    if chain_status == 'available':
        records = normalize_fills(pd.read_parquet(files['onchain_fills']['path']), market)
    elif chain_status != 'not_found':
        raise ValueError('On-chain file status is unavailable')
    if trade_count and not records:
        raise ValueError('Observed prints lack the on-chain records required for maker-level reconciliation')
    chain_transactions = {record['transactionHash'].lower() for record in records if not record['takerIsExchange']}
    trade_transactions = {row['transactionHash'].lower() for row in rows if row['type'] == 'last_trade_price'}
    unmatched_chain = sorted(chain_transactions - trade_transactions)
    if unmatched_chain:
        # Block timestamps and exchange timestamps may straddle midnight, so a
        # mismatch does not establish loss. It also does not establish continuity.
        raise ValueError(f'{len(unmatched_chain)} on-chain maker transactions lack a same-day trade print; '
                         f'block and exchange timestamps may cross the boundary (example {unmatched_chain[0]})')
    rows.sort(key=lambda row: row['receivedUs'])
    counts = Counter(row['receivedUs'] for row in rows)
    ambiguous = sum(count for count in counts.values() if count > 1)
    prefix = output / driver['driverId']
    capture_path, fills_path = prefix.with_suffix('.capture.json'), prefix.with_suffix('.fills.json')
    capture = {'sources': [{'file': files[kind]['path'], 'sha256': files[kind].get('sha256')}
                           for kind in ('l2', 'trades', 'onchain_fills')
                           if files.get(kind, {}).get('status') == 'available'],
               'rows': rows, 'historicalCoverageVerified': False, 'unsequencedSameTimeRows': ambiguous}
    capture_path.write_text(json.dumps(capture, separators=(',', ':')) + '\n')
    fills_path.write_text(json.dumps(records, separators=(',', ':')) + '\n')
    return {'driverId': driver['driverId'], 'name': driver['name'], 'status': 'prepared',
            'capture': str(capture_path), 'fills': str(fills_path), 'events': len(rows),
            'prints': trade_count, 'tradeFileStatus': trade_status, 'onchainFileStatus': chain_status,
            'onchainRecords': len(records),
            'unsequencedSameTimeRows': ambiguous,
            'excludedBoundarySnapshots': {'start': boundary_start, 'end': boundary_end}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='New output directory')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    manifest = json.loads(args.manifest.read_text())
    result = []
    for race in manifest['races']:
        start = pd.Timestamp(race['date'], tz='UTC')
        end = start + pd.Timedelta(days=1)
        directory = args.output / race['id']
        directory.mkdir()
        drivers = []
        for driver in race['drivers']:
            try:
                drivers.append(prepare_driver(driver, micros(start), micros(end), directory))
            except (ValueError, KeyError, OSError) as error:
                drivers.append({'driverId': driver['driverId'], 'name': driver['name'],
                                'status': 'excluded', 'reason': str(error)})
        result.append({'race': race['id'], 'date': race['date'], 'drivers': drivers})
        print(f"{race['id']}: {sum(d['status'] == 'prepared' for d in drivers)} / {len(drivers)} markets prepared", flush=True)
    (args.output / 'preparation.json').write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
