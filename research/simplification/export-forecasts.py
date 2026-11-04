"""Export the accepted linear heads, Python/JavaScript fixtures and uncertainty report."""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
module_spec = importlib.util.spec_from_file_location('fit_forecasts', Path(__file__).with_name('fit-forecasts.py'))
training = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(training)


def loss_rows(frame, probability):
    p = np.clip(probability, 1e-12, 1 - 1e-12)
    outcome = frame.y.to_numpy()
    return -(outcome * np.log(p) + (1 - outcome) * np.log1p(-p))


def paired_interval(frame, new, old):
    table = pd.DataFrame({'year': frame.year.to_numpy(), 'weight': frame.w.to_numpy(),
                          'weighted_difference': frame.w.to_numpy() * (loss_rows(frame, new) - loss_rows(frame, old))})
    seasons = table.groupby('year')[['weight', 'weighted_difference']].sum().to_numpy()
    generator = np.random.default_rng(1972)
    sample = seasons[generator.integers(0, len(seasons), size=(2000, len(seasons)))].sum(axis=1)
    estimates = sample[:, 1] / sample[:, 0]
    return {'difference': float(seasons[:, 1].sum() / seasons[:, 0].sum()),
            'lower': float(np.quantile(estimates, 0.025)), 'upper': float(np.quantile(estimates, 0.975)),
            'clusters': len(seasons), 'replicates': len(estimates)}


def calibration(frame, probability):
    p = np.clip(probability, 1e-12, 1 - 1e-12)
    z = np.log(p / (1 - p))
    weights = frame.w.to_numpy()
    outcome = frame.y.to_numpy()
    slope = 1.
    for _ in range(30):
        fitted = 1 / (1 + np.exp(-np.clip(slope * z, -700, 700)))
        gradient = np.sum(weights * (outcome - fitted) * z)
        curvature = np.sum(weights * fitted * (1 - fitted) * z * z)
        if curvature < 1e-9:
            raise ValueError('Calibration is not identifiable')
        step = gradient / curvature
        slope += step
        if abs(step) < 1e-9:
            break
    favorite = np.maximum(p, 1 - p)
    observed = np.where(p >= 0.5, outcome, 1 - outcome)
    bins = []
    for lower, upper in zip(np.linspace(.5, 1, 9)[:-1], np.linspace(.5, 1, 9)[1:]):
        mask = (favorite >= lower) & ((favorite <= upper) if upper == 1 else (favorite < upper))
        if mask.any():
            bins.append({'lower': float(lower), 'upper': float(upper), 'pairs': int(mask.sum()),
                         'weight': float(weights[mask].sum()), 'forecast': float(np.average(favorite[mask], weights=weights[mask])),
                         'observed': float(np.average(observed[mask], weights=weights[mask]))})
    return {'slope': float(slope), 'reliability': bins}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rows', default='tmp/simplification/lean-forecast-rows.jsonl')
    parser.add_argument('--results', default='research/simplification/lean-forecast-results.json')
    parser.add_argument('--output', default='tmp/simplification')
    args = parser.parse_args()
    destination = ROOT / args.output
    destination.mkdir(parents=True, exist_ok=True)
    selected = 'two-speed-bounded-form-segments'
    model = json.loads((ROOT / args.results).read_text())['models'][selected]
    if not model['accepted']:
        raise ValueError('Forecast guards failed; refusing to export')
    frame = pd.read_json(ROOT / args.rows, lines=True)
    design = 'two-speed-bounded-form'
    heads = model['heads']
    # The current-season deployment fit reads only completed earlier seasons.
    deployment_year = int(frame.year.max())
    if str(deployment_year) not in heads:
        heads[str(deployment_year)] = {}
        for mode in ['pre', 'post', 'qual']:
            past = frame[frame.year.lt(deployment_year) & frame.session.eq('qual' if mode == 'qual' else 'race')]
            initial = past[past.year.lt(deployment_year - 4)]
            inner = past[past.year.ge(deployment_year - 4)]
            choices = [(training.score(inner, training.predict(inner, training.fit(initial, mode, design, c, True), design, True))['loss'], c)
                       for c in training.STRENGTHS]
            heads[str(deployment_year)][mode] = training.fit(past, mode, design, min(choices)[1], True)

    fixtures = []
    report = {'referenceCommit': '92634ea6d8116cfdd7601df24f8fbeeeb6b3b57c',
              'design': selected, 'historicalEvidence': 'Retrospective chronological folds; all historical periods previously inspected.',
              'target': 'Fixed weighted pair benchmark: finish-order, valid pace, retirement snapshots and qualifying comparisons; not unconditional race-winning probabilities.',
              'acceptedPointGuards': True, 'modes': {}, 'monitoring': {}}
    for mode in ['pre', 'post', 'qual']:
        parts = []
        probabilities = []
        for first, last in training.FOLDS:
            part = frame[frame.year.between(first, last) & frame.session.eq('qual' if mode == 'qual' else 'race')]
            head = heads[str(first)][mode]
            probability = training.predict(part, head, design, True)
            parts.append(part)
            probabilities.append(probability)
            sample = part.sample(n=min(30, len(part)), random_state=first)
            matrix, _ = training.matrix(sample, mode, design, True)
            matrix[np.abs(matrix) < 1e-7] = 0
            expected = 1 / (1 + np.exp(-(matrix.astype(np.float32).astype(float) @ np.asarray(head['coefficients']))))
            for row, prediction in zip(sample.to_dict(orient='records'), expected):
                features = {key: value for key, value in row.items() if isinstance(value, (int, float))}
                fixtures.append({'year': first, 'mode': mode, 'features': features, 'expected': float(prediction)})
        part = pd.concat(parts)
        new = np.concatenate(probabilities)
        old = np.asarray([row[mode] for row in part.published])
        report['modes'][mode] = {'new': training.score(part, new), 'reference': training.score(part, old),
                                 'pairedSeasons': paired_interval(part, new, old), 'calibration': calibration(part, new)}
        current = frame[frame.year.eq(deployment_year) & frame.session.eq('qual' if mode == 'qual' else 'race')]
        report['monitoring'][mode] = {'year': deployment_year, 'fitThrough': deployment_year - 1,
                                      'new': training.score(current, training.predict(current, heads[str(deployment_year)][mode], design, True)),
                                      'reference': training.score(current, [row[mode] for row in current.published])}
    for mode in ['pre', 'post']:
        race_parts, qual_parts = report['modes'][mode], report['modes']['qual']
        report['modes'][f'{mode}Combined'] = {name: training.combine(race_parts[name], qual_parts[name]) for name in ['new', 'reference']}
    (destination / 'selected-forecast-heads.json').write_text(json.dumps(heads, separators=(',', ':')) + '\n')
    (destination / 'selected-inference-fixtures.json').write_text(json.dumps(fixtures, separators=(',', ':')) + '\n')
    (ROOT / 'research/simplification/selected-forecast-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({mode: result['pairedSeasons'] for mode, result in report['modes'].items() if 'pairedSeasons' in result}, indent=2))


if __name__ == '__main__':
    main()
