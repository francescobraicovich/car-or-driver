"""Small reversible prediction layers, fitted on past outcome errors."""
import json
from pathlib import Path

import numpy as np
from scipy.optimize import minimize, minimize_scalar
from scipy.special import expit

from evaluate import DIRECTORY, REPORTS, FOLDS, binary_summary, season_interval, weighted_mean, balanced_weights
from unified_model import hazard_probability
from unified_calibration import binary_loss, fit_calibration

PENALTIES = (.001, .01, .1)
FAMILIES = ('ratings', 'context', 'nonlinear')


def design(features, contexts, mode, family, circuits, has_form=False):
    # Every feature changes sign on reversing the competitors. No intercept.
    if family == 'overall_grid':
        return np.column_stack([features[:, 2] + features[:, 5], (contexts[:, 2] - contexts[:, 1]) / 10]), ['overall_difference', 'grid_difference']
    columns = [features[:, :6]]
    names = [f'{kind}_{channel}' for kind in ('driver', 'car') for channel in ('qual', 'race', 'overall')]
    if has_form:
        columns.append(features[:, 6:12])
        names += [f'{kind}_fast_{channel}' for kind in ('driver', 'car') for channel in ('qual', 'race', 'overall')]
    grid = (contexts[:, 2] - contexts[:, 1]) / 10
    if mode == 'grid':
        columns.append(grid[:, None])
        names.append('grid_difference')
    if family in ('context', 'nonlinear'):
        for circuit in circuits:
            selected = contexts[:, 0] == circuit
            columns.append(features[:, [2, 5]] * selected[:, None])
            names += [f'circuit_{circuit}_driver', f'circuit_{circuit}_car']
            if mode == 'grid':
                columns.append((grid * selected)[:, None])
                names.append(f'circuit_{circuit}_grid')
    if family == 'nonlinear':
        package = features[:, :3] + features[:, 3:6]
        columns.append(np.tanh(package))
        names += [f'saturated_{channel}' for channel in ('qual', 'race', 'overall')]
        if mode == 'grid':
            columns.append(np.tanh(grid)[:, None])
            names.append('saturated_grid')
    return np.column_stack(columns), names


def probability(rows, logits):
    return hazard_probability(expit(logits), rows[:, 8], rows[:, 9])


def objective_gradient(coefficients, matrix, offset, rows, penalty):
    competitive = expit(offset + matrix @ coefficients)
    predicted = hazard_probability(competitive, rows[:, 8], rows[:, 9])
    weights = rows[:, 10] / rows[:, 10].sum()
    survival = ((1 - rows[:, 8]) * (1 - rows[:, 9])) ** 60
    derivative = (predicted - rows[:, 3]) / (predicted * (1 - predicted)) * survival * competitive * (1 - competitive)
    value = weights @ binary_loss(rows[:, 3], predicted) + penalty * (coefficients @ coefficients) / 2
    gradient = matrix.T @ (weights * derivative) + penalty * coefficients
    return value, gradient


def fit_head(rows, features, contexts, mode, family, penalty, has_form=False):
    calibration = fit_calibration(rows, 2)
    circuits = sorted(int(value) for value in np.unique(contexts[:, 0])) if family != 'ratings' else []
    matrix, names = design(features, contexts, mode, family, circuits, has_form)
    scale = np.sqrt(np.average(matrix ** 2, axis=0, weights=rows[:, 10]))
    scale = np.where(scale > 1e-8, scale, 1.)
    matrix /= scale
    offset = calibration['slope'] * rows[:, 4] / np.sqrt(1 + np.pi * rows[:, 5] / 8)
    fit = minimize(objective_gradient, np.zeros(matrix.shape[1]), args=(matrix, offset, rows, penalty),
                   jac=True, method='L-BFGS-B', options=dict(ftol=1e-11, gtol=1e-7, maxiter=400))
    if not fit.success:
        raise ArithmeticError(f'Head fit failed: {fit.message}')
    return dict(family=family, mode=mode, penalty=penalty, hasForm=has_form, circuits=circuits,
                featureNames=names, scale=scale.tolist(), coefficients=fit.x.tolist(),
                baselineSlope=calibration['slope'], temperature=1.)


def head_logits(head, rows, features, contexts):
    matrix, _ = design(features, contexts, head['mode'], head['family'], head['circuits'], head['hasForm'])
    offset = head['baselineSlope'] * rows[:, 4] / np.sqrt(1 + np.pi * rows[:, 5] / 8)
    return offset + (matrix / head['scale']) @ head['coefficients']


def fit_temperature(rows, logits):
    fit = minimize_scalar(lambda log_scale: weighted_mean(binary_loss(rows[:, 3], probability(rows, logits * np.exp(log_scale))), rows),
                          bounds=(-1, 1), method='bounded')
    return float(np.exp(fit.x))


