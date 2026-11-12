"""Diagnostic ablation of evidence affecting Pacific's initial estimate."""
import copy
import hashlib
import json
from pathlib import Path

from retrospective_refit import fit_history

path = Path('tmp/retrospective-refit/input.json')
weekends = json.loads(path.read_text())[:5]
settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
cases = [('all_evidence', ()), ('omit_later_pacific_qualifying', (0,)),
         ('omit_later_pacific_race_pace', (1,)), ('omit_both_later_pacific_timing', (0, 1))]
results = []
for name, channels in cases:
    training = copy.deepcopy(weekends)
    removed = [0, 0, 0]
    for weekend in training[2:]:
        kept = []
        for row in weekend['observations']:
            if row['channel'] in channels and '30' in (str(row['ca']), str(row['cb'])):
                removed[row['channel']] += 1
            else:
                kept.append(row)
        weekend['observations'] = kept
    fit = fit_history(training, settings, covariance_weekends=[0])
    first = fit['history'][0]['car']
    results.append({'case': name, 'removedComparisons': removed,
                    'pacificRating': 1000 + first['30'][2], 'pacificMcLarenGap': first['30'][2] - first['1'][2],
                    'pacificSd': fit['covariance'][0]['standardDeviation']['car']['30'][2]})
output = {'inputSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'weekends': len(weekends), 'cases': results,
          'limitations': 'Diagnostic refits after removing comparisons involving Pacific in weekends 3–5; other same-weekend comparisons remain and are dependent. Differences are not causal attributions or evidence of true 1994 strength.'}
Path('research/retrospective-refit/validation-boundary-ablation.json').write_text(json.dumps(output, indent=2))
print(json.dumps(output, indent=2), flush=True)
