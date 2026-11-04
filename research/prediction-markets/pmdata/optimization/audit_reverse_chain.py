"""Compare PMData on-chain maker hashes to websocket prints in fixed race windows."""

import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import audit_teammate_windows as shared
from audit_l2 import _read

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'tmp/pmdata'
OUTPUT = Path(__file__).with_name('reverse-chain-audit.json')
EXCHANGES = {'0xe111180000d2663c0091e4f400237545b87b996b',
             '0xe2222d279d744050d28e00520010520000310f59'}
CASES = [('canadian','2026-05-21'),('monaco','2026-06-04'),('barcelona','2026-06-11'),
         ('austrian','2026-06-25'),('british','2026-07-02'),('belgian','2026-07-16'),
         ('hungarian','2026-07-23'),('dutch','2026-08-20'),('italian','2026-09-03'),('singapore','2026-10-08')]
DRIVERS = ('norris','piastri','hamilton','leclerc')


def main():
    reports = []
    for race, day in CASES:
        start = datetime.fromisoformat(day + 'T14:00:00')
        end = start + timedelta(hours=2)
        for driver in DRIVERS:
            prefix = DATA / f'{race}-{day}-{driver}'
            trades = _read(Path(str(prefix) + '-trades.parquet'))
            fills = _read(Path(str(prefix) + '-onchain_fills.parquet'))
            prints = defaultdict(list)
            missing_ids = 0
            for row in trades:
                hash_value, at = row.get('trade_id'), row['local_timestamp']
                if hash_value:
                    prints[hash_value.lower()].append(at)
                elif start <= at < end:
                    missing_ids += 1
            in_window = {h for h, times in prints.items() if any(start <= t < end for t in times)}
            groups = defaultdict(list)
            for row in fills:
                timestamp, taker = row['timestamp'], str(row.get('taker','')).lower()
                if start - timedelta(seconds=60) <= timestamp < end + timedelta(seconds=60) and taker not in EXCHANGES:
                    groups[row['transactionHash'].lower()].append(row)
            boundary, unexplained, boundary_uncertain = [], [], []
            for hash_value, legs in groups.items():
                if hash_value in in_window:
                    continue
                block = min(row['timestamp'] for row in legs)
                match_times = prints.get(hash_value, [])
                row = {'transactionHash': hash_value, 'blockTimeUtc': block.isoformat() + 'Z',
                       'matchingPrintReceiptTimesUtc': [t.isoformat() + 'Z' for t in match_times],
                       'makerLegs': [{'outcome': leg['outcome'], 'makerSide': leg['maker_side'],
                                      'price': leg['price'], 'shares': leg['token_amount']} for leg in legs]}
                if match_times:
                    boundary.append(row)
                elif start <= block < end:
                    unexplained.append(row)
                else:
                    boundary_uncertain.append(row)
            reports.append({'race':race, 'day':day, 'driver':driver, 'windowStartUtc':start.isoformat()+'Z',
                            'windowEndUtcExclusive':end.isoformat()+'Z', 'windowTradeHashes':len(in_window),
                            'windowTradesWithoutId':missing_ids, 'makerHashesBuffered':len(groups),
                            'matchedPrintOutsideWindow':boundary, 'unexplainedWithinWindow':unexplained,
                            'unexplainedInBufferOnly':boundary_uncertain})
    result = {'description':'Same-provider PMData chain-to-websocket hash comparison; block time is not exchange match time, '
                           'so unmatched rows are potential gaps rather than proof of a fill at that time. '
                           '±60 seconds buffer; no coverage completeness claimed.', 'reports':reports}
    OUTPUT.write_text(json.dumps(result,indent=2)+'\n')
    print(f'Audited {len(reports)} market windows; potential gaps are not proof of exact match timing.')


if __name__ == '__main__':
    main()
