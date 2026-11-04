"""Collect prior-roster winner contracts, preserving quota and source provenance."""

import argparse
import hashlib
import importlib.util
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DIRECTORY = ROOT / 'research/prediction-markets/pmdata/all-drivers'
DATA = ROOT / 'tmp/pmdata-all'
MANIFEST = DIRECTORY / 'manifest.json'
RACES = {'Canadian Grand Prix': 'canadian', 'Monaco Grand Prix': 'monaco',
         'Barcelona Grand Prix': 'barcelona', 'Austrian Grand Prix': 'austrian',
         'British Grand Prix': 'british', 'Dutch Grand Prix': 'dutch',
         'Italian Grand Prix': 'italian', 'Singapore Grand Prix': 'singapore'}


def surname(name):
    words = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower().split()
    return re.sub('[^a-z]', '', words[-1])


def field(value):
    return json.loads(value) if isinstance(value, str) else value


def save(manifest):
    temporary = MANIFEST.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(manifest, indent=2) + '\n')
    os.replace(temporary, MANIFEST)


def initialize():
    races = []
    for name in ('strategy-features-earlier.json', 'strategy-features.json'):
        source = ROOT / 'research/prediction-markets/pmdata' / name
        for race in json.loads(source.read_text())['races']:
            if race['race'] not in RACES:
                continue
            identifier = RACES[race['race']]
            day = race['decisionTime'][:10]
            event = json.loads((DATA / 'gamma' / f'{identifier}.json').read_text())
            provenance = json.loads((DATA / 'gamma' / f'{identifier}-provenance.json').read_text())
            records = []
            for driver in race['roster']:
                last = surname(driver['name'])
                matches = [m for m in event['markets'] if last in re.findall(
                    '[a-z]+', unicodedata.normalize('NFKD', m.get('groupItemTitle', '')).encode('ascii', 'ignore').decode().lower())]
                if len(matches) > 1:
                    raise ValueError(f'Ambiguous market for {identifier}: {driver["name"]}')
                record = {'driverId': driver['driverId'], 'name': driver['name'],
                          'constructorId': driver['constructorId'], 'market': None, 'files': {}}
                if matches:
                    m = matches[0]
                    record['market'] = {'slug': m['slug'], 'question': m['question'],
                        'conditionId': m['conditionId'], 'outcomes': field(m['outcomes']),
                        'clobTokenIds': field(m['clobTokenIds']), 'outcomePrices': field(m['outcomePrices']),
                        'createdAt': m.get('createdAt'), 'startDate': m.get('startDate'),
                        'closedTime': m.get('closedTime'), 'closed': m.get('closed'),
                        'umaResolutionStatus': m.get('umaResolutionStatus'), 'negRisk': m.get('negRisk')}
                records.append(record)
            races.append({'id': identifier, 'name': race['race'], 'date': day,
                          'rosterSource': str(source.relative_to(ROOT)), 'event': provenance,
                          'drivers': records})
    manifest = {'description': 'Previous-race roster matched to official Gamma market labels. Gamma settlement is used only for settlement and contract identifiers.',
                'window': 'Full Thursday UTC; an observation is usable only after a verified book snapshot.',
                'races': races, 'successfulNewDownloads': 0}
    save(manifest)
    for r in races:
        absent = [d['name'] for d in r['drivers'] if d['market'] is None]
        print(r['id'], len(r['drivers']), 'unmatched:', ', '.join(absent) or 'none', flush=True)


def collect(data_types, cap):
    import pyarrow.parquet as parquet
    spec = importlib.util.spec_from_file_location('pmdata_downloader', DIRECTORY.parent / 'download_market_day.py')
    downloader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(downloader)
    manifest = json.loads(MANIFEST.read_text())
    key = (ROOT / 'tmp/pmdata-api-key').read_text().strip()
    recent = 0.0
    for race in manifest['races']:
        counts = {'cached': 0, 'downloaded': 0, 'not_found': 0, 'skipped': 0}
        for driver in race['drivers']:
            if driver['market'] is None:
                continue
            for kind in data_types:
                if kind in driver['files']:
                    continue
                if kind == 'onchain_fills':
                    books = driver['files'].get('l2', {})
                    if books.get('status') != 'available':
                        driver['files'][kind] = {'status': 'not_requested_no_recorded_book'}
                        counts['skipped'] += 1
                        save(manifest)
                        continue
                folder = DATA / race['id'] / driver['driverId']
                folder.mkdir(parents=True, exist_ok=True)
                destination = folder / f'{kind}.parquet'
                legacy = ROOT / 'tmp/pmdata' / f'{race["id"]}-{race["date"]}-{surname(driver["name"])}-{kind}.parquet'
                if not destination.exists() and legacy.exists():
                    os.link(legacy, destination)
                origin = 'cached' if destination.exists() else 'downloaded'
                if origin == 'downloaded':
                    if manifest['successfulNewDownloads'] >= cap:
                        print(f'Stopping at cap of {cap} successful new downloads', flush=True)
                        save(manifest)
                        return
                    delay = 0.35 - (time.monotonic() - recent)
                    if delay > 0:
                        time.sleep(delay)
                    try:
                        info = downloader.download_market_day(kind, race['date'], driver['market']['slug'], destination, key)
                        recent = time.monotonic()
                    except RuntimeError as error:
                        recent = time.monotonic()
                        if 'HTTP 404' not in str(error):
                            save(manifest)
                            raise
                        driver['files'][kind] = {'status': 'not_found', 'reason': str(error)}
                        counts['not_found'] += 1
                        save(manifest)
                        continue
                    manifest['successfulNewDownloads'] += 1
                else:
                    content = destination.read_bytes()
                    info = {'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
                result = {'status': 'available', 'origin': origin,
                          'path': str(destination.relative_to(ROOT)), **info}
                if kind == 'trades':
                    table = parquet.read_table(destination, columns=['timestamp'])
                    start = datetime.fromisoformat(race['date'])
                    result['rowsInWindow'] = sum(start <= t < start + timedelta(days=1) for t in table['timestamp'].to_pylist() if t is not None)
                    result['rowsTotal'] = len(table)
                driver['files'][kind] = result
                counts[origin] += 1
                save(manifest)
        print(race['id'], counts, 'new downloads:', manifest['successfulNewDownloads'], flush=True)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase', choices=['initialize', 'books', 'fills'])
parser.add_argument('--cap', type=int, default=432)
args = parser.parse_args()
if args.phase == 'initialize':
    if MANIFEST.exists():
        sys.exit('Manifest already exists; refusing to replace it')
    initialize()
elif args.phase == 'books':
    collect(('l2', 'trades'), args.cap)
else:
    collect(('onchain_fills',), args.cap)
