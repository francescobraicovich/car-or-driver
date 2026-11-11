"""Small known-state diagnostic of the meaning of slow and fast outputs."""
import json
from datetime import date, timedelta

import numpy as np
from scipy.special import expit

from fit import DIRECTORY, REPORTS
from model import UnifiedModel, FormModel, state_components, POINTS
from unified_model import correlation, TIME_UNIT


def world(seed, with_form, parameters, form, length=100):
    rng = np.random.default_rng(seed)
    drivers, cars = 8, 4
    truth = {}
    for kind, count, initial in [('driver', drivers, 20), ('car', cars, 50)]:
        sharing = correlation(parameters[f'{kind}_correlation'])
        truth[kind] = dict(slow=rng.multivariate_normal(np.zeros(3), sharing * (initial / POINTS) ** 2, count),
                           fast=np.zeros((count, 3)), sharing=sharing)
    assignment = np.arange(drivers) // 2
    retention = 2 ** (-14 / form['half_life_days'])
    for index in range(length):
        if index == 55:
            assignment[[0, 2]] = assignment[[2, 0]]
        for kind, count in [('driver', drivers), ('car', cars)]:
            group = truth[kind]
            drift = 8 * np.sqrt(14 / 365.25) if kind == 'driver' else 6
            group['slow'] += rng.multivariate_normal(np.zeros(3), group['sharing'] * (drift / POINTS) ** 2, count)
            group['fast'] *= retention
            if with_form:
                group['fast'] += rng.multivariate_normal(np.zeros(3), group['sharing'] * (1 - retention ** 2) * (form[f'{kind}_sd'] / POINTS) ** 2, count)
        if index == 70:
            truth['car']['slow'][0] += .8
        package = truth['driver']['slow'] + truth['driver']['fast'] + (truth['car']['slow'] + truth['car']['fast'])[assignment]
        performance = package + rng.gumbel(size=package.shape) * np.r_[parameters['noise'], 1]
        entries = [dict(driver=str(driver), car=str(assignment[driver])) for driver in range(drivers)]
        rows = []
        for a in range(drivers):
            for b in range(a + 1, drivers):
                same = assignment[a] == assignment[b]
                for channel in range(3):
                    rows.append(dict(a=str(a), b=str(b), ca=str(assignment[a]), cb=str(assignment[b]), channel=channel,
                                     target=(performance[a, channel] - performance[b, channel]) * TIME_UNIT if channel < 2 else int(performance[a, channel] > performance[b, channel]),
                                     weight=(1 if same else 1 / (drivers - 1)) * (1 if channel == 0 else .75)))
        weekend = dict(date=(date(2020, 1, 1) + timedelta(days=14 * index)).isoformat(), entries=entries)
        yield index, weekend, rows, truth


def main():
    settings = json.loads((DIRECTORY / 'input.json').read_text())['settings']['parameters']
    form = json.loads((REPORTS / 'parameters.json').read_text())['embedded']['parameters']
    results = []
    for with_form in (False, True):
        for seed in (61, 62):
            models = dict(baseline=UnifiedModel(settings), embedded=FormModel(settings, form, True))
            errors = {name: {key: [] for key in ('slow', 'total', 'fast', 'prediction')} for name in models}
            for index, weekend, observations, truth in world(seed, with_form, settings, form):
                for name, model in models.items():
                    model.begin(weekend)
                    if index >= 25:
                        prediction = model.predict(observations)
                        for row, estimate in zip(observations, prediction):
                            if row['channel'] == 2:
                                p = expit(estimate['mean'] / np.sqrt(1 + np.pi * estimate['variance'] / 8))
                                errors[name]['prediction'].append(-np.log(p if row['target'] else 1 - p))
                    model.update(observations)
                    if index < 25:
                        continue
                    snapshot = state_components(model, weekend['entries'])
                    for kind in ('driver', 'car'):
                        ids = list(snapshot[kind])
                        actual_slow = truth[kind]['slow'][[int(identity) for identity in ids]]
                        actual_fast = truth[kind]['fast'][[int(identity) for identity in ids]]
                        actual_slow -= actual_slow.mean(axis=0)
                        actual_fast -= actual_fast.mean(axis=0)
                        estimated = np.array([snapshot[kind][identity] for identity in ids]) / POINTS
                        errors[name]['slow'].extend(((estimated[:, :3] - actual_slow) * POINTS).ravel() ** 2)
                        errors[name]['fast'].extend(((estimated[:, 3:] - actual_fast) * POINTS).ravel() ** 2)
                        errors[name]['total'].extend(((estimated[:, :3] + estimated[:, 3:] - actual_slow - actual_fast) * POINTS).ravel() ** 2)
            for name, values in errors.items():
                results.append(dict(world='transient_form' if with_form else 'persistent_only', seed=seed, model=name,
                                    **{key + ('LogLoss' if key == 'prediction' else 'RMSE'): float(np.mean(value) if key == 'prediction' else np.sqrt(np.mean(value))) for key, value in values.items()}))
    (REPORTS / 'simulation-results.json').write_text(json.dumps(dict(results=results,
        interpretation='Two paired seeds in two illustrative worlds, including a transfer and permanent car improvement. This checks decomposition behavior, not real-world causal identification.'), indent=2) + '\n')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
