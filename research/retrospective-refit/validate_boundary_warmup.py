"""Compare the first 1994 state with and without a 1990–1993 warm-up."""
import hashlib
import json
from pathlib import Path

import numpy as np

from retrospective_refit import fit_history

base_path = Path('tmp/retrospective-refit/input.json')
warm_path = Path('tmp/retrospective-refit/boundary-warmup-input.json')
base = json.loads(base_path.read_text())[:32]
all_warm = json.loads(warm_path.read_text())
warm = [weekend for weekend in all_warm if weekend['date'] <= base[-1]['date']]
first = next(index for index, weekend in enumerate(warm) if weekend['date'] >= '1994-01-01')
if len(warm) - first != len(base):
    raise ValueError('Warm-up and baseline must cover the same 1994–1995 weekends')
for standard, earlier in zip(base, warm[first:]):
    entry_keys = lambda value: {(str(row['driver']), str(row['car'])) for row in value['entries']}
    if standard['raceId'] != earlier['raceId'] or standard['observations'] != earlier['observations'] or entry_keys(standard) != entry_keys(earlier):
        raise ValueError('Post-1994 evidence differs between the warm-up and baseline builds')
settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
models = {'baseline': (base, 0), 'warmup': (warm, first)}
results = {}
for name, (weekends, index) in models.items():
    fit = fit_history(weekends, settings, covariance_weekends=[index])
    results[name] = {'ratings': fit['history'][index], 'sd': fit['covariance'][index]['standardDeviation'],
                     'maximumGradient': fit['maximumGradient']}
    print(f'Completed {name}: {len(weekends)} weekends', flush=True)
base_ratings, warm_ratings = results['baseline']['ratings'], results['warmup']['ratings']
summary = {}
for kind in ('driver', 'car'):
    changes = [warm_ratings[kind][identity][2] - value[2] for identity, value in base_ratings[kind].items()]
    summary[kind] = {'meanAbsoluteChange': float(np.mean(np.abs(changes))),
                     'maximumAbsoluteChange': float(np.max(np.abs(changes)))}
def values(model):
    drivers, cars = model['ratings']['driver'], model['ratings']['car']
    return {'schumacherRating': 1000 + drivers['30'][2], 'schumacherSennaGap': drivers['30'][2] - drivers['102'][2],
            'pacificRating': 1000 + cars['30'][2], 'pacificMcLarenGap': cars['30'][2] - cars['1'][2],
            'schumacherSd': model['sd']['driver']['30'][2], 'pacificSd': model['sd']['car']['30'][2]}
output = {'baselineInputSha256': hashlib.sha256(base_path.read_bytes()).hexdigest(),
          'warmupInputSha256': hashlib.sha256(warm_path.read_bytes()).hexdigest(),
          'warmupDates': [warm[0]['date'], warm[first - 1]['date']], 'warmupWeekends': first,
          'scoredDate': base[0]['date'], 'through': base[-1]['date'],
          'warmupObservationCounts': [sum(row['channel'] == channel for weekend in warm[:first] for row in weekend['observations']) for channel in range(3)],
          'post1994EvidenceIdentical': True, 'absoluteChangesFromBaseline': summary,
          'baseline': values(results['baseline']), 'warmup': values(results['warmup']),
          'limitations': 'Exploratory refits through October 1995, not the full history. The extra 1990–1993 data contain no qualifying comparisons and have not been independently audited for quality. Fixed settings were originally selected with a 1994 start; scores are not ground truth.'}
Path('research/retrospective-refit/validation-boundary-warmup.json').write_text(json.dumps(output, indent=2, allow_nan=False))
print(json.dumps(output, indent=2), flush=True)