def fit_selected(rows, features, contexts, mode, family, first, has_form):
    available = (rows[:, 1] >= 2002) & (rows[:, 1] < first)
    split = first - 4
    train, validate = available & (rows[:, 1] < split), available & (rows[:, 1] >= split)
    choices = []
    for penalty in PENALTIES:
        head = fit_head(rows[train], features[train], contexts[train], mode, family, penalty, has_form)
        logits = head_logits(head, rows[validate], features[validate], contexts[validate])
        temperature = fit_temperature(rows[validate], logits)
        predicted = probability(rows[validate], temperature * logits)
        choices.append(dict(penalty=penalty, temperature=temperature,
                            score=weighted_mean(binary_loss(rows[validate, 3], predicted), rows[validate])))
    choice = min(choices, key=lambda item: item['score'])
    head = fit_head(rows[available], features[available], contexts[available], mode, family, choice['penalty'], has_form)
    head.update(temperature=choice['temperature'], fromYear=first, trainedThrough=first - 1, innerScore=choice['score'], trials=choices)
    return head


def summarize_comparison(rows, probabilities, reference):
    report = {'blocks': []}
    for first, last in [(2008, 2025), *FOLDS]:
        mask = (rows[:, 1] >= first) & (rows[:, 1] <= last) & np.isfinite(probabilities) & np.isfinite(reference)
        if not mask.any():
            continue
        summary = dict(fromYear=first, toYear=last, **binary_summary(rows[mask], probabilities[mask]))
        summary['difference'] = weighted_mean(binary_loss(rows[mask, 3], probabilities[mask]) - binary_loss(rows[mask, 3], reference[mask]), rows[mask])
        if first == 2008 and last == 2025:
            report['historical'] = summary
            report['differenceInterval95'] = season_interval(rows[mask], binary_loss(rows[mask, 3], probabilities[mask]) - binary_loss(rows[mask, 3], reference[mask]))
        else:
            report['blocks'].append(summary)
    return report


def evaluate_heads(selected):
    saved = np.load(DIRECTORY / f'{selected}.npz')
    outcomes = saved['rows'][:, 2] == 2
    rows, features, contexts = saved['rows'][outcomes], saved['features'][outcomes], saved['contexts'][outcomes]
    reference = np.load(DIRECTORY / f'{selected}-scores.npz')['predictions'][outcomes]
    report = dict(form=selected, modes={})
    for mode in ('pre', 'grid'):
        # A missing/pit-lane grid does not mean pole position. It uses pre mode.
        mask = np.ones(len(rows), dtype=bool) if mode == 'pre' else (contexts[:, 1] > 0) & (contexts[:, 2] > 0)
        current, x, context, base = rows[mask], features[mask], contexts[mask], reference[mask]
        current[:, 10] = balanced_weights(current)
        results, predictions, bundles = {}, {}, {}
        for family in FAMILIES:
            forecasts = np.full(len(current), np.nan)
            heads = []
            for first, last in FOLDS:
                head = fit_selected(current, x, context, mode, family, first, selected != 'baseline')
                use = (current[:, 1] >= first) & (current[:, 1] <= last)
                forecasts[use] = probability(current[use], head['temperature'] * head_logits(head, current[use], x[use], context[use]))
                heads.append(head)
                print(f'{mode} {family} {first}: penalty {head["penalty"]} temperature {head["temperature"]:.3f}', flush=True)
            results[family] = summarize_comparison(current, forecasts, base)
            predictions[family], bundles[family] = forecasts, heads
        winner = 'baseline'
        winner_forecast = base
        for family in FAMILIES:
            comparison = summarize_comparison(current, predictions[family], winner_forecast)
            eligible = comparison['historical']['difference'] <= -.001 and all(block['difference'] <= .003 for block in comparison['blocks'][:4])
            results[family]['incrementalComparison'] = dict(against=winner, eligible=eligible,
                                                          difference=comparison['historical']['difference'],
                                                          interval95=comparison['differenceInterval95'])
            if eligible:
                winner, winner_forecast = family, predictions[family]
        nested = np.full(len(current), np.nan)
        choices = []
        for index, (first, last) in enumerate(FOLDS):
            use = (current[:, 1] >= first) & (current[:, 1] <= last)
            available = (current[:, 1] >= first - 4) & (current[:, 1] < first)
            early = (current[:, 1] >= 2002) & (current[:, 1] < first - 4)
            baseline_fit = fit_calibration(current[early], 2)
            baseline_logits = baseline_fit['slope'] * current[available, 4] / np.sqrt(1 + np.pi * current[available, 5] / 8)
            baseline_score = weighted_mean(binary_loss(current[available, 3], probability(current[available], baseline_logits)), current[available])
            chosen, best = 'baseline', baseline_score
            for family in FAMILIES:
                score = bundles[family][index]['innerScore']
                if score < best - .001:
                    chosen, best = family, score
            nested[use] = base[use] if chosen == 'baseline' else predictions[chosen][use]
            choices.append(dict(fromYear=first, family=chosen))
        report['modes'][mode] = dict(selected=winner, candidates=results,
                                     nestedSelection=dict(choices=choices, **summarize_comparison(current, nested, base)))
        np.savez_compressed(DIRECTORY / f'heads-{mode}.npz', rows=current, features=x, contexts=context,
                            baseline=base, **predictions, selected=winner_forecast)
        (REPORTS / f'heads-{mode}.json').write_text(json.dumps(bundles, indent=2) + '\n')
        print('Selected', mode, winner, flush=True)
    (REPORTS / 'head-results.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    selected = json.loads((REPORTS / 'form-results.json').read_text())['selected']
    evaluate_heads(selected)
