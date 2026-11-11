"""Fit a single set of relative entry offsets, then replay the fixed comparison."""
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'packages/core/python'))
from unified_model import POINTS, TIME_UNIT, measurement_terms
from newcomer_model import NewcomerModel as UnifiedModel
from unified_calibration import binary_loss

OUTPUT = ROOT / 'tmp/newcomer-priors'
REPORTS = ROOT / 'research/newcomer-priors'


def annotated(weekends):
    counts = {'driver': {}, 'car': {}}
    result = []
    for index, weekend in enumerate(weekends):
        ages = {}
        for kind in counts:
            ids = {entry[kind] for entry in weekend['entries']}
            if index == 0:
                counts[kind].update({identity: 10000 for identity in ids})
            ages[kind] = {identity: counts[kind].get(identity, 0) for identity in ids}
            for identity in ids:
                counts[kind][identity] = counts[kind].get(identity, 0) + 1
        weights = np.zeros(len(weekend['observations']))
        for kind, column in (('driver', ''), ('car', 'c')):
            for identity, age in ages[kind].items():
                if age >= 5:
                    continue
                for channel in range(3):
                    indices = [i for i, row in enumerate(weekend['observations']) if row['channel'] == channel
                               and (row[column + 'a'] == identity) != (row[column + 'b'] == identity)]
                    total = sum(weekend['observations'][i]['weight'] for i in indices)
                    for i in indices:
                        weights[i] += weekend['observations'][i]['weight'] / total
        result.append({**weekend, 'ages': ages, 'entryWeights': weights})
    return result


def offsets_for(values):
    return {kind: (np.asarray(values)[i * 3:i * 3 + 3] * POINTS).tolist() for i, kind in enumerate(('driver', 'car'))}


def objective(weekends, parameters, values):
    model = UnifiedModel({**parameters, 'newcomer_offsets': offsets_for(values)})
    total = 0.
    for weekend in weekends:
        model.begin(weekend)
        if weekend['year'] >= 2002 and np.any(weekend['entryWeights']):
            rows = [row for row, weight in zip(weekend['observations'], weekend['entryWeights']) if weight > 0]
            predictions = model.predict(rows)
            weights = weekend['entryWeights'][weekend['entryWeights'] > 0]
            channels = np.array([row['channel'] for row in rows])
            targets = np.array([row['target'] / TIME_UNIT if row['channel'] < 2 else row['target'] for row in rows])
            mean = np.array([prediction['mean'] for prediction in predictions])
            variance = np.array([prediction['variance'] for prediction in predictions])
            noise = np.array([parameters['noise'][channel] if channel < 2 else 1 for channel in channels])
            scale = np.sqrt(noise ** 2 + 3 * variance / np.pi ** 2)
            losses = measurement_terms(mean, targets, channels, scale)[0]
            binary = channels == 2
            losses[binary] = binary_loss(targets[binary], expit(mean[binary] / np.sqrt(1 + np.pi * variance[binary] / 8)))
            total += weights @ losses
        model.update(weekend['observations'])
    for i, (kind, sd) in enumerate((('driver', 20), ('car', 50))):
        scaled = values[i * 3:i * 3 + 3] * POINTS / sd
        total += .5 * scaled @ scaled
    return float(total)


def replay(weekends, parameters):
    model = UnifiedModel(parameters)
    rows, contexts, history = [], [], []
    for index, weekend in enumerate(weekends):
        model.begin(weekend)
        tests = weekend['tests']
        predictions = model.predict(tests)
        counts = [sum(row['channel'] == channel for row in tests) for channel in range(3)]
        entries = {entry['driver']: entry for entry in weekend['entries']}
        for row, prediction in zip(tests, predictions):
            channel = row['channel']
            rows.append([index, weekend['year'], channel, row['target'], prediction['mean'], prediction['variance'],
                         row['same'], row.get('bothFinish', True), row.get('hazardA', 0), row.get('hazardB', 0), 1 / counts[channel]])
            contexts.append([weekend['ages']['driver'][row['a']], weekend['ages']['driver'][row['b']],
                             weekend['ages']['car'][row['ca']], weekend['ages']['car'][row['cb']],
                             entries[row['a']].get('grid') or 0, entries[row['b']].get('grid') or 0])
        model.update(weekend['observations'])
        snapshot = model.snapshot(weekend['entries'])
        history.append({'date': weekend['date'], 'year': weekend['year'], 'raceId': weekend['raceId'],
                        **{plural: {identity: snapshot[plural][identity] for identity in {entry[kind] for entry in weekend['entries']}}
                           for kind, plural in (('driver', 'drivers'), ('car', 'cars'))}})
    return dict(rows=np.asarray(rows), contexts=np.asarray(contexts), history=history, maximumGradient=model.maximum_gradient)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tmp/unified-form/input.json'
    raw = path.read_bytes()
    data = json.loads(raw)
    parameters = json.loads((REPORTS / 'reference-settings.json').read_text())['parameters']
    weekends = annotated(data['weekends'])
    training = [weekend for weekend in weekends if weekend['year'] <= 2007]
    evaluations = 0
    started = time.monotonic()
    def score(values):
        nonlocal evaluations
        value = objective(training, parameters, values)
        evaluations += 1
        if evaluations % 7 == 1:
            print(f'Fit {evaluations}: {value:.6f}; offsets {offsets_for(values)}; {time.monotonic()-started:.1f}s', flush=True)
        return value
    initial = json.loads((REPORTS / 'mean-offset-parameters.json').read_text())['offsets']
    initial = np.array([initial[kind] for kind in ('driver', 'car')]).ravel() / POINTS
    fit = minimize(score, initial, method='L-BFGS-B', options={'ftol': 1e-8, 'gtol': 1e-4, 'eps': 1e-4, 'maxiter': 35})
    if not fit.success or not np.isfinite(fit.fun):
        raise ArithmeticError(f'Offset fit failed: {fit.message}')
    selection = dict(inputHash=hashlib.sha256(raw).hexdigest(), trainedThrough=2007, objective=float(fit.fun),
                     evaluations=evaluations, offsets=offsets_for(fit.x), parameters=parameters,
                     optimizerMessage=str(fit.message), maximumGradient=float(np.max(np.abs(fit.jac))))
    (REPORTS / 'parameters.json').write_text(json.dumps(selection, indent=2) + '\n')
    for name, fitted in [('reference', parameters), ('candidate', {**parameters, 'newcomer_offsets': selection['offsets']})]:
        result = replay(weekends, fitted)
        np.savez_compressed(OUTPUT / f'{name}.npz', rows=result['rows'], contexts=result['contexts'])
        (OUTPUT / f'{name}-history.json').write_text(json.dumps(result['history'], separators=(',', ':')))
        print(f'Completed {name}; maximum gradient {result["maximumGradient"]:.3g}', flush=True)


if __name__ == '__main__':
    main()
