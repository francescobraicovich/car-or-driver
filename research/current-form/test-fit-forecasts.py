"""Focused checks for form-head basis, causal mode restrictions and mover balancing."""
import importlib.util
from pathlib import Path
import numpy as np
import pandas as pd

spec = importlib.util.spec_from_file_location('current_form_fit', Path(__file__).with_name('fit-forecasts.py'))
fit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fit)

for family in fit.FAMILIES:
    for mode in fit.MODES:
        names = fit.names_for(family, 'both', mode)
        if mode != 'post':
            assert not any(name in ' '.join(names) for name in fit.CURRENT)
        assert len(names) == len(set(names))
assert not any(name.endswith('_car') for name in fit.names_for('continuous', 'driver', 'pre') if name not in fit.LEVELS)
assert 'innovation_qual_fast_driver' in fit.names_for('combined', 'both', 'pre')
rows = []
for session in ('race', 'qual'):
    for horizon in (5, 10):
        for move, count in [('a', 1), ('b', 4), ('c', 1)]:
            for _ in range(count):
                rows.append({'move_key': move, 'year': 2008, 'session': session, 'horizon': horizon, 'w': 1, 'y': 1})
frame = pd.DataFrame(rows)
reference = np.full(len(frame), 0.5)
new = np.where(frame.move_key == 'a', 0.8, 0.5)
result = fit.frozen_summary(frame, new, reference, repetitions=100)
expected = (-np.log(.8) + np.log(.5)) / 3
assert abs(result['difference'] - expected) < 1e-12
assert result['moves'] == 3
assert result['movesInterval']['clusters'] == 3
assert result['movesInterval']['lower'] < result['movesInterval']['upper']
try:
    fit.validate(pd.DataFrame([{'y': 2, 'w': 1}]))
    raise AssertionError('Invalid observations should fail')
except ValueError:
    pass
print('Current form fitter tests passed')

# Exercise chronological fitting, indexed paired reporting and all four frozen cells.
generator = np.random.default_rng(1972)
features = sorted(set(name.removeprefix('tanh(').removesuffix(')') for mode in fit.MODES for name in fit.names_for('continuous', 'both', mode)))
ordinary = []
for year in range(1994, 2026):
    for session in ('race', 'qual'):
        for i in range(30):
            row = {'year': year, 'session': session, 'w': 1., 'y': i % 2, 'same_team': i % 3 == 0}
            row.update({f'continuous__{name}': float(generator.normal()) for name in features})
            ordinary.append(row)
ordinary = pd.DataFrame(ordinary)
frozen_rows = []
for first, _ in fit.FOLDS:
    for session in ('race', 'qual'):
        for horizon in (5, 10):
            for driver in range(3):
                row = {'move_key': f'{first}:{driver}', 'year': first, 'session': session, 'horizon': horizon, 'w': 1., 'y': driver % 2}
                row.update({f'continuous__{name}': float(generator.normal()) for name in features})
                frozen_rows.append(row)
frozen = pd.DataFrame(frozen_rows)
refs = {mode: np.full(len(ordinary), .5) for mode in fit.MODES}
result = fit.train_family(ordinary, frozen, 'continuous', 'both', refs, np.full(len(frozen), .5))
assert len(result['folds']) == 4
assert result['frozen']['moves'] == 12
assert result['ordinary']['preCombined']['pairedSeasons']['clusters'] == 18
assert set(result['heads']) == {'2008', '2012', '2016', '2021'}
print('Chronological fitter integration test passed')

archive = {'heads': {}}
reference_ordinary, reference_frozen = [], []
for first, _ in fit.FOLDS:
    archive['heads'][str(first)] = {}
    for mode in fit.MODES:
        names = fit.names_for('legacy', 'both', mode)
        archive['heads'][str(first)][mode] = {'names': names, 'coefficients': [0.01] * len(names)}
    for session in ('race', 'qual'):
        row = {'year': first, 'session': session}
        for mode in fit.MODES:
            for name in fit.names_for('legacy', 'both', mode):
                if not name.startswith('tanh('):
                    row[f'legacy__{name}'] = .3
        for mode in ('pre', 'post') if session == 'race' else ('qual',):
            head = archive['heads'][str(first)][mode]
            matrix, _ = fit.matrix(pd.DataFrame([row]), 'legacy', 'both', mode)
            z = matrix.astype(np.float32).astype(float) @ np.asarray(head['coefficients'])
            row[f'reference_{mode}'] = float(1 / (1 + np.exp(-z[0])))
        reference_ordinary.append(row)
        reference_frozen.append(row.copy())
fit.verify_reference(pd.DataFrame(reference_ordinary), pd.DataFrame(reference_frozen), archive)
reference_frozen[0]['reference_pre'] = .1
try:
    fit.verify_reference(pd.DataFrame(reference_ordinary), pd.DataFrame(reference_frozen), archive)
    raise AssertionError('Incorrect frozen reference should fail')
except ValueError as error:
    assert 'reference prediction mismatch' in str(error)
print('Archived-head verification test passed')
