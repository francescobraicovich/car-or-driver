"""Collect selected weekend market-days once, with a persistent download manifest."""

import argparse
import hashlib
import importlib.util
import json
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DIRECTORY = Path(__file__).resolve().parent
DATA = ROOT / 'tmp/pmdata-session-windows'
MANIFEST = DIRECTORY / 'manifest.json'
SELECTED = {'monaco': ('2026-06-06', '2026-06-07'), 'singapore': ('2026-10-10', '2026-10-11')}


def write(manifest):
    temporary = MANIFEST.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(manifest, indent=2) + '\n')
    os.replace(temporary, MANIFEST)


def initialize():
    source = json.loads((DIRECTORY.parent / 'all-drivers/manifest.json').read_text())
    races = []
    for race in source['races']:
        if race['id'] not in SELECTED:
            continue
        drivers = [{key: driver[key] for key in ('driverId', 'name', 'constructorId', 'market')}
                   for driver in race['drivers']]
        for driver in drivers:
            driver['days'] = {day: {} for day in SELECTED[race['id']]}
        races.append({'id': race['id'], 'name': race['name'], 'dates': SELECTED[race['id']], 'drivers': drivers})
    if len(races) != len(SELECTED):
        raise ValueError('Missing selected race metadata')
    manifest = {'description': 'Weekend market-day data for pre-qualifying and post-qualifying replay.',
                'successfulNewDownloads': 0, 'races': races}
    write(manifest)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=('race-day', 'qualifying-day'), required=True)
    parser.add_argument('--cap', type=int, default=180, help='Maximum successful downloads in this manifest')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('pmdata_downloader', DIRECTORY.parent / 'download_market_day.py')
    downloader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(downloader)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else initialize()
    key = (ROOT / 'tmp/pmdata-api-key').read_text().strip()
    recent = 0.0
    date_index = 1 if args.phase == 'race-day' else 0
    kinds = ('l2', 'trades', 'onchain_fills')
    if args.phase == 'race-day':
        requests = [(race, driver, kind) for kind in kinds for race in manifest['races'] for driver in race['drivers']]
    else:
        # Keep each driver usable if quota runs out, and balance the two races.
        requests = [(race, race['drivers'][index], kind)
                    for index in range(max(len(race['drivers']) for race in manifest['races']))
                    for race in manifest['races'] if index < len(race['drivers']) for kind in kinds]
    for race, driver, kind in requests:
        day = race['dates'][date_index]
        if not driver['market']:
            continue
        files = driver['days'][day]
        if kind in files and files[kind].get('status') != 'not_requested_quota_cap':
            continue
        if kind != 'l2' and files.get('l2', {}).get('status') != 'available':
            files[kind] = {'status': 'not_requested_no_recorded_book'}
            write(manifest)
            continue
        folder = DATA / race['id'] / day / driver['driverId']
        folder.mkdir(parents=True, exist_ok=True)
        destination = folder / f'{kind}.parquet'
        if destination.exists():
            info = {'bytes': destination.stat().st_size, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}
            origin = 'cached'
        else:
            if manifest['successfulNewDownloads'] >= args.cap:
                print(f'Stopping at cap {args.cap}; successful downloads {manifest["successfulNewDownloads"]}', flush=True)
                return
            delay = 0.35 - (time.monotonic() - recent)
            if delay > 0:
                time.sleep(delay)
            try:
                info = downloader.download_market_day(kind, day, driver['market']['slug'], destination, key)
                recent = time.monotonic()
            except RuntimeError as error:
                recent = time.monotonic()
                if 'HTTP 404' not in str(error):
                    write(manifest)
                    raise
                files[kind] = {'status': 'not_found'}
                write(manifest)
                continue
            manifest['successfulNewDownloads'] += 1
            origin = 'downloaded'
        files[kind] = {'status': 'available', 'origin': origin,
                       'path': str(destination.relative_to(ROOT)), **info}
        write(manifest)
    print(f'{args.phase}: {manifest["successfulNewDownloads"]} successful downloads total', flush=True)


if __name__ == '__main__':
    main()
