"""Compare the complete 1990-warm-up refit with the baseline refit."""
import argparse
import hashlib
import json
import time
from pathlib import Path
import numpy as np
from retrospective_refit import fit_history

parser = argparse.ArgumentParser()
parser.add_argument('--clipped', action='store_true')
args = parser.parse_args()
base_path = Path('tmp/retrospective-refit/input.json')
warm_path = Path('tmp/retrospective-refit/boundary-warmup-clipped-input.json' if args.clipped else 'tmp/retrospective-refit/boundary-warmup-input.json')
base = json.loads(base_path.read_text())
warm = json.loads(warm_path.read_text())
offset = next(i for i, row in enumerate(warm) if row['raceId'] == base[0]['raceId'])
if len(warm) - offset != len(base):
    raise ValueError('The histories do not have matching post-1994 lengths')
for a, b in zip(base, warm[offset:]):
    keys = lambda weekend: {(str(row['driver']), str(row['car'])) for row in weekend['entries']}
    if a['raceId'] != b['raceId'] or a['observations'] != b['observations'] or keys(a) != keys(b):
        raise ValueError(f"Post-1994 evidence differs at {a['raceId']}")
settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
indices = [offset, offset + 155, offset + 310, len(warm) - 1]
start = time.monotonic()
result = fit_history(warm, settings, covariance_weekends=indices)
result['elapsedSeconds'] = time.monotonic() - start
result['inputSha256'] = hashlib.sha256(warm_path.read_bytes()).hexdigest()
Path('tmp/retrospective-refit/full-warmup-clipped-result.json' if args.clipped else 'tmp/retrospective-refit/full-warmup-result.json').write_text(json.dumps(result, separators=(',', ':'), allow_nan=False))
print(f"Fitted {len(warm)} weekends, gradient {result['maximumGradient']:.3g}, {result['elapsedSeconds']:.1f}s", flush=True)
