"""Time the first 25 covariance blocks of the full-data refit."""
import hashlib
import json
import time
from pathlib import Path

from retrospective_refit import fit_history

weekends = json.loads(Path('tmp/retrospective-refit/input.json').read_text())
settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
start = time.monotonic()
times = []

def progress(completed, total):
    times.append(time.monotonic() - start)
    if completed in (1, 5, 10, 25):
        print(f'Completed {completed}/{total} blocks ({times[-1]:.1f}s)', flush=True)

result = fit_history(weekends, settings, covariance_weekends=list(range(25)), progress=progress)
summary = {'inputSha256': hashlib.sha256(Path('tmp/retrospective-refit/input.json').read_bytes()).hexdigest(), 'weekendsInFit': len(weekends), 'covarianceBlocks': len(times), 'firstBlockSeconds': times[0],
           'lastBlockSeconds': times[-1], 'blockExtractionSecondsAfterFirst': times[-1] - times[0],
           'meanSecondsPerAdditionalBlock': (times[-1] - times[0]) / (len(times) - 1),
           'iterations': result['iterations'], 'maximumGradient': result['maximumGradient'],
           'limitations': 'First 25 blocks only, with the entire history fitted. Wall time depends on concurrent workloads; the first block includes fitting and factorization. This is not the completed all-block benchmark.'}
Path('research/retrospective-refit/validation-covariance-sample.json').write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2), flush=True)
