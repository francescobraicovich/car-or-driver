"""Compare the three-weekend yearly averages with all retrospective weekends."""
import json
from pathlib import Path

import numpy as np

root = Path('tmp/retrospective-refit')
result = json.loads((root / 'publication-refit.json').read_text())
model = json.loads(Path('data/model.json').read_text())['model']
years = {}
for index, snap in enumerate(model['snaps'][:-1]):
    years.setdefault(str(snap['year']), []).append(index)
rows = []
for year, indices in years.items():
    selected = {indices[0], indices[len(indices) // 2], indices[-1]}
    summary = {'year': year, 'weekends': len(indices), 'sampledWeekends': len(selected)}
    for kind, plural, identifier in (('driver', 'drivers', 'driverId'), ('car', 'cars', 'carId')):
        all_values, sampled = [], []
        for index in indices:
            block = result['covariance'][str(result['offset'] + index)]['standardDeviation'][kind]
            for row in model['snaps'][index][plural]:
                value = block[str(row[identifier])]
                all_values.append(value)
                if index in selected:
                    sampled.append(value)
        actual, approximate = np.mean(all_values, axis=0), np.mean(sampled, axis=0)
        summary[kind] = {'allWeekendMean': actual.tolist(), 'sampleMean': approximate.tolist(),
                         'differencePoints': (approximate - actual).tolist()}
    rows.append(summary)
errors = {kind: np.abs(np.array([row[kind]['differencePoints'] for row in rows])) for kind in ('driver', 'car')}
output = {'sourceInputSha256': result['inputSha256'], 'sampling': 'first, middle and last historical weekend of each year',
          'years': rows, 'aggregate': {kind: {'meanAbsoluteDifferencePoints': float(values.mean()),
                                             'maximumAbsoluteDifferencePoints': float(values.max())} for kind, values in errors.items()},
          'limitations': 'This checks sampled annual averages against all available retrospective marginal SDs, not individual uncertainty, calibration, future datasets or independence assumptions in scenarios.'}
Path('research/retrospective-refit/validation-annual-uncertainty.json').write_text(json.dumps(output, indent=2, allow_nan=False))
print(json.dumps(output['aggregate'], indent=2))
