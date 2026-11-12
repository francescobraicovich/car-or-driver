"""Measure how future evidence revises the initial 1994 weekend."""
import hashlib
import json
import time
from pathlib import Path

import numpy as np

from retrospective_refit import fit_history

input_path = Path('tmp/retrospective-refit/input.json')
weekends = json.loads(input_path.read_text())
settings_path = Path('packages/core/python/unified-settings.json')
settings = json.loads(settings_path.read_text())['parameters']
cutoffs = [1, 2, 5, 16, 32, 60, 120, 310]
output = {'inputSha256': hashlib.sha256(input_path.read_bytes()).hexdigest(),
          'settingsSha256': hashlib.sha256(settings_path.read_bytes()).hexdigest(),
          'firstDate': weekends[0]['date'], 'firstRaceId': weekends[0]['raceId'],
          'firstObservationCounts': [sum(row['channel'] == channel for row in weekends[0]['observations']) for channel in range(3)],
          'cutoffs': [],
          'limitations': 'The first weekend is the model boundary, not the start of the drivers’ careers. Data cutoff comparisons are retrospective refits with fixed parameters, and do not establish true historical abilities. Later data are observational and can propagate via other drivers and teams.'}
for cutoff in cutoffs:
    start = time.monotonic()
    result = fit_history(weekends[:cutoff], settings, covariance_weekends=[0])
    output['cutoffs'].append({'weekends': cutoff, 'through': weekends[cutoff - 1]['date'],
                              'ratings': result['history'][0],
                              'standardDeviation': result['covariance'][0]['standardDeviation'],
                              'maximumGradient': result['maximumGradient'], 'elapsedSeconds': time.monotonic() - start})
    print(f'Completed {cutoff} weekends ({time.monotonic() - start:.1f}s)', flush=True)
Path('tmp/retrospective-refit/boundary-prefix.json').write_text(json.dumps(output, separators=(',', ':'), allow_nan=False))
