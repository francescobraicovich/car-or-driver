"""Fit the full history, retaining only the initial weekend for the boundary audit."""
import hashlib
import json
from pathlib import Path

from retrospective_refit import fit_history

weekends = json.loads(Path('tmp/retrospective-refit/input.json').read_text())
settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
result = fit_history(weekends, settings, covariance_weekends=[0])
output = {'inputSha256': hashlib.sha256(Path('tmp/retrospective-refit/input.json').read_bytes()).hexdigest(), 'weekends': len(weekends), 'history': [result['history'][0]], 'covariance': {'0': result['covariance'][0]}}
Path('tmp/retrospective-refit/boundary-full.json').write_text(json.dumps(output, separators=(',', ':'), allow_nan=False))
print(f'Completed full-history boundary fit: {len(weekends)} weekends, gradient {result["maximumGradient"]:.3g}', flush=True)
