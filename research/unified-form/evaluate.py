"""Information-matched form comparison with whole-season uncertainty."""
import json
from pathlib import Path

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import expit, logit

from model import POINTS
from unified_calibration import fit_calibration, outcome_probability, timing_distribution, binary_loss

FOLDS = [(2008, 2011), (2012, 2015), (2016, 2020), (2021, 2025), (2026, 2026)]
DIRECTORY = Path('tmp/unified-form')
REPORTS = Path('research/unified-form')


def weighted_mean(values, rows):
    return float(np.average(values, weights=balanced_weights(rows)))


def balanced_weights(rows):
    _, inverse = np.unique(rows[:, 0], return_inverse=True)
    totals = np.bincount(inverse, weights=rows[:, 10])
    return rows[:, 10] / totals[inverse]


def binary_summary(rows, probabilities):
    if not len(rows):
        return None
    weight = balanced_weights(rows)
    logits = logit(np.clip(probabilities, 1e-8, 1 - 1e-8))
    slope = minimize_scalar(lambda value: np.average(binary_loss(rows[:, 3], expit(value * logits)), weights=weight),
                            bounds=(.1, 3), method='bounded').x
    reliability = []
    # Fold orientations together so the bins describe favourite probability.
    favourite = np.maximum(probabilities, 1 - probabilities)
    observed = np.where(probabilities >= .5, rows[:, 3], 1 - rows[:, 3])
    for low in np.arange(.5, 1, .1):
        mask = (favourite >= low) & (favourite < low + .1)
        if mask.any():
            reliability.append(dict(fromProbability=round(float(low), 2), count=int(mask.sum()),
                                    predicted=float(np.average(favourite[mask], weights=weight[mask])),
                                    observed=float(np.average(observed[mask], weights=weight[mask]))))
    return dict(logLoss=weighted_mean(binary_loss(rows[:, 3], probabilities), rows),
                brier=weighted_mean((rows[:, 3] - probabilities) ** 2, rows),
                calibrationSlope=float(slope), weekends=int(len(np.unique(rows[:, 0]))),
                pairs=len(rows), reliability=reliability)


def season_interval(rows, values, seed=478):
    rng = np.random.default_rng(seed)
    years = np.unique(rows[:, 1])
    balanced = balanced_weights(rows)
    sums = np.array([np.sum(values[rows[:, 1] == year] * balanced[rows[:, 1] == year]) for year in years])
    weights = np.array([np.sum(balanced[rows[:, 1] == year]) for year in years])
    sample = rng.integers(0, len(years), (4000, len(years)))
    return np.quantile(sums[sample].sum(axis=1) / weights[sample].sum(axis=1), [.025, .975]).tolist()


def score_candidate(kind):
    saved = np.load(DIRECTORY / f'{kind}.npz')
    rows, contexts = saved['rows'], saved['contexts']
    forecasts = np.full(len(rows), np.nan)
    scales = np.full(len(rows), np.nan)
    calibrations = []
    for first, last in FOLDS:
        for channel in range(3):
            training = rows[(rows[:, 1] >= 2002) & (rows[:, 1] < first) & (rows[:, 2] == channel)]
            current = (rows[:, 1] >= first) & (rows[:, 1] <= last) & (rows[:, 2] == channel)
            fit = fit_calibration(training, channel)
            calibrations.append(dict(fromYear=first, channel=channel, **fit))
            if channel == 2:
                forecasts[current] = outcome_probability(rows[current], np.log(fit['slope']))
            else:
                mean, scale, _ = timing_distribution(rows[current], np.log([fit['slope'], fit['noise']]))
                forecasts[current], scales[current] = mean, scale
    report = dict(blocks=[], calibrations=calibrations)
    for first, last in [(2008, 2025), *FOLDS]:
        mask = (rows[:, 1] >= first) & (rows[:, 1] <= last)
        result = dict(fromYear=first, toYear=last)
        for channel, name in enumerate(('qualifying', 'racePace', 'overall')):
            use = mask & (rows[:, 2] == channel)
            if channel == 2:
                result[name] = binary_summary(rows[use], forecasts[use])
                for title, condition in [('teammates', rows[:, 6] == 1), ('normalFinishers', rows[:, 7] == 1),
                                         ('retirements', rows[:, 7] == 0), ('initialTransferAppearances', contexts[:, 4] == 1)]:
                    select = use & condition
                    result[title] = binary_summary(rows[select], forecasts[select])
            else:
                difference = np.abs(rows[use, 3] - forecasts[use])
                result[name] = dict(mae=weighted_mean(difference, rows[use]),
                                    coverage90=weighted_mean(difference <= np.log(19) * scales[use], rows[use]))
        if last == 2025 and first == 2008:
            report['historical'] = result
        else:
            report['blocks'].append(result)
    np.savez_compressed(DIRECTORY / f'{kind}-scores.npz', predictions=forecasts, scales=scales)
    history = json.loads((DIRECTORY / f'{kind}-history.json').read_text())
    movements = {key: [] for key in ('driverSlow', 'driverTotal', 'carSlow', 'carTotal')}
    for before, after in zip(history, history[1:]):
        if after['year'] < 2008 or after['year'] > 2025:
            continue
        for entity in ('driver', 'car'):
            for identity in set(before[entity]) & set(after[entity]):
                a, b = before[entity][identity], after[entity][identity]
                movements[f'{entity}Slow'].append(abs(b[2] - a[2]))
                movements[f'{entity}Total'].append(abs(b[2] + b[5] - a[2] - a[5]))
    report['movement90'] = {key: float(np.quantile(values, .9)) for key, values in movements.items()}
    return report


def main():
    reports = {kind: score_candidate(kind) for kind in ('baseline', 'external', 'embedded')}
    baseline = reports['baseline']
    rows = np.load(DIRECTORY / 'baseline.npz')['rows']
    mask = (rows[:, 1] >= 2008) & (rows[:, 1] <= 2025) & (rows[:, 2] == 2)
    probabilities = np.load(DIRECTORY / 'baseline-scores.npz')['predictions'][mask]
    losses = binary_loss(rows[mask, 3], probabilities)
    winner = 'baseline'
    for kind in ('external', 'embedded'):
        report = reports[kind]
        prediction = np.load(DIRECTORY / f'{kind}-scores.npz')['predictions'][mask]
        difference = binary_loss(rows[mask, 3], prediction) - losses
        report['difference'] = weighted_mean(difference, rows[mask])
        report['differenceInterval95'] = season_interval(rows[mask], difference)
        report['eligible'] = (report['difference'] <= -.001
                              and all(a['overall']['logLoss'] - b['overall']['logLoss'] <= .003
                                      for a, b in zip(report['blocks'][:4], baseline['blocks'][:4]))
                              and all(report['historical'][channel]['mae'] <= 1.02 * baseline['historical'][channel]['mae']
                                      for channel in ('qualifying', 'racePace')))
        if report['eligible'] and report['historical']['overall']['logLoss'] < reports[winner]['historical']['overall']['logLoss'] - .001:
            winner = kind
        print(kind, report['difference'], report['differenceInterval95'], report['eligible'], flush=True)
    result = dict(selected=winner, candidates=reports)
    (REPORTS / 'form-results.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Selected form:', winner, flush=True)


if __name__ == '__main__':
    main()
