"""Convert PMData L2 and trade rows to the existing conditional capture format.

This is not a completeness audit and does not establish historical queue
positions. The consumer must independently reconcile transaction maker legs.
"""

import argparse
import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path

import pandas as pd

EXCHANGES = {'0xe111180000d2663c0091e4f400237545b87b996b',
             '0xe2222d279d744050d28e00520010520000310f59'}
DRIVERS = ('norris', 'hamilton', 'piastri', 'leclerc')


def micros(value):
    if pd.isna(value):
        raise ValueError('Missing timestamp')
    return int(pd.Timestamp(value).value // 1000)


def levels(prices, sizes):
    if prices is None or sizes is None or len(prices) != len(sizes):
        raise ValueError('Book price and size arrays must have equal length')
    rows = []
    for price, size in zip(prices, sizes):
        if (pd.isna(price) or pd.isna(size) or not math.isfinite(float(price)) or
                not math.isfinite(float(size)) or not 0 < float(price) < 1 or float(size) < 0):
            raise ValueError('Invalid book price or quantity')
        rows.append([float(price), float(size)])
    return json.dumps(rows, separators=(',', ':'))


def normalize_market(l2, trades, market, start_us, end_us):
    if end_us <= start_us:
        raise ValueError('Invalid trading interval')
    if market.get('outcomes') != ['Yes', 'No'] or len(market.get('clobTokenIds', [])) != 2:
        raise ValueError('Expected one identified YES/NO market')
    yes, no = market['clobTokenIds']
    rows = []
    for frame, kind in [(l2, 'l2'), (trades, 'trades')]:
        if 'market_slug' not in frame or frame['market_slug'].isna().any() or not (frame['market_slug'] == market['slug']).all():
            raise ValueError('File market does not match official metadata')
        for record in frame.to_dict('records'):
            receipt = micros(record['local_timestamp'])
            if not start_us <= receipt < end_us:
                continue
            source = micros(record['timestamp'])
            row = {'condition': market['conditionId'], 'received': receipt / 1000,
                   'receivedUs': receipt, 'source': source / 1000}
            event = record['event_type']
            if kind == 'l2' and event == 'book':
                row.update(type='book', asset=yes,
                           bids=levels(record['bid_prices'], record['bid_sizes']),
                           asks=levels(record['ask_prices'], record['ask_sizes']))
            elif kind == 'l2' and event == 'price_change':
                if (record['pc_side'] not in ('BUY', 'SELL') or pd.isna(record['pc_price']) or pd.isna(record['pc_size']) or
                        not math.isfinite(float(record['pc_price'])) or not math.isfinite(float(record['pc_size'])) or
                        not 0 < float(record['pc_price']) < 1 or float(record['pc_size']) < 0):
                    raise ValueError('Invalid price-level update')
                row.update(type='price_change', asset=yes, side=record['pc_side'],
                           price=float(record['pc_price']), size=float(record['pc_size']))
            elif kind == 'trades' and event == 'last_trade_price':
                outcome = str(record['outcome']).lower()
                if outcome not in ('yes', 'no') or record['side'] not in ('BUY', 'SELL'):
                    raise ValueError('Invalid trade outcome or side')
                transaction = record.get('trade_id')
                if not isinstance(transaction, str) or not re.fullmatch(r'0x[0-9a-fA-F]{64}', transaction):
                    raise ValueError('Trade lacks an identifiable transaction')
                if (pd.isna(record['price']) or pd.isna(record['size']) or not math.isfinite(float(record['price'])) or
                        not math.isfinite(float(record['size'])) or not 0 < float(record['price']) < 1 or float(record['size']) <= 0):
                    raise ValueError('Invalid trade price or size')
                row.update(type='last_trade_price', asset=yes if outcome == 'yes' else no,
                           side=record['side'], price=float(record['price']), size=float(record['size']),
                           transactionHash=transaction)
            elif kind == 'l2' and event == 'tick_size_change':
                raise ValueError('Dynamic tick size is not supported by the replay')
            else:
                raise ValueError('Unexpected L2 or trade event during trading')
            rows.append(row)
    ids = [row['transactionHash'].lower() for row in rows if row['type'] == 'last_trade_price']
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate market transaction requires manual reconciliation')
    if not any(row['type'] == 'book' for row in rows):
        raise ValueError('No initial book in the trading window')
    return rows


def inactive_market(market, start_us, end_us, l2, trades, reason):
    """Represent a deliberately unquoted market without inventing depth or fills."""
    if market.get('outcomes') != ['Yes', 'No'] or len(market.get('clobTokenIds', [])) != 2:
        raise ValueError('Expected one identified YES/NO market')
    def window_count(frame):
        return sum(start_us <= micros(value) < end_us for value in frame['local_timestamp'])
    marker = {'condition': market['conditionId'], 'asset': market['clobTokenIds'][0],
              'received': start_us / 1000, 'receivedUs': start_us, 'source': start_us / 1000,
              'type': 'book', 'bids': '[]', 'asks': '[]', 'syntheticInactive': True}
    note = {'condition': market['conditionId'], 'slug': market['slug'], 'reason': reason,
            'discardedL2Rows': window_count(l2), 'discardedTradeRows': window_count(trades)}
    return marker, note


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def normalize_fills(frame, market):
    """Map PMData decoded logs to the existing on-chain maker-record schema."""
    yes, no = market['clobTokenIds']
    rows, seen = [], set()
    for record in frame.to_dict('records'):
        outcome = str(record['outcome']).lower()
        maker_side = record['maker_side']
        taker = record['taker']
        transaction = record['transactionHash']
        log_index = record['_log_index']
        if (outcome not in ('yes', 'no') or maker_side not in ('BUY', 'SELL') or
                not isinstance(taker, str) or not re.fullmatch(r'0x[0-9a-fA-F]{40}', taker) or
                not isinstance(transaction, str) or not re.fullmatch(r'0x[0-9a-fA-F]{64}', transaction) or
                not isinstance(log_index, int) or log_index < 0):
            raise ValueError('Invalid decoded fill identity, side or token')
        identity = (transaction.lower(), log_index)
        if identity in seen:
            raise ValueError('Duplicate decoded transaction log')
        seen.add(identity)
        usd, quantity = float(record['usd_amount']), float(record['token_amount'])
        if not math.isfinite(usd) or not math.isfinite(quantity) or usd < 0 or quantity <= 0:
            raise ValueError('Invalid decoded fill amounts')
        # The provider's values are floats derived from six-decimal chain units;
        # converting back introduces at most half a micro-unit of rounding.
        usd_units, token_units = round(usd * 1_000_000), round(quantity * 1_000_000)
        if token_units <= 0 or max(usd_units, token_units) > 2**53 - 1:
            raise ValueError('Fill amounts exceed supported micro-unit precision')
        buy = maker_side == 'BUY'
        rows.append({'transactionHash': transaction, 'logIndex': log_index,
                     'side': 0 if buy else 1, 'tokenId': yes if outcome == 'yes' else no,
                     'makerAmountFilled': str(usd_units if buy else token_units),
                     'takerAmountFilled': str(token_units if buy else usd_units),
                     'takerIsExchange': taker.lower() in EXCHANGES})
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--official', type=Path, required=True)
    parser.add_argument('--drivers', nargs='+', choices=DRIVERS, default=['norris', 'hamilton'])
    parser.add_argument('--allow-inactive-markets', action='store_true',
                        help='Keep missing or explicitly excluded markets funded but unquoted')
    parser.add_argument('--inactive-driver', action='append', choices=DRIVERS, default=[],
                        help='Exclude this driver for a documented data-quality problem; may be repeated')
    for driver in DRIVERS:
        for kind in ('l2', 'trades', 'fills'):
            parser.add_argument(f'--{driver}-{kind}', type=Path)
    parser.add_argument('--start', required=True, help='Inclusive UTC timestamp')
    parser.add_argument('--end', required=True, help='Exclusive UTC timestamp')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--output-fills', type=Path, required=True)
    args = parser.parse_args()
    if len(set(args.drivers)) != len(args.drivers):
        parser.error('Drivers must be distinct')
    if len(set(args.inactive_driver)) != len(args.inactive_driver) or not set(args.inactive_driver).issubset(args.drivers):
        parser.error('Inactive drivers must be distinct selected drivers')
    if args.inactive_driver and not args.allow_inactive_markets:
        parser.error('Explicitly inactive drivers require --allow-inactive-markets')
    for driver in args.drivers:
        for kind in ('l2', 'trades', 'fills'):
            if getattr(args, f'{driver}_{kind}') is None:
                parser.error(f'--{driver}-{kind} is required for a selected driver')
    if args.output == args.output_fills or args.output.exists() or args.output_fills.exists():
        raise ValueError('Capture and fill output paths must be distinct and new')
    start, end = micros(args.start), micros(args.end)
    official = json.loads(args.official.read_text())
    all_rows, sources, fills, inactive = [], [], [], []
    for driver in args.drivers:
        matching = [market for market in official['markets'] if f'winner-{driver}-' in market['slug']]
        if len(matching) != 1:
            raise ValueError(f'Could not uniquely identify {driver} market')
        l2_path = getattr(args, f'{driver}_l2')
        trade_path = getattr(args, f'{driver}_trades')
        fills_path = getattr(args, f'{driver}_fills')
        l2, trades = pd.read_parquet(l2_path), pd.read_parquet(trade_path)
        if driver in args.inactive_driver:
            marker, note = inactive_market(matching[0], start, end, l2, trades, 'Explicit data-quality exclusion')
            all_rows.append(marker)
            inactive.append(note)
        else:
            try:
                all_rows.extend(normalize_market(l2, trades, matching[0], start, end))
            except ValueError as error:
                if not args.allow_inactive_markets or str(error) != 'No initial book in the trading window':
                    raise
                marker, note = inactive_market(matching[0], start, end, l2, trades, 'No initial book in the trading window')
                all_rows.append(marker)
                inactive.append(note)
        fills.extend(normalize_fills(pd.read_parquet(fills_path), matching[0]))
        for path in (l2_path, trade_path, fills_path):
            sources.append({'file': path.name, 'sha256': digest(path)})
    # PMData exposes microsecond receive times but no universal event sequence.
    # A stable tie order is a sensitivity assumption, not an exchange sequence.
    all_rows.sort(key=lambda row: row['receivedUs'])
    counts = Counter((row['condition'], row['receivedUs']) for row in all_rows)
    ambiguous = sum(count for count in counts.values() if count > 1)
    result = {'sources': sources, 'rows': all_rows, 'historicalCoverageVerified': False,
              'unsequencedSameTimeRows': ambiguous,
              'warning': 'Conditional only: ties lack exchange sequence, queue and coverage are unverified.'}
    if args.allow_inactive_markets:
        result['inactiveMarkets'] = inactive
    with args.output.open('x') as stream:
        json.dump(result, stream, separators=(',', ':'))
        stream.write('\n')
    with args.output_fills.open('x') as stream:
        json.dump(fills, stream, separators=(',', ':'))
        stream.write('\n')
    print(f'Normalized {len(all_rows)} events; {ambiguous} share an unsequenced per-market receipt time.')


if __name__ == '__main__':
    main()
