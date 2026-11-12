"""Evaluate driver, car and package gap recovery and 90% interval coverage."""
import json
import sys
import time
from pathlib import Path

import numpy as np

from retrospective_refit import POINTS, UnifiedModel, fit_history
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'unified-ratings'))
from simulation import world

SETTINGS = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
WEEKENDS = [9, 29, 59, 74, 84]


def measure(estimate, covariance, positions, groups, storage):
    for category, pairs in groups.items():
        for first, second in pairs:
            for channel in range(3):
                terms = [(kind, identity, sign) for kind, identity, sign in first['terms']] + [
                    (kind, identity, -sign) for kind, identity, sign in second['terms']]
                selected = [positions[(kind, identity)] + channel for kind, identity, _ in terms]
                signs = np.array([sign for _, _, sign in terms])
                actual = (first['truth'] - second['truth'])[channel]
                error = float(signs @ estimate[selected] - actual)
                variance = float(signs @ covariance[np.ix_(selected, selected)] @ signs)
                if variance <= 0:
                    raise ArithmeticError('Nonpositive gap variance')
                storage[category][channel].append([error, variance])


def report(storage):
    result = {}
    for category, channels in storage.items():
        result[category] = []
        for values in channels:
            values = np.asarray(values)
            errors, variances = values[:, 0], values[:, 1]
            result[category].append({'rmsePoints': float(np.sqrt(np.mean(errors ** 2)) * POINTS),
                                     'coverage90': float(np.mean(np.abs(errors) <= 1.6448536269514722 * np.sqrt(variances))),
                                     'meanSdPoints': float(np.mean(np.sqrt(variances)) * POINTS),
                                     'count': len(errors)})
    return result


def empty():
    return {key: [[], [], []] for key in ('driver', 'car', 'package')}


if __name__ == '__main__':
    results = []
    start = time.monotonic()
    for kind in ('shared', 'specialization', 'persistent_fit', 'heavy_noise'):
        for seed in (41, 42, 43):
            weekends, truths = world(seed, kind, length=85)
            result = fit_history(weekends, SETTINGS, covariance_weekends=WEEKENDS)
            filtered = UnifiedModel(SETTINGS)
            samples = {'filtered': empty(), 'retrospective': empty()}
            for index, (weekend, (drivers, cars, assignments)) in enumerate(zip(weekends, truths)):
                filtered.begin(weekend)
                filtered.update(weekend['observations'])
                if index not in WEEKENDS:
                    continue
                driver_items = [{'terms': [('driver', str(i), 1)], 'truth': drivers[i]} for i in range(len(drivers))]
                car_items = [{'terms': [('car', str(i), 1)], 'truth': cars[i]} for i in range(len(cars))]
                package_items = [{'terms': [('driver', str(i), 1), ('car', str(assignments[i]), 1)],
                                  'truth': drivers[i] + cars[assignments[i]]} for i in range(len(drivers))]
                groups = {name: [(items[a], items[b]) for a in range(len(items)) for b in range(a + 1, len(items))]
                          for name, items in (('driver', driver_items), ('car', car_items), ('package', package_items))}
                measure(filtered.mean, filtered.covariance, filtered.indices, groups, samples['filtered'])
                block = result['covariance'][index]
                keys = [tuple(key) for key in block['keys']]
                positions = {key: 3 * i for i, key in enumerate(keys)}
                estimate = np.concatenate([result['history'][index][kind][identity] for kind, identity in keys]) / POINTS
                measure(estimate, np.asarray(block['matrix']), positions, groups, samples['retrospective'])
            results.append({'world': kind, 'seed': seed, 'models': {name: report(samples[name]) for name in samples}})
        print(f'Completed {kind} ({time.monotonic() - start:.1f}s)', flush=True)
    output = {'weekendIndices': WEEKENDS, 'channels': ['qual', 'race', 'overall'], 'results': results,
              'limitations': 'Three seeds per world; dependent pairwise observations and shared truth. Coverage is descriptive, not independent binomial data. Simulation is misspecified relative to the fitted model.'}
    Path('research/retrospective-refit/validation-simulation.json').write_text(json.dumps(output, indent=2, allow_nan=False))
