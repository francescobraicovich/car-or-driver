"""Summarize changes from adding the 1990–1993 warm-up to the full refit."""
import hashlib
import json
from pathlib import Path

import numpy as np
from retrospective_refit import POINTS

root = Path('tmp/retrospective-refit')
base_input = json.loads((root / 'input.json').read_text())
warm_input = json.loads((root / 'boundary-warmup-input.json').read_text())
base = json.loads((root / 'result.json').read_text())
warm = json.loads((root / 'full-warmup-result.json').read_text())
if len(base['history']) != len(base_input) or len(warm['history']) != len(warm_input):
    raise ValueError('Expected complete refits')
offset = len(warm_input) - len(base_input)
if any(a['raceId'] != b['raceId'] or a['observations'] != b['observations'] for a, b in zip(base_input, warm_input[offset:])):
    raise ValueError('Post-1994 evidence differs')
metrics = {kind: {'raw': [], 'fieldRelative': []} for kind in ('driver', 'car')}
decades = {}
for index, weekend in enumerate(base_input):
    decade = str(int(weekend['date'][:4]) // 10 * 10)
    target = decades.setdefault(decade, {kind: {'raw': [], 'fieldRelative': []} for kind in ('driver', 'car')})
    for kind in ('driver', 'car'):
        a, b = base['history'][index][kind], warm['history'][offset + index][kind]
        if set(a) != set(b):
            raise ValueError('Model entities differ')
        differences = np.array([b[key][2] - value[2] for key, value in a.items()])
        for bucket in (metrics[kind], target[kind]):
            bucket['raw'].extend(differences.tolist())
            bucket['fieldRelative'].extend((differences - differences.mean()).tolist())
def summarize(data):
    return {'count': len(data), 'meanSigned': float(np.mean(data)), 'meanAbsolute': float(np.mean(np.abs(data))),
            'medianAbsolute': float(np.median(np.abs(data))), 'p95Absolute': float(np.quantile(np.abs(data), .95)),
            'maximumAbsolute': float(np.max(np.abs(data)))}
def summarize_bucket(bucket):
    return {kind: {name: summarize(values) for name, values in sections.items()} for kind, sections in bucket.items()}
selected = []
for index in (0, 155, 310, len(base_input) - 1):
    a = base['covariance'][str(index)]
    b = warm['covariance'][str(offset + index)]
    ia, ib = {tuple(key): 3 * i for i, key in enumerate(a['keys'])}, {tuple(key): 3 * i for i, key in enumerate(b['keys'])}
    ma, mb = np.array(a['matrix']), np.array(b['matrix'])
    if set(ia) != set(ib) or np.linalg.eigvalsh(mb)[0] <= 0:
        raise ArithmeticError('Invalid or mismatched selected covariance block')
    sd_change = {kind: [] for kind in ('driver', 'car')}
    for kind, identity in ia:
        pa, pb = ia[(kind, identity)] + 2, ib[(kind, identity)] + 2
        sd_change[kind].append((np.sqrt(mb[pb, pb]) - np.sqrt(ma[pa, pa])) * POINTS)
    selected.append({'date': base_input[index]['date'], 'index': index,
                     'overallSdChangePoints': {kind: summarize(values) for kind, values in sd_change.items()},
                     'minimumWarmCovarianceEigenvalue': float(np.linalg.eigvalsh(mb)[0])})
first_a, first_b = base['history'][0], warm['history'][offset]
def gap(model, kind, a, b):
    return model[kind][a][2] - model[kind][b][2]
output = {'baseInputSha256': hashlib.sha256((root / 'input.json').read_bytes()).hexdigest(),
          'warmInputSha256': warm['inputSha256'], 'warmupWeekends': offset, 'warmupDates': [warm_input[0]['date'], warm_input[offset - 1]['date']],
          'post1994Weekends': len(base_input), 'post1994EvidenceIdentical': True,
          'fullFitSeconds': warm['elapsedSeconds'], 'maximumGradient': warm['maximumGradient'],
          'overallDifferences': summarize_bucket(metrics),
          'byDecade': {year: summarize_bucket(bucket) for year, bucket in decades.items()},
          'firstWeekend': {'date': base_input[0]['date'],
                           'baselineSchumacherSennaGap': gap(first_a, 'driver', '30', '102'),
                           'warmSchumacherSennaGap': gap(first_b, 'driver', '30', '102'),
                           'baselinePacificMcLarenGap': gap(first_a, 'car', '30', '1'),
                           'warmPacificMcLarenGap': gap(first_b, 'car', '30', '1')},
          'selectedCovariance': selected,
          'limitations': 'Both models refit the same post-1994 observations and differ in 1990–1993 warm-up. Per-weekend centring is a diagnostic convention, not the website display reference. Warm-up qualifying is absent, input provenance is not independently verified and hyperparameters were selected for the original start. Selected Laplace covariances are conditional on each model, not validation of real latent strength.'}
Path('research/retrospective-refit/validation-full-warmup.json').write_text(json.dumps(output, indent=2, allow_nan=False))
print(json.dumps(output, indent=2))
