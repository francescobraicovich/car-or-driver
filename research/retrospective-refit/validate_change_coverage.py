"""Test smoothed uncertainty for changes between two race weekends."""
import hashlib
import json
import time
from pathlib import Path

import numpy as np

from retrospective_refit import POINTS, fit_history
from validate_race_dependence import SETTINGS, simulate

path = Path('tmp/retrospective-refit/input.json')
evidence = json.loads(path.read_text())[310:370]
pairs = [(19, 39), (39, 59)]
seeds = list(range(20))
results = []
start = time.monotonic()
for team_noise in (0, .3):
    for seed in seeds:
        weekends, truths = simulate(seed, team_noise, evidence)
        fit = fit_history(weekends, SETTINGS, covariance_weekends=[19, 39, 59], covariance_pairs=pairs)
        samples = {kind: [[], [], []] for kind in ('driver', 'car')}
        for first, second in pairs:
            a, b = fit['covariance'][first], fit['covariance'][second]
            cross = fit['crossCovariance'][f'{first}:{second}']
            first_keys = {tuple(key): 3 * i for i, key in enumerate(a['keys'])}
            second_keys = {tuple(key): 3 * i for i, key in enumerate(b['keys'])}
            a_matrix, b_matrix, c_matrix = np.asarray(a['matrix']), np.asarray(b['matrix']), np.asarray(cross['matrix'])
            if cross['firstKeys'] != a['keys'] or cross['secondKeys'] != b['keys']:
                raise ArithmeticError('Cross-weekend covariance key order mismatch')
            for key in first_keys.keys() & second_keys.keys():
                kind, identity = key
                for channel in range(3):
                    i, j = first_keys[key] + channel, second_keys[key] + channel
                    variance = a_matrix[i, i] + b_matrix[j, j] - 2 * c_matrix[i, j]
                    if variance <= 0:
                        raise ArithmeticError('Nonpositive change variance')
                    estimated = (fit['history'][second][kind][identity][channel]
                                 - fit['history'][first][kind][identity][channel]) / POINTS
                    actual = truths[second][key][channel] - truths[first][key][channel]
                    error = estimated - actual
                    samples[kind][channel].append((error, variance))
        metrics = {}
        for kind, channels in samples.items():
            metrics[kind] = []
            for entries in channels:
                values = np.asarray(entries)
                metrics[kind].append({'coverage90': float(np.mean(np.abs(values[:, 0]) <= 1.6448536269514722 * np.sqrt(values[:, 1]))),
                                      'rmsePoints': float(np.sqrt(np.mean(values[:, 0] ** 2)) * POINTS),
                                      'meanSdPoints': float(np.mean(np.sqrt(values[:, 1])) * POINTS), 'count': len(values)})
        results.append({'seed': seed, 'teamNoiseFraction': team_noise, 'metrics': metrics})
        if seed % 5 == 4:
            print(f'Completed team noise {team_noise}, {seed + 1}/{len(seeds)} seeds ({time.monotonic() - start:.1f}s)', flush=True)
rng = np.random.default_rng(88128)
summary = {}
for team_noise in (0, .3):
    subset = [row for row in results if row['teamNoiseFraction'] == team_noise]
    summary[str(team_noise)] = {}
    for kind in ('driver', 'car'):
        coverage = np.array([[metric['coverage90'] for metric in row['metrics'][kind]] for row in subset])
        samples = coverage[rng.integers(0, len(subset), (10000, len(subset)))].mean(axis=1)
        summary[str(team_noise)][kind] = {'meanCoverage90': coverage.mean(axis=0).tolist(),
                                         'seedBootstrap95': np.quantile(samples, [.025, .975], axis=0).T.tolist()}
output = {'inputSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'dateRange': [evidence[0]['date'], evidence[-1]['date']],
          'weekendPairs': pairs, 'seeds': seeds, 'channels': ['qual', 'race', 'overall'], 'summary': summary,
          'results': results,
          'limitations': 'Change coverage is measured on simulated states with shared driver and optional team race noise and real comparison graphs. Pairs and two dates within a seed are dependent; bootstrap resamples seeds. Hyperparameters and true dynamics match the assumed model. These results do not establish calibration for real drivers or cars.'}
Path('research/retrospective-refit/validation-change-coverage.json').write_text(json.dumps(output, indent=2, allow_nan=False))
