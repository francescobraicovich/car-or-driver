"""Score held-out real pair observations against filtered and joint-fit modes."""
import argparse
import hashlib
import json
from pathlib import Path

from numpy.polynomial.hermite import hermgauss
from scipy.special import expit, logsumexp

import numpy as np

from retrospective_refit import POINTS, TIME_UNIT, UnifiedModel, fit_history, measurement_terms

parser = argparse.ArgumentParser()
parser.add_argument('--mode', choices=['pair', 'weekend'], default='pair')
parser.add_argument('--weekends', type=int, default=120)
parser.add_argument('--burn-in', type=int, default=20)
parser.add_argument('--predictive', action='store_true')
parser.add_argument('--input', default='tmp/retrospective-refit/input.json')
parser.add_argument('--holdout-offset', type=int, default=0)
parser.add_argument('--output-suffix', default='')
args = parser.parse_args()
weekends = json.loads(Path(args.input).read_text())[:args.weekends]
if args.weekends <= 0 or args.burn_in < 0 or args.burn_in >= len(weekends) or args.holdout_offset < 0 or args.holdout_offset >= len(weekends):
    parser.error('Invalid weekend count or burn-in')
settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
training, holdout = [], []
for weekend in weekends:
    # Hold out all channels for a small deterministic subset of pairs. Other
    # pairs from the weekend remain in training and share underlying results.
    selected, remaining = [], []
    for row in weekend['observations']:
        pair = sorted((str(row['a']), str(row['b'])))
        digest = hashlib.sha256((weekend['raceId'] + ':' + ':'.join(pair)).encode()).digest()
        held = (len(training) >= args.holdout_offset and (len(training) - args.holdout_offset) % 10 == 9) if args.mode == 'weekend' else len(training) >= args.holdout_offset and int.from_bytes(digest[:2], 'big') % 10 == 0
        (selected if held else remaining).append(row)
    training.append({**weekend, 'observations': remaining})
    holdout.append(selected)

selected_weekends = [index for index, rows in enumerate(holdout) if index >= args.burn_in and rows]
refit = fit_history(training, settings, covariance_weekends=selected_weekends if args.predictive else [])
nodes, node_weights = hermgauss(16)
log_weights = np.log(node_weights / np.sqrt(np.pi))
model = UnifiedModel(settings)
scores = {'filtered': [[], [], []], 'retrospective': [[], [], []]}
calibration = {'filtered': [[], [], []], 'retrospective': [[], [], []]}
counts = [0, 0, 0]
for index, (weekend, omitted) in enumerate(zip(training, holdout)):
    model.begin(weekend)
    model.update(weekend['observations'])
    if index < args.burn_in:
        continue
    if not omitted:
        continue
    if args.predictive:
        block = refit['covariance'][index]
        positions = {tuple(key): 3 * i for i, key in enumerate(block['keys'])}
        covariance = np.asarray(block['matrix'])
    for row in omitted:
        channel = row['channel']
        terms = [('driver', row['a'], 1), ('driver', row['b'], -1),
                 ('car', row['ca'], 1), ('car', row['cb'], -1)]
        filtered = sum(sign * model.mean[model.indices[(kind, str(identity))] + channel]
                       for kind, identity, sign in terms)
        retrospective = sum(sign * refit['history'][index][kind][str(identity)][channel] / POINTS
                            for kind, identity, sign in terms)
        target = row['target'] / TIME_UNIT if channel < 2 else row['target']
        scale = settings['noise'][channel] if channel < 2 else 1
        for name, gap in (('filtered', filtered), ('retrospective', retrospective)):
            if args.predictive:
                indices = model.indices if name == 'filtered' else positions
                matrix = model.covariance if name == 'filtered' else covariance
                selected = [indices[(kind, str(identity))] + channel for kind, identity, _ in terms]
                signs = np.array([sign for _, _, sign in terms])
                variance = max(0.0, float(signs @ matrix[np.ix_(selected, selected)] @ signs))
                gaps = gap + np.sqrt(2 * variance) * nodes
                losses = measurement_terms(gaps, target, channel, scale)[0]
                loss = -logsumexp(log_weights - losses)
                if channel < 2:
                    cdf = float(np.exp(log_weights) @ expit((target - gaps) / scale))
                    metric = float(.05 <= cdf <= .95)
                else:
                    probability = float(np.exp(log_weights) @ expit(gaps))
                    metric = (probability - target) ** 2
                calibration[name][channel].append((index, row['weight'], metric))
            else:
                loss = measurement_terms(np.array([gap]), np.array([target]), np.array([channel]), np.array([scale]))[0][0]
            scores[name][channel].append((float(loss), row['weight']))
        counts[channel] += 1
result = {'mode': args.mode, 'predictive': args.predictive, 'holdoutOffset': args.holdout_offset, 'inputSha256': hashlib.sha256(Path(args.input).read_bytes()).hexdigest(), 'heldoutRaceIds': [weekends[index]['raceId'] for index in selected_weekends], 'burnIn': args.burn_in, 'weekends': len(weekends), 'evaluatedWeekends': sum(bool(rows) for rows in holdout[args.burn_in:]), 'counts': counts,
          'channels': ['qual', 'race', 'overall'],
          'averageNegativeLogLikelihood': {name: [float(np.average(np.asarray(rows)[:, 0], weights=np.asarray(rows)[:, 1]))
                                                   for rows in channels] for name, channels in scores.items()},
          'limitations': (('Posterior predictive likelihood integrated using the local Gaussian approximation. ' if args.predictive else 'Plug-in mode likelihood; no posterior uncertainty integration. ') + 'Within-weekend pair observations are dependent. ' + ('Held-out pairs share race-level evidence with training. ' if args.mode == 'pair' else 'Entire weekends are held out from model updates. ') + 'Retrospective estimates use future races; filtered estimates do not. ' + ('Parameters were selected using later 2002–2007 training and warm-up overlapping this period.' if weekends[args.burn_in]['date'] < '2008-01-01' else ('Parameters were selected using 1994–2007 data, before this period; the additional pre-1994 warm-up was not used for tuning.' if args.holdout_offset else 'Parameters were fixed using 1994–2007 warm-up and training before this period.')))}
if args.predictive:
    def summarize(rows):
        grouped = {}
        for index, weight, metric in rows:
            totals = grouped.setdefault(index, [0.0, 0.0])
            totals[0] += weight * metric
            totals[1] += weight
        values = np.asarray(list(grouped.values()))
        rng = np.random.default_rng(18194)
        draws = rng.integers(0, len(values), (10000, len(values)))
        sums = values[draws].sum(axis=1)
        bootstrap = sums[:, 0] / sums[:, 1]
        return {'value': float(values[:, 0].sum() / values[:, 1].sum()),
                'raceClusterBootstrap95': np.quantile(bootstrap, [.025, .975]).tolist(),
                'races': len(values)}
    result['predictiveCalibration'] = {name: {metric: summarize(channels[channel])
        for channel, metric in enumerate(('qualCoverage90', 'raceCoverage90', 'overallBrier'))}
        for name, channels in calibration.items()}
Path(f"research/retrospective-refit/validation-holdout-{args.mode}-{len(weekends)}{'-predictive' if args.predictive else ''}{args.output_suffix}.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2), flush=True)
