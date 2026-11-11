"""Bounded training-only form selection and chronological candidate replay."""
import hashlib
import json
from pathlib import Path
import time

import numpy as np

from model import FormModel, UnifiedModel, state_components, POINTS
from unified_model import TIME_UNIT, measurement_terms

DIRECTORY = Path('tmp/unified-form')
REPORTS = Path('research/unified-form')
FORM_DEFAULTS = dict(half_life_days=28, driver_sd=8, car_sd=12, slow_multiplier=1.)


def replay(weekends, parameters, kind, form=None, training=False):
    model = FormModel(parameters, form, True) if kind == 'embedded' else UnifiedModel(parameters)
    external = FormModel(parameters, form, False) if kind == 'external' else None
    rows, features, contexts, scores, snapshots = [], [], [], [], []
    for index, weekend in enumerate(weekends):
        model.begin(weekend)
        if external is not None:
            external.begin(weekend)
        tests = weekend['observations'] if training else weekend['tests']
        predictions = model.predict(tests)
        if external is not None:
            residual = external.predict(tests)
            predictions = [dict(mean=a['mean'] + b['mean'], variance=a['variance'] + b['variance'])
                           for a, b in zip(predictions, residual)]
        if training and weekend['year'] >= 2002:
            losses = []
            for channel in range(3):
                selected = [(row, prediction) for row, prediction in zip(tests, predictions) if row['channel'] == channel]
                if not selected:
                    continue
                target = np.array([row['target'] / TIME_UNIT if channel < 2 else row['target'] for row, _ in selected])
                mean = np.array([prediction['mean'] for _, prediction in selected])
                variance = np.array([prediction['variance'] for _, prediction in selected])
                weight = np.array([row['weight'] for row, _ in selected])
                scale = np.sqrt(parameters['noise'][channel] ** 2 + 3 * variance / np.pi ** 2) if channel < 2 else np.ones(len(mean))
                if channel == 2:
                    mean /= np.sqrt(1 + np.pi * variance / 8)
                losses.append(np.average(measurement_terms(mean, target, np.full(len(mean), channel), scale)[0], weights=weight))
            if losses:
                scores.append(np.mean(losses))
        if not training:
            counts = [sum(row['channel'] == channel for row in tests) for channel in range(3)]
            before = state_components(model, weekend['entries'], external)
            entries = {row['driver']: row for row in weekend['entries']}
            for row, prediction in zip(tests, predictions):
                channel = row['channel']
                rows.append([index, weekend['year'], channel, row['target'], prediction['mean'], prediction['variance'],
                             row['same'], row.get('bothFinish', True), row.get('hazardA', 0), row.get('hazardB', 0), 1 / counts[channel]])
                driver = (np.array(before['driver'][row['a']]) - before['driver'][row['b']]) / POINTS
                car = (np.array(before['car'][row['ca']]) - before['car'][row['cb']]) / POINTS
                features.append(np.r_[driver[:3] + driver[3:], car[:3] + car[3:], driver[3:], car[3:]])
                a, b = entries[row['a']], entries[row['b']]
                contexts.append([int(weekend['circuit']), a['grid'] or 0, b['grid'] or 0,
                                 -1 if weekend['wet'] is None else int(weekend['wet']),
                                 int(any(0 < entry['moveAppearance'] <= 10 for entry in (a, b))), len(entries)])
        model.update(weekend['observations'])
        if external is not None:
            offset = np.array([prediction['mean'] for prediction in model.predict(weekend['observations'])])
            external.update(weekend['observations'], offset=offset)
        if not training:
            snapshots.append(dict(raceId=weekend['raceId'], date=weekend['date'], year=weekend['year'],
                                  **state_components(model, weekend['entries'], external)))
    if training:
        return float(np.mean(scores))
    return dict(rows=np.asarray(rows), features=np.asarray(features), contexts=np.asarray(contexts), snapshots=snapshots,
                maximumGradient=max(model.maximum_gradient, external.maximum_gradient if external is not None else 0))


def select_form(weekends, parameters, kind):
    trials, cache = [], {}
    current = dict(FORM_DEFAULTS)
    def score(form):
        key = json.dumps(form, sort_keys=True)
        if key not in cache:
            value = replay(weekends, parameters, kind, form, training=True)
            cache[key] = value
            trials.append(dict(parameters=dict(form), score=value))
            print(f'{kind}: {value:.6f} {key}', flush=True)
        return cache[key]
    for key, candidates in [('half_life_days', [28, 84]), ('driver_sd', [8, 16]), ('car_sd', [12, 24])]:
        current = min(({**current, key: value} for value in candidates), key=score)
    if kind == 'embedded':
        current = min(({**current, 'slow_multiplier': value} for value in [1., .5]), key=score)
    return dict(parameters=current, trials=trials)


def main():
    raw = (DIRECTORY / 'input.json').read_bytes()
    data = json.loads(raw)
    parameters = data['settings']['parameters']
    training = [row for row in data['weekends'] if row['year'] <= 2007]
    selection = {kind: select_form(training, parameters, kind) for kind in ('external', 'embedded')}
    selection['inputHash'] = hashlib.sha256(raw).hexdigest()
    (REPORTS / 'parameters.json').write_text(json.dumps(selection, indent=2) + '\n')
    for kind in ('baseline', 'external', 'embedded'):
        start = time.monotonic()
        result = replay(data['weekends'], parameters, kind, selection.get(kind, {}).get('parameters'))
        np.savez_compressed(DIRECTORY / f'{kind}.npz', **{key: result[key] for key in ('rows', 'features', 'contexts')})
        (DIRECTORY / f'{kind}-history.json').write_text(json.dumps(result['snapshots'], separators=(',', ':')))
        print(f'Completed {kind}: {time.monotonic() - start:.1f}s; gradient {result["maximumGradient"]:.2g}', flush=True)


if __name__ == '__main__':
    main()
