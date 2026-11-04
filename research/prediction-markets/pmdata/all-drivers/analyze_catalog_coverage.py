"""Compare mapped markets with PMData's separately downloaded public catalog."""

import hashlib
import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[4]
DIRECTORY = Path(__file__).resolve().parent
catalog = ROOT / 'tmp/pmdata-markets.parquet'
manifest = json.loads((DIRECTORY / 'manifest.json').read_text())
connection = duckdb.connect()
slugs = [driver['market']['slug'] for race in manifest['races'] for driver in race['drivers'] if driver['market']]
marks = ', '.join('?' for _ in slugs)
rows = connection.execute(f'SELECT market_slug, CAST(record_start AS VARCHAR), CAST(record_end AS VARCHAR), CAST(market_start AS VARCHAR), CAST(market_end AS VARCHAR) FROM read_parquet(?) WHERE market_slug IN ({marks})', [str(catalog), *slugs]).fetchall()
catalog_records = {}
for slug, *times in rows:
    catalog_records.setdefault(slug, []).append(times)
records = []
for race in manifest['races']:
    for driver in race['drivers']:
        if not driver['market']:
            continue
        slug = driver['market']['slug']
        matches = catalog_records.get(slug, [])
        records.append({'race': race['id'], 'date': race['date'], 'driverId': driver['driverId'], 'marketSlug': slug,
                        'catalogMatches': len(matches), 'catalogTimes': [str(value) if value else None for value in matches[0]] if len(matches) == 1 else None})
report = {'source': 'https://public-data.pmdata.dev/v1/polymarket/markets.parquet',
          'documentation': 'https://pmdata.dev/docs/schemas/markets-catalog',
          'sha256': hashlib.sha256(catalog.read_bytes()).hexdigest(),
          'caveat': 'The first and last recorded dates do not prove data exists on every intervening day.', 'markets': records}
(DIRECTORY / 'catalog-coverage.json').write_text(json.dumps(report, indent=2) + '\n')
print('market entries:', len(records), 'unique catalog matches:', sum(r['catalogMatches'] == 1 for r in records))
