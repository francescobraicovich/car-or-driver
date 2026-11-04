"""Audit one PMData winner-market window; never certify feed completeness."""

import argparse
import bisect
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from math import isfinite
from pathlib import Path


def _number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and isfinite(value)


def _levels(prices, sizes):
    if prices is None or sizes is None or len(prices) != len(sizes):
        raise ValueError('Snapshot price/size arrays must have equal lengths')
    book = {}
    for price, size in zip(prices, sizes):
        if not _number(price) or not 0 < price < 1 or not _number(size) or size <= 0 or price in book:
            raise ValueError('Snapshot contains an invalid or duplicate price level')
        book[price] = size
    return book


def _best(book, side):
    return (max(book) if side == 'BUY' else min(book)) if book else None


def _same(a, b):
    return a.keys() == b.keys() and all(abs(a[p] - b[p]) < 1e-7 for p in a)


def compare_chain(selected_trades, chain):
    hashes = {str(r['trade_id']).lower() for r in selected_trades if r.get('trade_id')}
    if chain is None:
        return {'status': 'not supplied'}
    chain_hashes = {str(r.get('transactionHash')).lower() for r in chain if r.get('transactionHash')}
    if not hashes:
        return {'status': 'not comparable: trade hashes absent', 'chain_hashes': len(chain_hashes)}
    return {'status': 'partial hash comparison only; block and match times differ',
            'tape_hashes': len(hashes), 'tape_hashes_absent_from_chain_file': len(hashes - chain_hashes),
            'chain_hashes_not_in_window_tape': len(chain_hashes - hashes)}


