"""Fit exported production evidence as a research-only retrospective history."""
import argparse
import hashlib
import json
import time
from pathlib import Path

from retrospective_refit import fit_history

parser = argparse.ArgumentParser()
parser.add_argument('weekends', nargs='?', type=int)
parser.add_argument('--covariance', nargs='*', type=int, default=[], metavar='INDEX')
parser.add_argument('--covariance-all', action='store_true')
parser.add_argument('--covariance-pair', nargs=2, type=int, action='append', default=[], metavar=('FIRST', 'SECOND'))
args = parser.parse_args()
source = Path('tmp/retrospective-refit/input.json')
settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())
source_text = source.read_text()
weekends = json.loads(source_text)
if args.weekends is not None:
    if args.weekends <= 0:
        parser.error('weekends must be positive')
    weekends = weekends[:args.weekends]
if args.covariance_all and args.covariance:
    parser.error('Use either --covariance or --covariance-all')
if args.covariance_all:
    args.covariance = list(range(len(weekends)))
start = time.monotonic()

def progress(completed, total):
    if completed % 25 == 0 or completed == total:
        print(f'Extracted covariance for {completed}/{total} weekends ({time.monotonic() - start:.1f}s)', flush=True)

result = fit_history(weekends, settings['parameters'], covariance_weekends=args.covariance,
                     covariance_pairs=args.covariance_pair, progress=progress if args.covariance_all else None)
result['elapsedSeconds'] = time.monotonic() - start
result['inputSha256'] = hashlib.sha256(source_text.encode()).hexdigest()
result['weekends'] = len(weekends)
destination = Path('tmp/retrospective-refit/result.json')
destination.write_text(json.dumps(result, separators=(',', ':'), allow_nan=False))
print(json.dumps({key: value for key, value in result.items() if key not in ('history', 'covariance', 'crossCovariance')}, indent=2), flush=True)
