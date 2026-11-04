"""Nested chronological ridge comparisons for the declared forecast designs."""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parents[2]
FOLDS = [(2008, 2011), (2012, 2015), (2016, 2020), (2021, 2025)]
STRENGTHS = [0.003, 0.03, 0.3]
LEVELS = ['race_driver', 'race_car', 'qual_driver', 'qual_car']
PACE = ['lap_fast', 'lap_fast_driver']
FORM = [f'{channel}_fast{suffix}' for channel in ['qual', 'lap', 'order'] for suffix in ['', '_driver']]
CURRENT = ['grid', 'qual_team_now', 'qual_driver_now', 'qual_gap']
SEGMENTS = ['current_q1', 'current_q2', 'current_q3', 'grid_log']
DESIGNS = {
    'ratings': [],
    'pace-form': PACE,
    'one-speed-form': FORM,
    'one-speed-bounded-form': FORM,
    'one-speed-bounded-recent': FORM,
    'one-speed-bounded-context': FORM,
    'one-speed-bounded-context-recent': FORM,
    'one-speed-bounded-slow': [name.replace('_fast', '_slow') for name in FORM],
    'two-speed-bounded-form': FORM + [name.replace('_fast', '_slow') for name in FORM],
}


def matrix(frame, mode, design, segments=False):
    if mode == 'grid':
        names = ['baseline_pre'] + LEVELS + ['grid']
        values = frame[names].to_numpy(dtype=float)
        if not np.isfinite(values).all():
            raise ValueError('Invalid grid features')
        return values, names
    names = LEVELS + DESIGNS[design]
    if mode == 'post':
        names += CURRENT + (SEGMENTS if segments else [])
    columns = {name: frame[name].to_numpy(dtype=float) for name in names}
    if 'bounded' in design:
        for name in list(columns):
            columns[f'tanh({name})'] = np.tanh(columns[name])
    if 'context' in design:
        for name in names:
            for context, values in [('same_team', frame.same_team.to_numpy()), ('refuel', frame.year.le(2009).to_numpy())]:
                columns[f'{name}*{context}'] = columns[name] * values
    values = np.column_stack(list(columns.values()))
    if not np.isfinite(values).all():
        raise ValueError(f'Invalid features for {mode}/{design}')
    return values, list(columns)


def fit(frame, mode, design, strength, segments=False):
    if 'recent' in design:
        frame = frame[frame.year.gt(frame.year.max() - 8)]
    values, names = matrix(frame, mode, design, segments)
    # A regime effect cannot be learned before both regimes have occurred.
    # Otherwise a duplicate column steals half the baseline coefficient and
    # disappears at the first regulation change.
    if frame.year.le(2009).nunique() < 2:
        for column, name in enumerate(names):
            if name.endswith('*refuel'):
                values[:, column] = 0
    weights = frame.w.to_numpy(dtype=float)
    scales = np.sqrt(np.average(values * values, axis=0, weights=weights))
    scales[scales < 1e-7] = 1
    classifier = LogisticRegression(C=strength, fit_intercept=False, max_iter=1000, tol=1e-8)
    # Some sources list the winner first. Reversal preserves the no-intercept
    # likelihood and supplies both labels without learning input orientation.
    standardized = values / scales
    targets = frame.y.to_numpy()
    classifier.fit(np.concatenate([standardized, -standardized]), np.concatenate([targets, 1 - targets]),
                   sample_weight=np.tile(weights / weights.mean(), 2) / 2)
    return {'family': 'linear', 'mode': mode, 'name': design, 'names': names,
            'coefficients': (classifier.coef_[0] / scales).tolist(), 'strength': strength}


def predict(frame, head, design, segments=False):
    values, names = matrix(frame, head['mode'], design, segments)
    if names != head['names']:
        raise ValueError('Feature schema mismatch')
    logits = values @ np.asarray(head['coefficients'])
    return 1 / (1 + np.exp(-np.clip(logits, -700, 700)))


def score(frame, probability):
    probability = np.asarray(probability)
    if len(frame) != len(probability) or not len(frame) or not np.isfinite(probability).all():
        raise ValueError('Invalid forecast coverage')
    target = frame.y.to_numpy()
    weights = frame.w.to_numpy()
    probability = np.clip(probability, 1e-12, 1 - 1e-12)
    losses = -(target * np.log(probability) + (1 - target) * np.log1p(-probability))
    return {'loss': float(np.average(losses, weights=weights)),
            'brier': float(np.average((target - probability) ** 2, weights=weights)),
            'weight': float(weights.sum()), 'pairs': len(frame)}