def audit(l2, trades, start, end, first_practice, chain=None):
    """Inspect order, book continuity and transaction IDs; time values are UTC datetimes."""
    if not start < end < first_practice:
        raise ValueError('Window must end strictly before first practice')
    counts = Counter()
    notes = Counter()
    slugs = set()
    for name, rows in (('l2', l2), ('trades', trades)):
        previous_local = previous_source = None
        for row in rows:
            t, source = row.get('local_timestamp'), row.get('timestamp')
            if not isinstance(t, datetime) or not isinstance(source, datetime):
                raise ValueError('Rows must have source and local datetimes')
            if previous_local is not None:
                notes[name + '_receipt_reversals'] += t < previous_local
                notes[name + '_receipt_ties'] += t == previous_local
                notes[name + '_source_reversals'] += source < previous_source
                if start <= t < end:
                    notes[name + '_window_receipt_reversals'] += t < previous_local
                    notes[name + '_window_receipt_ties'] += t == previous_local
                    notes[name + '_window_source_reversals'] += source < previous_source
            notes[name + '_source_after_receipt'] += source > t
            previous_local, previous_source = t, source
            if row.get('market_slug'):
                slugs.add(row['market_slug'])
    if len(slugs) != 1:
        raise ValueError('One consistent market slug is required')
    selected_trades = []
    for row in trades:
        if not start <= row['local_timestamp'] < end:
            continue
        if (row.get('event_type') != 'last_trade_price' or str(row.get('outcome')).lower() not in ('yes', 'no')
                or row.get('side') not in ('BUY', 'SELL') or not _number(row.get('price'))
                or not 0 < row['price'] < 1 or not _number(row.get('size')) or row['size'] <= 0):
            raise ValueError('Invalid trade row')
        selected_trades.append(row)
        counts['trades'] += 1
        counts['trades_without_transaction_hash'] += not bool(row.get('trade_id'))
    # Events are assessed in recorded file order. Ties or reversals remain visible,
    # so this never proves exchange ordering. The latest preceding snapshot starts reconstruction.
    active = False
    initial_before_start = False
    bid = ask = {}
    last_book_at = None
    trade_times = sorted(r['local_timestamp'] for r in trades if isinstance(r.get('local_timestamp'), datetime))
    for row in l2:
        t = row['local_timestamp']
        if t >= end:
            continue
        kind = row.get('event_type')
        if kind not in ('book', 'price_change', 'tick_size_change', 'market_resolved'):
            raise ValueError('Unknown L2 event or stream-health marker')
        if start <= t < end:
            counts[kind] += 1
        if kind in ('tick_size_change', 'market_resolved'):
            if start <= t < end:
                notes['unsupported_' + kind] += 1
            continue
        if kind == 'book':
            new_bid = _levels(row.get('bid_prices'), row.get('bid_sizes'))
            new_ask = _levels(row.get('ask_prices'), row.get('ask_sizes'))
            if active and start <= t < end and not (_same(bid, new_bid) and _same(ask, new_ask)):
                index = bisect.bisect_left(trade_times, last_book_at)
                if index < len(trade_times) and trade_times[index] <= t:
                    notes['snapshot_disagreements_with_observed_trade'] += 1
                else:
                    notes['snapshot_disagreements_without_observed_trade'] += 1
            bid, ask = new_bid, new_ask
            active, last_book_at = True, t
            if t <= start:
                initial_before_start = True
        else:
            if not active:
                if start <= t < end:
                    notes['updates_before_snapshot'] += 1
                continue
            price, size, side = row.get('pc_price'), row.get('pc_size'), row.get('pc_side')
            if side not in ('BUY', 'SELL') or not _number(price) or not 0 < price < 1 or not _number(size) or size < 0:
                raise ValueError('Invalid price change')
            target = bid if side == 'BUY' else ask
            if size == 0:
                target.pop(price, None)
            else:
                target[price] = size
            if start <= t < end:
                for label, book, sd in (('best_bid', bid, 'BUY'), ('best_ask', ask, 'SELL')):
                    reported, reconstructed = row.get(label), _best(book, sd)
                    if reported is not None and reconstructed is not None and abs(reported - reconstructed) > 1e-7:
                        notes['reported_' + label + '_disagreements'] += 1
        if start <= t < end and bid and ask and max(bid) >= min(ask):
            notes['crossed_or_locked_book_events'] += 1
    counts['initial_snapshot_at_or_before_start'] = int(initial_before_start)
    # Chain times are block-inclusion times, not match times. Only compare when
    # the tape carries transaction hashes, and never assert an exact match time.
    chain_check = compare_chain(selected_trades, chain)
    return {'market_slug': next(iter(slugs)), 'window_start': start.isoformat(), 'window_end_exclusive': end.isoformat(),
            'first_practice': first_practice.isoformat(), 'counts': dict(counts), 'diagnostics': dict(notes),
            'chain_check': chain_check, 'coverage_complete': False,
            'warning': 'No feed continuity, trade completeness, queue position or execution is proven by this audit.'}


def _utc(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Timestamp must include a UTC offset')
    return result.astimezone(timezone.utc).replace(tzinfo=None)


def _read(path):
    import duckdb
    connection = duckdb.connect()
    try:
        result = connection.execute('SELECT * FROM read_parquet(?)', [str(path)])
        names = [entry[0] for entry in result.description]
        return [dict(zip(names, values)) for values in result.fetchall()]
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--l2', type=Path, required=True)
    parser.add_argument('--trades', type=Path, required=True)
    parser.add_argument('--onchain', type=Path)
    parser.add_argument('--start', type=_utc, required=True)
    parser.add_argument('--end', type=_utc, required=True)
    parser.add_argument('--first-practice', type=_utc, required=True)
    args = parser.parse_args()
    report = audit(_read(args.l2), _read(args.trades), args.start, args.end, args.first_practice,
                   _read(args.onchain) if args.onchain else None)
    report['files'] = {}
    for path in [args.l2, args.trades] + ([args.onchain] if args.onchain else []):
        with path.open('rb') as source:
            report['files'][str(path)] = hashlib.file_digest(source, 'sha256').hexdigest()
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
