"""Audit downloaded race-window files against books and an independent chain extract."""

import argparse
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from audit_l2 import _read, _utc, audit, compare_chain

ROOT = Path(__file__).resolve().parents[3]
PMDATA = ROOT / 'tmp/pmdata'
RESEARCH = ROOT / 'research/prediction-markets'


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    paths = [PMDATA / 'austrian-download-manifest.json', PMDATA / 'historical-download-manifest.json']
    entries = []
    for path in paths:
        for item in json.loads(path.read_text()):
            if path.name == 'austrian-download-manifest.json':
                item = {**item, 'race': 'austrian', 'date': '2026-06-25'}
            entries.append(item)
    races = {}
    for item in entries:
        if item['status'] == 'downloaded' and item['type'] in ('l2', 'trades'):
            key = (item['race'], item['date'], item['driver'])
            races.setdefault(key, {})[item['type']] = ROOT / item['file']
    forecasts = json.loads((RESEARCH / 'forecast/season-2026-baseline.json').read_text())['results']
    identifiers = json.loads((RESEARCH / 'polymarket/onchain/winner/outcome-identifiers.json').read_text())
    chain_path = RESEARCH / 'polymarket/onchain/winner/winner-onchain-events.json'
    chain = json.loads(chain_path.read_text())
    provider_chain_items = json.loads((PMDATA / 'historical-onchain-download-manifest.json').read_text())
    provider_chain = {(i['race'], i['date'], i['driver']): ROOT / i['file']
                      for i in provider_chain_items if i['status'] == 'downloaded'}
    outputs = []
    for (race, day, driver), files in sorted(races.items()):
        if set(files) != {'l2', 'trades'}:
            raise ValueError(f'Missing L2 or trade file: {race}/{day}/{driver}')
        start = datetime.fromisoformat(day + 'T14:00:00')
        end = start + timedelta(hours=2)
        practice_date = (start + timedelta(days=1)).date().isoformat()
        practices = [f['firstPractice'] for f in forecasts if f['firstPractice'].startswith(practice_date)]
        if len(practices) != 1:
            raise ValueError(f'First-practice time ambiguous or missing: {race}/{day}')
        first_practice = _utc(practices[0])
        l2, trades = _read(files['l2']), _read(files['trades'])
        names = {r.get('market_slug') for r in l2 if r.get('market_slug')}
        if len(names) != 1:
            raise ValueError(f'Missing or ambiguous market slug: {race}/{driver}')
        slug = next(iter(names))
        markets = [m for m in identifiers.get(race, []) if m['marketSlug'] == slug]
        reference = None
        if len(markets) == 1:
            tokens = {o['tokenId'] for o in markets[0]['outcomes']}
            start_epoch = int(start.replace(tzinfo=timezone.utc).timestamp())
            end_epoch = int(end.replace(tzinfo=timezone.utc).timestamp())
            reference = [r for r in chain if r['race'] == race and r['tokenId'] in tokens
                         and start_epoch - 60 <= r['timestamp'] < end_epoch + 60]
        report = audit(l2, trades, start, end, first_practice, reference)
        report['race'] = race
        report['driver'] = driver
        report['files'] = {str(p.relative_to(ROOT)): digest(p) for p in files.values()}
        provider_path = provider_chain.get((race, day, driver))
        if provider_path is not None:
            provider_rows = [r for r in _read(provider_path) if isinstance(r.get('timestamp'), datetime)
                             and start - timedelta(seconds=60) <= r['timestamp'] < end + timedelta(seconds=60)]
            window_trades = [r for r in trades if start <= r['local_timestamp'] < end]
            report['same_provider_onchain_check'] = compare_chain(window_trades, provider_rows)
            report['same_provider_onchain_check']['note'] = ('PMData on-chain file is a same-provider cross-check, not independent; '
                                                           'block inclusion uses start minus 60 seconds to end plus 60 seconds')
            report['same_provider_onchain_check']['file'] = str(provider_path.relative_to(ROOT))
            report['same_provider_onchain_check']['sha256'] = digest(provider_path)
        if reference is not None:
            report['chain_check']['reference'] = str(chain_path.relative_to(ROOT))
            report['chain_check']['reference_sha256'] = digest(chain_path)
            report['chain_check']['block_time_scope'] = 'start minus 60 seconds to end plus 60 seconds; boundary mismatches may be expected'
        outputs.append(report)
    result = {'description': 'Researcher-selected Thursday 14:00–16:00 UTC, separately audited by market. The source order and feed completeness are not verified.',
              'reports': outputs}
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(f'Audited {len(outputs)} winner-market files; no feed coverage is certified.')


if __name__ == '__main__':
    main()
