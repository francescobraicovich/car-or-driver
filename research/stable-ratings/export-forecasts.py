"""Export accepted stable-rating forecast heads, parity fixtures and diagnostics."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
REFERENCE_HASH = '928427f97ab9daf6'
DESIGN = 'two-speed-bounded-form'
SELECTED = f'{DESIGN}-segments'
MODES = ['pre', 'post', 'qual', 'grid']
DEPLOYMENT_YEAR = 2026

spec = importlib.util.spec_from_file_location('previous_forecast_export', ROOT / 'research/simplification/export-forecasts.py')
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
training = previous.training


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rows', required=True)
    parser.add_argument('--results', required=True)
    parser.add_argument('--output', default='tmp/stable-ratings')
    args = parser.parse_args()
    rows_path = ROOT / args.rows
    results_path = ROOT / args.results
    metadata = json.loads(Path(f'{rows_path}.metadata.json').read_text())
    if metadata.get('referenceSourceHash') != REFERENCE_HASH:
        raise ValueError('Forecast rows do not use the saved reference model')
    if not metadata.get('candidate') or not metadata.get('referenceFileHash'):
        raise ValueError('Forecast row metadata is incomplete')
    results = json.loads(results_path.read_text())
    model = results['models'][SELECTED]
    if not model['accepted']:
        raise ValueError('Forecast guards failed; refusing to export')
    frame = pd.read_json(rows_path, lines=True)
    if len(frame) != metadata.get('rows'):
        raise ValueError('Forecast row count differs from metadata')
    heads = model['heads']
    for first, _ in training.FOLDS:
        if any(mode not in heads[str(first)] for mode in MODES):
            raise ValueError(f'Missing fold head in {first}')
    # Deployment is fixed at 2026; no 2026 outcomes enter selection or fitting.
    heads[str(DEPLOYMENT_YEAR)] = {}
    for mode in MODES:
        relevant = frame[frame.session.eq('qual' if mode == 'qual' else 'race')]
        past = relevant[relevant.year.lt(DEPLOYMENT_YEAR)]
        initial = past[past.year.lt(DEPLOYMENT_YEAR - 4)]
        inner = past[past.year.ge(DEPLOYMENT_YEAR - 4)]
        choices = [(training.score(inner, training.predict(inner, training.fit(initial, mode, DESIGN, strength, True), DESIGN, True))['loss'], strength)
                   for strength in training.STRENGTHS]
        heads[str(DEPLOYMENT_YEAR)][mode] = training.fit(past, mode, DESIGN, min(choices)[1], True)

    fixtures = []
    report = {
        'referenceSourceHash': metadata['referenceSourceHash'],
        'referenceFileHash': metadata['referenceFileHash'],
        'rowsSha256': digest(rows_path),
        'resultsSha256': digest(results_path),
        'candidate': metadata['candidate'],
        'protocol': results['protocol'],
        'margins': results['margins'],
        'design': SELECTED,
        'historicalEvidence': 'Retrospective chronological folds; all historical periods previously inspected.',
        'target': 'Weighted pair benchmark: valid finish, pace, retirement snapshots and qualifying comparisons.',
        'acceptedPointGuards': True,
        'modes': {},
        'monitoring': {},
    }
    for mode in MODES:
        parts = []
        probabilities = []
        for first, last in training.FOLDS:
            part = frame[frame.year.between(first, last) & frame.session.eq('qual' if mode == 'qual' else 'race')]
            if len(part) < 30:
                raise ValueError(f'Insufficient fixture rows for {mode} in {first}-{last}')
            head = heads[str(first)][mode]
            probability = training.predict(part, head, DESIGN, True)
            parts.append(part)
            probabilities.append(probability)
            sample = part.sample(n=30, random_state=first)
            matrix, _ = training.matrix(sample, mode, DESIGN, True)
            matrix[np.abs(matrix) < 1e-7] = 0
            expected = 1 / (1 + np.exp(-np.clip(matrix.astype(np.float32).astype(float) @ np.asarray(head['coefficients']), -700, 700)))
            for row, prediction in zip(sample.to_dict(orient='records'), expected):
                features = {key: value for key, value in row.items() if isinstance(value, (int, float))}
                fixtures.append({'year': first, 'mode': mode, 'features': features, 'expected': float(prediction)})
        part = pd.concat(parts)
        new = np.concatenate(probabilities)
        old = np.asarray([row[mode] for row in part.published])
        report['modes'][mode] = {
            'new': training.score(part, new), 'reference': training.score(part, old),
            'pairedSeasons': previous.paired_interval(part, new, old), 'calibration': previous.calibration(part, new),
        }
        current = frame[frame.year.eq(DEPLOYMENT_YEAR) & frame.session.eq('qual' if mode == 'qual' else 'race')]
        monitoring = {'year': DEPLOYMENT_YEAR, 'fitThrough': DEPLOYMENT_YEAR - 1}
        if len(current):
            monitoring.update({'new': training.score(current, training.predict(current, heads[str(DEPLOYMENT_YEAR)][mode], DESIGN, True)),
                               'reference': training.score(current, [row[mode] for row in current.published])})
        else:
            monitoring.update({'new': None, 'reference': None})
        report['monitoring'][mode] = monitoring
    for mode in ['pre', 'post']:
        race, qual = report['modes'][mode], report['modes']['qual']
        report['modes'][f'{mode}Combined'] = {name: training.combine(race[name], qual[name]) for name in ['new', 'reference']}
    if len(fixtures) != 480:
        raise ValueError('Expected 480 parity fixtures')
    destination = ROOT / args.output
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'selected-forecast-heads.json').write_text(json.dumps(heads, separators=(',', ':')) + '\n')
    (destination / 'selected-inference-fixtures.json').write_text(json.dumps(fixtures, separators=(',', ':')) + '\n')
    (ROOT / 'research/stable-ratings/selected-forecast-report.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
