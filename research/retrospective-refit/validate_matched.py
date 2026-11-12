"""Synthetic calibration under exactly the refit's generative assumptions."""
from datetime import date, timedelta
import json
from pathlib import Path

import numpy as np

from retrospective_refit import POINTS, TIME_UNIT, UnifiedModel, correlation, fit_history
from validate_simulation import SETTINGS, empty, measure, report


def world(seed):
    rng = np.random.default_rng(seed)
    count, cars = 6, 3
    entries = [{'driver': str(i), 'car': str(i // 2)} for i in range(count)]
    dc = correlation(SETTINGS['driver_correlation'])
    cc = correlation(SETTINGS['car_correlation'])
    drivers = rng.multivariate_normal(np.zeros(3), dc * (20 / POINTS) ** 2, count)
    teams = rng.multivariate_normal(np.zeros(3), cc * (50 / POINTS) ** 2, cars)
    history, truths = [], []
    start = date(2010, 1, 1)
    for index in range(30):
        day = start + timedelta(days=14 * index)
        if index:
            drivers += rng.multivariate_normal(np.zeros(3), dc * (4 * SETTINGS['driver_multiplier'] / POINTS) ** 2 * 14 / 365.25, count)
            winter = day.year != (day - timedelta(days=14)).year
            teams += rng.multivariate_normal(np.zeros(3), cc * (9 + 225 * winter) * (SETTINGS['car_multiplier'] / POINTS) ** 2, cars)
        observations = []
        for a in range(count):
            for b in range(a + 1, count):
                gap = drivers[a] - drivers[b] + teams[a // 2] - teams[b // 2]
                for channel in range(3):
                    target = ((gap[channel] + rng.logistic(scale=SETTINGS['noise'][channel])) * TIME_UNIT
                              if channel < 2 else int(rng.random() < 1 / (1 + np.exp(-gap[channel]))))
                    observations.append({'a': str(a), 'b': str(b), 'ca': str(a // 2), 'cb': str(b // 2),
                                         'channel': channel, 'target': target, 'weight': 1})
        history.append({'date': day.isoformat(), 'entries': entries, 'observations': observations})
        truths.append((drivers.copy(), teams.copy()))
    return history, truths


samples = {'filtered': empty(), 'retrospective': empty()}
indices = [0, 9, 19, 29]
for seed in range(30):
    weekends, truths = world(seed)
    refit = fit_history(weekends, SETTINGS, covariance_weekends=indices)
    filtered = UnifiedModel(SETTINGS)
    for index, (weekend, (drivers, cars)) in enumerate(zip(weekends, truths)):
        filtered.begin(weekend)
        filtered.update(weekend['observations'])
        if index not in indices:
            continue
        d = [{'terms': [('driver', str(i), 1)], 'truth': drivers[i]} for i in range(len(drivers))]
        c = [{'terms': [('car', str(i), 1)], 'truth': cars[i]} for i in range(len(cars))]
        p = [{'terms': [('driver', str(i), 1), ('car', str(i // 2), 1)], 'truth': drivers[i] + cars[i // 2]} for i in range(len(drivers))]
        groups = {name: [(items[a], items[b]) for a in range(len(items)) for b in range(a + 1, len(items))]
                  for name, items in (('driver', d), ('car', c), ('package', p))}
        measure(filtered.mean, filtered.covariance, filtered.indices, groups, samples['filtered'])
        block = refit['covariance'][index]
        keys = [tuple(key) for key in block['keys']]
        positions = {key: i * 3 for i, key in enumerate(keys)}
        estimate = np.concatenate([refit['history'][index][kind][identity] for kind, identity in keys]) / POINTS
        measure(estimate, np.asarray(block['matrix']), positions, groups, samples['retrospective'])
    if seed % 10 == 9:
        print(f'Completed {seed + 1} simulations', flush=True)
result = {'seeds': list(range(30)), 'weekendIndices': indices, 'models': {name: report(data) for name, data in samples.items()},
          'limitations': 'Generated independent pair observations with unit weights, fixed priors and parameters; pair coverage outcomes within a world are dependent. Not representative of the composite evidence or misspecification of real races.'}
Path('research/retrospective-refit/validation-matched.json').write_text(json.dumps(result, indent=2))
