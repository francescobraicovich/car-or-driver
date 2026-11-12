"""Refit the 1990-start history and extract covariance for every published weekend."""
import hashlib
import json
import time
from pathlib import Path

from retrospective_refit import fit_history

root = Path('tmp/retrospective-refit')
source = root / 'boundary-warmup-input.json'
base = json.loads((root / 'input.json').read_text())
text = source.read_text()
weekends = json.loads(text)
offset = next(i for i, weekend in enumerate(weekends) if weekend['raceId'] == base[0]['raceId'])
if len(weekends) - offset != len(base):
    raise ValueError('Warm-up and production histories must align')
for expected, actual in zip(base, weekends[offset:]):
    expected_entries = {(str(row['driver']), str(row['car'])) for row in expected['entries']}
    actual_entries = {(str(row['driver']), str(row['car'])) for row in actual['entries']}
    if (expected['raceId'] != actual['raceId'] or expected['observations'] != actual['observations']
            or expected_entries != actual_entries):
        raise ValueError(f"Production evidence differs at {expected['raceId']}")
settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
start = time.monotonic()
def progress(completed, total):
    if completed % 25 == 0 or completed == total:
        print(f'Extracted {completed}/{total} weekends ({time.monotonic()-start:.0f}s)', flush=True)

years = {}
for index in range(offset, len(weekends) - 1):
    years.setdefault(weekends[index]['date'][:4], []).append(index)
samples = sorted({index for indices in years.values() for index in (indices[0], indices[len(indices) // 2], indices[-1])})
result = fit_history(weekends, settings, covariance_weekends=samples, progress=progress)
result['elapsedSeconds'] = time.monotonic() - start
result['inputSha256'] = hashlib.sha256(text.encode()).hexdigest()
result['offset'] = offset
(root / 'publication-refit.json').write_text(json.dumps(result, separators=(',', ':'), allow_nan=False))
print(f"Completed publication refit in {result['elapsedSeconds']:.1f}s", flush=True)
