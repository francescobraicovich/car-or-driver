"""Scan three additional races' pre-practice Polygon fill windows."""
import argparse
import concurrent.futures
from datetime import datetime
import json
from pathlib import Path

from scan_onchain import BASE, COLUMNS, normalize

DIRECTORY = Path(__file__).resolve().parent
WINDOWS = {
    'austrian': ('2026-06', '2026-06-24T00:00:00+00:00', '2026-06-26T11:30:00+00:00'),
    'belgian': ('2026-07', '2026-07-15T00:00:00+00:00', '2026-07-17T11:30:00+00:00'),
    'hungarian': ('2026-07', '2026-07-22T00:00:00+00:00', '2026-07-24T11:30:00+00:00'),
}


def race_windows(markets):
    """Combine UTC selection windows with their exact outcome-token IDs."""
    return {name: (month, int(datetime.fromisoformat(start).timestamp()), int(datetime.fromisoformat(end).timestamp()),
                   {outcome['tokenId'] for market in markets[name] for outcome in market['outcomes']})
            for name, (month, start, end) in WINDOWS.items()}


def scan_shard(shard, windows):
    import fsspec
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq

    path = shard['path']
    races = [(name, item) for name, item in windows.items() if path.startswith(f'event_month={item[0]}/')]
    tokens = {token for _, item in races for token in item[3]}
    results = []
    with fsspec.open(BASE + path, 'rb', block_size=1048576).open() as stream:
        parquet = pq.ParquetFile(stream)
        for index in range(parquet.metadata.num_row_groups):
            statistics = parquet.metadata.row_group(index).column(0).statistics
            if statistics is None:
                raise ValueError('Missing timestamp statistics; cannot safely prune the row group')
            if not any(statistics.min < item[2] and statistics.max >= item[1] for _, item in races):
                continue
            identifiers = parquet.read_row_group(index, columns=['token_id'])
            mask = pc.is_in(identifiers.column('token_id'), value_set=pa.array(list(tokens)))
            if pc.sum(pc.cast(mask, pa.int64())).as_py():
                table = parquet.read_row_group(index, columns=COLUMNS).filter(mask)
                for row in table.to_pylist():
                    for name, item in races:
                        if item[1] <= row['timestamp'] < item[2] and row['token_id'] in item[3]:
                            results.append({'race': name, **normalize(row), 'sourceShard': path})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    markets = json.loads((DIRECTORY / 'additional-outcome-identifiers.json').read_text())
    windows = race_windows(markets)
    shards = json.loads((DIRECTORY / 'additional-shards.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = [event for events in executor.map(lambda shard: scan_shard(shard, windows), shards) for event in events]
    results.sort(key=lambda event: (event['timestamp'], event['blockNumber'], event['transactionHash'], event['logIndex']))
    Path(args.output).write_text(json.dumps(results, indent=2) + '\n')
    print(f'{len(results)} on-chain events across {len(windows)} races')


if __name__ == '__main__':
    main()
