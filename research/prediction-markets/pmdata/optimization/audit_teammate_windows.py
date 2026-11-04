"""Audit the two additional teammate markets using the existing PMData L2 audit."""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RESEARCH / 'pmdata'))
from audit_l2 import _read, _utc, audit, compare_chain  # noqa: E402

ROOT = RESEARCH.parents[1]
PMDATA = ROOT / 'tmp/pmdata'
MANIFEST = PMDATA / 'teammates-download-manifest.json'
OUTPUT = RESEARCH / 'pmdata/optimization/teammate-window-audit.json'


def main():
    entries = json.loads(MANIFEST.read_text())
    forecasts = json.loads((RESEARCH / 'forecast/season-2026-baseline.json').read_text())['results']
    identifiers = json.loads((RESEARCH / 'polymarket/onchain/winner/outcome-identifiers.json').read_text())
    chain = json.loads((RESEARCH / 'polymarket/onchain/winner/winner-onchain-events.json').read_text())
    groups = {}
    for item in entries:
        if item['status'] == 'downloaded':
            groups.setdefault((item['race'], item['date'], item['driver']), {})[item['type']] = item
    outputs = []
    for (race, day, driver), files in sorted(groups.items()):
        if set(files) != {'l2', 'trades', 'onchain_fills'}:
            raise ValueError(f'Missing market-day file: {race}/{driver}')
        start = datetime.fromisoformat(day + 'T14:00:00')
        end = start + timedelta(hours=2)
        practice_date = (start + timedelta(days=1)).date().isoformat()
        practice_times = [f['firstPractice'] for f in forecasts if f['firstPractice'].startswith(practice_date)]
        if len(practice_times) != 1:
            raise ValueError(f'First-practice time ambiguous: {race}')
        l2 = _read(ROOT / files['l2']['file'])
        trades = _read(ROOT / files['trades']['file'])
        provider = _read(ROOT / files['onchain_fills']['file'])
        slug = next(iter({row['market_slug'] for row in l2}))
        matches = [m for m in identifiers.get(race, []) if m['marketSlug'] == slug]
        reference = None
        if len(matches) == 1:
            tokens = {item['tokenId'] for item in matches[0]['outcomes']}
            start_epoch = int(start.replace(tzinfo=timezone.utc).timestamp())
            end_epoch = int(end.replace(tzinfo=timezone.utc).timestamp())
            reference = [row for row in chain if row['race'] == race and row['tokenId'] in tokens
                         and start_epoch - 60 <= row['timestamp'] < end_epoch + 60]
        report = audit(l2, trades, start, end, _utc(practice_times[0]), reference)
        relevant = [row for row in provider if isinstance(row.get('timestamp'), datetime)
                    and start - timedelta(seconds=60) <= row['timestamp'] < end + timedelta(seconds=60)]
        tape = [row for row in trades if start <= row['local_timestamp'] < end]
        report['same_provider_onchain_check'] = compare_chain(tape, relevant)
        report['same_provider_onchain_check']['note'] = 'Same-provider check; block times buffered by 60 seconds on each side.'
        report['race'], report['driver'] = race, driver
        report['sources'] = {kind: {'url': item['url'], 'sha256': item['sha256'], 'bytes': item['bytes']}
                             for kind, item in files.items()}
        outputs.append(report)
    result = {'description': 'Two additional teammates, researcher-selected 14:00–16:00 UTC. Coverage and order are not independently certified.',
              'reports': outputs}
    OUTPUT.write_text(json.dumps(result, indent=2) + '\n')
    print(f'Audited {len(outputs)} market windows; no feed coverage is certified.')


if __name__ == '__main__':
    main()
