"""Extract two winner markets from a hash-verified PendulumFlow v3 hour."""

import argparse
import hashlib
import json
from decimal import Decimal
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('parquet', help='Downloaded v3 hourly Parquet')
    parser.add_argument('manifest', help='Original manifest for this hour')
    parser.add_argument('metadata', help='Selected official Gamma outcome metadata')
    parser.add_argument('output')
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    with open(args.parquet, 'rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    if digest != manifest.get('sha256'):
        raise ValueError('Hour file does not match the archive manifest SHA-256')
    metadata = json.loads(Path(args.metadata).read_text())
    selected = [m for m in metadata['markets'] if '-norris-' in m['slug'] or '-hamilton-' in m['slug']]
    if len(selected) != 2 or any(len(m['clobTokenIds']) != 2 for m in selected):
        raise ValueError('Expected exactly the two documented winner markets')
    import duckdb

    query = """
        SELECT market, asset_id, event_type, epoch_us(timestamp_received), epoch_ms(timestamp),
               sequence, price, size, side, bids, asks, transaction_hash, fee_rate_bps,
               old_tick_size, new_tick_size
        FROM read_parquet(?) WHERE market IN (?, ?)
        ORDER BY timestamp_received, sequence
    """
    conditions = [bytes.fromhex(m['conditionId'][2:]) for m in selected]
    rows = duckdb.sql(query, params=[args.parquet, *conditions]).fetchall()

    def depth(value):
        return None if value is None else json.dumps([[str(level['price']), str(level['size'])] for level in value])

    events = []
    for condition, asset, kind, received_us, source_ms, sequence, price, size, side, bids, asks, transaction, fee, old_tick, new_tick in rows:
        events.append({
            'condition': '0x' + condition.hex(), 'asset': str(int.from_bytes(asset, 'big')) if asset is not None else None,
            'type': kind, 'received': received_us / 1000 if received_us is not None else None,
            'receivedUs': received_us, 'source': source_ms, 'sequence': str(sequence),
            'price': str(price) if isinstance(price, Decimal) else price,
            'size': str(size) if isinstance(size, Decimal) else size, 'side': side,
            'bids': depth(bids), 'asks': depth(asks),
            'transactionHash': '0x' + transaction.hex() if transaction is not None else None,
            'feeRateBps': fee, 'oldTickSize': str(old_tick) if old_tick is not None else None,
            'newTickSize': str(new_tick) if new_tick is not None else None,
        })
    output = {
        'source': 'PendulumFlow v3, https://archive.pendulumflow.com/formats/v3, CC BY-NC 4.0',
        'sources': [{'url': 'https://dl.pendulumflow.com/v3/' + manifest['hour'] + '/' + manifest['file'], 'sha256': digest}],
        'manifestHour': manifest['hour'], 'coverageComplete': False,
        'description': 'Filtered market observations. Receipt times retain microseconds; source-local sequence is not exchange-global order.',
        'rows': events,
    }
    Path(args.output).write_text(json.dumps(output, indent=2) + '\n')


if __name__ == '__main__':
    main()
