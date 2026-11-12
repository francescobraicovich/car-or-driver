"""Compare full warm-up refits with and without disputed pace laps."""
import json
from pathlib import Path
import numpy as np

root = Path('tmp/retrospective-refit')
a = json.loads((root / 'full-warmup-result.json').read_text())
b = json.loads((root / 'full-warmup-clipped-result.json').read_text())
weekends = json.loads((root / 'boundary-warmup-input.json').read_text())
if len(a['history']) != len(b['history']) or len(a['history']) != len(weekends):
    raise ValueError('Warm-up histories must align')
results = {}
for label, selection in [('1994', [i for i, row in enumerate(weekends) if row['date'].startswith('1994')]),
                         ('post1994', [i for i, row in enumerate(weekends) if row['date'] >= '1994-01-01']),
                         ('latest', [len(weekends)-1])]:
    results[label] = {}
    for kind in ('driver', 'car'):
        changes = [b['history'][i][kind][key][channel] - value[channel]
                   for i in selection for key, value in a['history'][i][kind].items() for channel in range(3)]
        results[label][kind] = {'count': len(changes), 'meanAbsolutePoints': float(np.mean(np.abs(changes))),
                                'maxAbsolutePoints': float(np.max(np.abs(changes)))}
output = {'originalInputSha256': a['inputSha256'], 'clippedInputSha256': b['inputSha256'], 'results': results,
          'limitations': 'The clipped version deliberately removes five 1992 lap rows, modifying 20 pace comparisons. Formula 1 classifications support the longer distances, so clipping is only a counterfactual sensitivity test and is not recommended as a correction. Fixed assumptions; not a data-quality or coverage estimate.'}
Path('research/retrospective-refit/validation-clipped-sensitivity.json').write_text(json.dumps(output, indent=2, allow_nan=False))
print(json.dumps(output, indent=2))
