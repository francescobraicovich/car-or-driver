"""Extract three exchange-summary fee fields from a pinned public Polygon archive."""
import argparse
import json
from pathlib import Path

REVISION = 'f8782fc0c18a4e32b7bdc348ada114e5007a4367'
BASE = 'https://huggingface.co/datasets/wzsg/polymarket-orderfilled-v2/resolve/' + REVISION + '/'
SHARDS = {'austrian': 'event_month=2026-06/data_19.parquet',
          'hungarian': 'event_month=2026-07/part-b090602815-b090652814-5d10329c99e1.parquet'}
EXCHANGE = '0xe2222d279d744050d28e00520010520000310f59'
TRANSACTIONS = {'austrian': [
    '0xefaff17ac4127ae6cd0700bb71977ceae2d19370634a8207830c7da0fd993940',
    '0x937dfe1f3ae14bb62f9857ebf2c38f23b71263197a085fb1d8f887cc557e728d',
    '0x6546245f86e161aea26f2dd114434c35b6313150530f87e2a2800a7e4b1f8e07',
], 'hungarian': [
    '0x288cf3db451dcb2a0b5b34c1c8bc75c3104266d2f5404caf2e57aa586f7f7003',
    '0xf61fac4051a8f14ff81d23207d89b9a9a9b58795c592de50060baadfdc89045b',
]}
COLUMNS = ['timestamp', 'transaction_hash', 'log_index', 'taker', 'side', 'token_id',
           'maker_amount_filled', 'taker_amount_filled', 'fee']


def transform(row):
    return {'timestamp': row['timestamp'], 'transactionHash': row['transaction_hash'],
            'logIndex': row['log_index'], 'side': row['side'], 'tokenId': row['token_id'],
            'makerAmountFilled': row['maker_amount_filled'], 'takerAmountFilled': row['taker_amount_filled'],
            'fee': row['fee']}


def main():
    import fsspec
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--race', choices=SHARDS, required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    events = []
    with fsspec.open(BASE + SHARDS[args.race], 'rb', block_size=1048576).open() as stream:
        archive = pq.ParquetFile(stream)
        for index in range(archive.metadata.num_row_groups):
            hashes = archive.read_row_group(index, columns=['transaction_hash'])
            mask = pc.is_in(hashes.column('transaction_hash'), value_set=pa.array(TRANSACTIONS[args.race]))
            if pc.sum(pc.cast(mask, pa.int64())).as_py():
                rows = archive.read_row_group(index, columns=COLUMNS).filter(mask).to_pylist()
                events.extend(transform(row) for row in rows if row['taker'].lower() == EXCHANGE)
    events.sort(key=lambda row: (row['timestamp'], row['transactionHash'], row['logIndex']))
    if len(events) != len(TRANSACTIONS[args.race]):
        raise ValueError('Expected exactly one exchange-summary row per transaction')
    Path(args.output).write_text(json.dumps(events, indent=2) + '\n')
    print(f'{len(events)} exchange-summary fee observations')


if __name__ == '__main__':
    main()
