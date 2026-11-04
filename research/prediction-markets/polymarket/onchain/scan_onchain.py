"""Scan the pinned public Polygon fill archive for British GP outcome tokens."""
import argparse
import concurrent.futures
import json
from pathlib import Path

REVISION = 'f8782fc0c18a4e32b7bdc348ada114e5007a4367'
BASE = f'https://huggingface.co/datasets/wzsg/polymarket-orderfilled-v2/resolve/{REVISION}/'
EXCHANGES = {
    '0xe111180000d2663c0091e4f400237545b87b996b',
    '0xe2222d279d744050d28e00520010520000310f59',
}
COLUMNS = ['timestamp', 'block_number', 'transaction_hash', 'log_index', 'contract', 'taker', 'side', 'token_id', 'maker_amount_filled', 'taker_amount_filled']
START = 1782864000  # 2026-07-01 00:00 UTC
END = 1783078200  # first practice, exclusive
DIRECTORY = Path(__file__).resolve().parent


def normalize(row):
    """Retain the factual event fields and flag exchange summary rows."""
    return {'timestamp': row['timestamp'], 'blockNumber': row['block_number'],
            'transactionHash': row['transaction_hash'], 'logIndex': row['log_index'],
            'contract': row['contract'], 'side': row['side'], 'tokenId': row['token_id'],
            'makerAmountFilled': row['maker_amount_filled'], 'takerAmountFilled': row['taker_amount_filled'],
            'takerIsExchange': row['taker'].lower() in EXCHANGES}


def scan_shard(shard, tokens):
    import fsspec
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq

    results = []
    with fsspec.open(BASE + shard['path'], 'rb', block_size=1048576).open() as stream:
        parquet = pq.ParquetFile(stream)
        for index in range(parquet.metadata.num_row_groups):
            statistics = parquet.metadata.row_group(index).column(0).statistics
            if statistics is None:
                raise ValueError('Missing timestamp statistics; cannot safely prune the row group')
            if statistics.max < START or statistics.min >= END:
                continue
            identifiers = parquet.read_row_group(index, columns=['token_id'])
            mask = pc.is_in(identifiers.column('token_id'), value_set=pa.array(tokens))
            if pc.sum(pc.cast(mask, pa.int64())).as_py():
                table = parquet.read_row_group(index, columns=COLUMNS).filter(mask)
                results.extend(normalize(row) for row in table.to_pylist() if START <= row['timestamp'] < END)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    markets = json.loads((DIRECTORY / 'british-2026-outcome-identifiers.json').read_text())
    tokens = [outcome['tokenId'] for market in markets for outcome in market['outcomes']]
    shards = json.loads((DIRECTORY / 'shards.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        results = [event for events in executor.map(lambda shard: scan_shard(shard, tokens), shards) for event in events]
    results.sort(key=lambda event: (event['timestamp'], event['blockNumber'], event['transactionHash'], event['logIndex']))
    Path(args.output).write_text(json.dumps(results, indent=2) + '\n')
    print(f'{len(results)} on-chain events for {len(markets)} matchups, before FP1')


if __name__ == '__main__':
    main()
