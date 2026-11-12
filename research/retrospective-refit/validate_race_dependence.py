"""Coverage under shared race-level noise and the actual comparison graph."""
from datetime import date
import hashlib
import json
import time
from pathlib import Path

import numpy as np

from retrospective_refit import POINTS, TIME_UNIT, UnifiedModel, correlation, fit_history
from validate_simulation import SETTINGS, empty, measure, report

INPUT = Path('tmp/retrospective-refit/input.json')
INDICES = [0, 19, 39, 59]
SEEDS = list(range(30))


def simulate(seed, team_noise, weekends):
    rng = np.random.default_rng(seed)
    states = {}
    history, truths = [], []
    previous = None
    correlations = {kind: correlation(SETTINGS[f'{kind}_correlation']) for kind in ('driver', 'car')}
    for weekend in weekends:
        day = date.fromisoformat(weekend['date'])
        elapsed = (day - previous).days / 365.25 if previous else 0
        winter = previous is not None and day.year != previous.year
        active_cars = {str(entry['car']) for entry in weekend['entries']}
        for (kind, identity), state in states.items():
            if kind == 'driver':
                variance = (4 * SETTINGS['driver_multiplier'] / POINTS) ** 2 * elapsed
            else:
                variance = (9 * (identity in active_cars) + 225 * winter) * (SETTINGS['car_multiplier'] / POINTS) ** 2
            if variance:
                states[(kind, identity)] = state + rng.multivariate_normal(np.zeros(3), correlations[kind] * variance)
        for entry in weekend['entries']:
            for kind in ('driver', 'car'):
                key = (kind, str(entry[kind]))
                if key not in states:
                    initial = ((20 if kind == 'driver' else 50) / POINTS) ** 2
                    states[key] = rng.multivariate_normal(np.zeros(3), correlations[kind] * initial)
        drivers = {str(entry['driver']): str(entry['car']) for entry in weekend['entries']}
        car_noise = {car: rng.gumbel(size=3) for car in dict.fromkeys(drivers.values())}
        performance = {}
        for driver, car in drivers.items():
            scales = np.array([*SETTINGS['noise'], 1])
            individual = rng.gumbel(size=3)
            noise = scales * (np.sqrt(1 - team_noise ** 2) * individual + team_noise * car_noise[car])
            performance[driver] = states[('driver', driver)] + states[('car', car)] + noise
        observations = []
        for row in weekend['observations']:
            channel = row['channel']
            gap = performance[str(row['a'])][channel] - performance[str(row['b'])][channel]
            target = gap * TIME_UNIT if channel < 2 else int(gap > 0)
            observations.append({**row, 'target': float(target) if channel < 2 else target})
        history.append({**weekend, 'observations': observations})
        truths.append({key: value.copy() for key, value in states.items()})
        previous = day
    return history, truths


def groups_for(weekend, truth):
    entries = [(str(row['driver']), str(row['car'])) for row in weekend['entries']]
    cars = list(dict.fromkeys(car for _, car in entries))
    drivers = [{'terms': [('driver', driver, 1)], 'truth': truth[('driver', driver)]} for driver, _ in entries]
    cars = [{'terms': [('car', car, 1)], 'truth': truth[('car', car)]} for car in cars]
    packages = [{'terms': [('driver', driver, 1), ('car', car, 1)],
                 'truth': truth[('driver', driver)] + truth[('car', car)]} for driver, car in entries]
    return {name: [(items[a], items[b]) for a in range(len(items)) for b in range(a + 1, len(items))]
            for name, items in (('driver', drivers), ('car', cars), ('package', packages))}


def run():
    start = time.monotonic()
    results = []
    evidence = json.loads(INPUT.read_text())[310:370]
    if len(evidence) != 60:
        raise ValueError('The race dependency exam requires 60 weekends from index 310')
    for team_noise in (0, .3):
        for seed in SEEDS:
            weekends, truths = simulate(seed, team_noise, evidence)
            refit = fit_history(weekends, SETTINGS, covariance_weekends=INDICES)
            filtered = UnifiedModel(SETTINGS)
            samples = {'filtered': empty(), 'retrospective': empty()}
            for index, (weekend, truth) in enumerate(zip(weekends, truths)):
                filtered.begin(weekend)
                filtered.update(weekend['observations'])
                if index not in INDICES:
                    continue
                groups = groups_for(weekend, truth)
                measure(filtered.mean, filtered.covariance, filtered.indices, groups, samples['filtered'])
                block = refit['covariance'][index]
                keys = [tuple(key) for key in block['keys']]
                positions = {key: i * 3 for i, key in enumerate(keys)}
                estimates = np.concatenate([refit['history'][index][kind][identity] for kind, identity in keys]) / POINTS
                measure(estimates, np.asarray(block['matrix']), positions, groups, samples['retrospective'])
            results.append({'seed': seed, 'teamNoiseFraction': team_noise,
                            'models': {name: report(value) for name, value in samples.items()}})
            print(f'Completed team noise {team_noise}, seed {seed} ({time.monotonic() - start:.1f}s)', flush=True)
    bootstrap = np.random.default_rng(82401)
    summary = {}
    for team_noise in (0, .3):
        selected = [row for row in results if row['teamNoiseFraction'] == team_noise]
        summary[str(team_noise)] = {}
        for model in ('filtered', 'retrospective'):
            summary[str(team_noise)][model] = {}
            for kind in ('driver', 'car', 'package'):
                coverage = np.array([[value['coverage90'] for value in row['models'][model][kind]] for row in selected])
                indices = bootstrap.integers(0, len(selected), (10000, len(selected)))
                means = coverage[indices].mean(axis=1)
                summary[str(team_noise)][model][kind] = {'meanCoverage90': coverage.mean(axis=0).tolist(),
                    'seedBootstrap95': np.quantile(means, [.025, .975], axis=0).T.tolist()}
    result = {'inputSha256': hashlib.sha256(INPUT.read_bytes()).hexdigest(),
              'dateRange': [evidence[0]['date'], evidence[-1]['date']], 'weekendIndices': INDICES,
              'seeds': SEEDS, 'channels': ['qual', 'race', 'overall'], 'summary': summary, 'results': results,
              'limitations': 'Preserves observed entrants, dates, pair selection, channels and composite weights, but simulates outcomes. Driver-specific Gumbel noise is shared across each weekend’s comparisons; team-level Gumbel noise creates additional dependence and non-logistic pair margins. Missingness is fixed from historical data; strategy, retirements and weather are not generated. The latent dynamics and initial priors match the fitted model. Coverage outcomes within a seed are highly dependent.'}
    Path('research/retrospective-refit/validation-race-dependence.json').write_text(json.dumps(result, indent=2, allow_nan=False))


if __name__ == '__main__':
    run()