def combine(race, qualifying):
    total = race['weight'] + qualifying['weight']
    return {key: (race[key] * race['weight'] + qualifying[key] * qualifying['weight']) / total
            for key in ['loss', 'brier']} | {'weight': total}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rows', default='tmp/simplification/forecast-rows.jsonl')
    parser.add_argument('--output', default='research/simplification/forecast-results.json')
    parser.add_argument('--designs', default=','.join(list(DESIGNS)[:4]))
    parser.add_argument('--strengths', default=','.join(map(str, STRENGTHS)))
    parser.add_argument('--segments-only', action='store_true')
    parser.add_argument('--pooled-margin', type=float, default=0.001)
    parser.add_argument('--fold-margin', type=float, default=0.002)
    parser.add_argument('--protocol', default='research/simplification/forecast-protocol.md')
    parser.add_argument('--include-grid', action='store_true')
    arguments = parser.parse_args()
    if any(not np.isfinite(value) or value <= 0 for value in [arguments.pooled_margin, arguments.fold_margin]):
        parser.error('forecast margins must be finite and positive')
    modes = ['pre', 'post', 'qual'] + (['grid'] if arguments.include_grid else [])
    strengths = [float(value) for value in arguments.strengths.split(',')]
    if not strengths or any(not np.isfinite(value) or value <= 0 for value in strengths):
        raise ValueError('Ridge strengths must be finite positive values')
    frame = pd.read_json(ROOT / arguments.rows, lines=True)
    if (frame.w <= 0).any() or not np.isfinite(frame.w).all() or not frame.y.isin([0, 1]).all():
        raise ValueError('Invalid outcomes or weights')
    report = {'protocol': arguments.protocol, 'margins': {'pooled': arguments.pooled_margin, 'fold': arguments.fold_margin}, 'models': {}}
    baseline = {}
    for first, last in FOLDS:
        test = frame[frame.year.between(first, last)]
        baseline[f'{first}-{last}'] = {}
        for mode in modes:
            part = test[test.session.eq('qual' if mode == 'qual' else 'race')]
            baseline[f'{first}-{last}'][mode] = score(part, [row[mode] for row in part.published])
    report['published'] = baseline

    for design in arguments.designs.split(','):
        if design not in DESIGNS:
            raise ValueError(f'Unknown design {design}')
        for segments in ([True] if arguments.segments_only else [False, True]):
            name = design + ('-segments' if segments else '')
            model_report = {'folds': {}, 'heads': {}}
            pooled = {mode: {'frame': [], 'probability': []} for mode in modes}
            for first, last in FOLDS:
                fold = {}
                model_report['heads'][first] = {}
                for mode in modes:
                    relevant = frame[frame.session.eq('qual' if mode == 'qual' else 'race')]
                    past = relevant[relevant.year.lt(first)]
                    inner = past[past.year.ge(first - 4)]
                    initial = past[past.year.lt(first - 4)]
                    choices = []
                    for strength in strengths:
                        head = fit(initial, mode, design, strength, segments)
                        choices.append((score(inner, predict(inner, head, design, segments))['loss'], strength))
                    strength = min(choices)[1]
                    head = fit(past, mode, design, strength, segments)
                    part = relevant[relevant.year.between(first, last)]
                    probability = predict(part, head, design, segments)
                    fold[mode] = score(part, probability)
                    fold[mode]['delta'] = fold[mode]['loss'] - baseline[f'{first}-{last}'][mode]['loss']
                    model_report['heads'][first][mode] = head
                    pooled[mode]['frame'].append(part)
                    pooled[mode]['probability'].append(probability)
                for mode in ['pre', 'post']:
                    fold[f'{mode}Combined'] = combine(fold[mode], fold['qual'])
                    old = combine(baseline[f'{first}-{last}'][mode], baseline[f'{first}-{last}']['qual'])
                    fold[f'{mode}Combined']['delta'] = fold[f'{mode}Combined']['loss'] - old['loss']
                model_report['folds'][f'{first}-{last}'] = fold
            model_report['pooled'] = {}
            for mode, rows in pooled.items():
                part = pd.concat(rows['frame'])
                probability = np.concatenate(rows['probability'])
                current = score(part, probability)
                old = score(part, [row[mode] for row in part.published])
                current['published'] = old['loss']
                current['delta'] = current['loss'] - old['loss']
                teammate = part.same_team.to_numpy(dtype=bool)
                current['teammate'] = score(part[teammate], probability[teammate])
                current['teammate']['published'] = score(part[teammate], [row[mode] for row in part[teammate].published])['loss']
                model_report['pooled'][mode] = current
            for mode in ['pre', 'post']:
                current = combine(model_report['pooled'][mode], model_report['pooled']['qual'])
                p = model_report['pooled']
                old_loss = (p[mode]['published'] * p[mode]['weight'] + p['qual']['published'] * p['qual']['weight']) / current['weight']
                current['published'] = old_loss
                current['delta'] = current['loss'] - old_loss
                model_report['pooled'][f'{mode}Combined'] = current
            guard_keys = ['preCombined', 'postCombined', 'qual'] + (['grid'] if arguments.include_grid else [])
            model_report['accepted'] = all(model_report['pooled'][key]['delta'] <= arguments.pooled_margin for key in guard_keys) and all(
                fold[key]['delta'] <= arguments.fold_margin for fold in model_report['folds'].values() for key in guard_keys)
            report['models'][name] = model_report
            print(name, 'accepted', model_report['accepted'], {key: round(model_report['pooled'][key]['delta'], 6)
                  for key in ['preCombined', 'postCombined', 'qual']}, flush=True)
            (ROOT / arguments.output).write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
