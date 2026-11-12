"""Assess first-1994 uncertainty with and without an earlier simulated warm-up."""
import hashlib
import json
import time
from pathlib import Path

import numpy as np
from retrospective_refit import POINTS, fit_history
from validate_race_dependence import SETTINGS, groups_for, simulate
from validate_simulation import empty, measure, report

path = Path('tmp/retrospective-refit/boundary-warmup-input.json')
all_weekends = json.loads(path.read_text())
evidence = [row for row in all_weekends if '1993-01-01' <= row['date'] < '1995-01-01']
offset = next(i for i, weekend in enumerate(evidence) if weekend['date'] >= '1994-01-01')
if offset != 16 or len(evidence) != 32:
    raise ValueError('Expected 16 1993 weekends followed by 16 1994 weekends')
seeds = list(range(20))
results = []
start = time.monotonic()
for team_noise in (0, .3):
    for seed in seeds:
        weekends, truths = simulate(seed, team_noise, evidence)
        samples = {}
        for label, training, index, truth_index in (('baseline', weekends[offset:], 0, offset), ('warmup', weekends, offset, offset)):
            result = fit_history(training, SETTINGS, covariance_weekends=[index])
            block = result['covariance'][index]
            keys = [tuple(key) for key in block['keys']]
            positions = {key: i * 3 for i, key in enumerate(keys)}
            estimate = np.concatenate([result['history'][index][kind][identity] for kind, identity in keys]) / POINTS
            storage = empty()
            measure(estimate, np.asarray(block['matrix']), positions, groups_for(weekends[truth_index], truths[truth_index]), storage)
            samples[label] = report(storage)
        results.append({'seed': seed, 'teamNoiseFraction': team_noise, 'models': samples})
        if seed % 5 == 4:
            print(f'Completed noise {team_noise}, {seed+1}/{len(seeds)} ({time.monotonic()-start:.1f}s)', flush=True)
rng = np.random.default_rng(42031)
summary = {}
for noise in (0, .3):
    selected = [row for row in results if row['teamNoiseFraction'] == noise]
    summary[str(noise)] = {}
    for model in ('baseline', 'warmup'):
        summary[str(noise)][model] = {}
        for kind in ('driver', 'car', 'package'):
            coverage = np.array([[value['coverage90'] for value in row['models'][model][kind]] for row in selected])
            rmse = np.array([[value['rmsePoints'] for value in row['models'][model][kind]] for row in selected])
            draws = rng.integers(0, len(selected), (10000, len(selected)))
            means = coverage[draws].mean(axis=1)
            summary[str(noise)][model][kind] = {'meanCoverage90': coverage.mean(axis=0).tolist(),
                'seedBootstrap95': np.quantile(means, [.025, .975], axis=0).T.tolist(), 'meanSeedRmsePoints': rmse.mean(axis=0).tolist()}
output = {'inputSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'warmupDates': [evidence[0]['date'], evidence[offset-1]['date']],
          'targetDate': evidence[offset]['date'], 'through': evidence[-1]['date'], 'seeds': seeds,
          'channels': ['qual', 'race', 'overall'], 'summary': summary, 'results': results,
          'limitations': 'Synthetic truth starts in 1993 from the fitted model prior; actual entries and pair weights are fixed, outcomes simulated with shared race and optional team noise. Only one warm-up year is tested, with no pre-1994 qualifying, and 1994 scores use 1994 future observations. Pair outcomes within each seed are dependent; bootstrap resamples seeds. Does not prove calibration on real races or for a four-year warm-up.'}
Path('research/retrospective-refit/validation-warmup-uncertainty.json').write_text(json.dumps(output, indent=2, allow_nan=False))
