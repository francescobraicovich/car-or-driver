"""Test first-appearance prior sensitivity in the first 32 weekends."""
import hashlib
import json
import time
from pathlib import Path

import numpy as np

from retrospective_refit import fit_history

input_path = Path('tmp/retrospective-refit/input.json')
weekends = json.loads(input_path.read_text())[:32]
settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
cases = [('baseline', 20, 50), ('driver_tight', 10, 50), ('driver_wide', 40, 50),
         ('car_tight', 20, 25), ('car_wide', 20, 100)]
rows = []
for name, driver_sd, car_sd in cases:
    start = time.monotonic()
    result = fit_history(weekends, settings, covariance_weekends=[0], initial_sd={'driver': driver_sd, 'car': car_sd})
    rows.append({'case': name, 'initialSdPoints': {'driver': driver_sd, 'car': car_sd},
                 'ratings': result['history'][0], 'standardDeviation': result['covariance'][0]['standardDeviation'],
                 'maximumGradient': result['maximumGradient'], 'elapsedSeconds': time.monotonic() - start})
    print(f'Completed {name} ({time.monotonic() - start:.1f}s)', flush=True)
reference = rows[0]
summary = []
for row in rows:
    changes = {}
    for kind in ('driver', 'car'):
        differences = [row['ratings'][kind][key][2] - value[2] for key, value in reference['ratings'][kind].items()]
        changes[kind] = {'meanAbsoluteChange': float(np.mean(np.abs(differences))),
                         'maxAbsoluteChange': float(np.max(np.abs(differences)))}
    driver, car = row['ratings']['driver'], row['ratings']['car']
    summary.append({'case': row['case'], 'initialSdPoints': row['initialSdPoints'], 'absoluteChangesFromBaseline': changes,
                    'schumacher1994Overall': 1000 + driver['30'][2],
                    'schumacherSennaGap': driver['30'][2] - driver['102'][2],
                    'pacific1994Overall': 1000 + car['30'][2], 'pacificMcLarenGap': car['30'][2] - car['1'][2],
                    'schumacherSd': row['standardDeviation']['driver']['30'][2],
                    'pacificSd': row['standardDeviation']['car']['30'][2],
                    'maximumGradient': row['maximumGradient'], 'elapsedSeconds': row['elapsedSeconds']})
output = {'inputSha256': hashlib.sha256(input_path.read_bytes()).hexdigest(), 'weekends': len(weekends),
          'through': weekends[-1]['date'], 'cases': summary,
          'limitations': 'The alternative prior scales are deliberately illustrative and were not fitted. Only the first 32 weekends are used; this is not a comparison of full-history refits. The model prior mean and other assumptions remain fixed.'}
Path('research/retrospective-refit/validation-prior-sensitivity.json').write_text(json.dumps(output, indent=2, allow_nan=False))
print(json.dumps(output, indent=2), flush=True)
