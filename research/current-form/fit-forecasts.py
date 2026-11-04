"""Chronological comparison of fixed form families against published 7a440 heads."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parents[2]
FOLDS = [(2008, 2011), (2012, 2015), (2016, 2020), (2021, 2025)]
STRENGTHS = (0.003, 0.03, 0.3)
MODES = ('pre', 'post', 'qual')
LEVELS = ['race_driver', 'race_car', 'qual_driver', 'qual_car']
CURRENT = ['grid', 'qual_team_now', 'qual_driver_now', 'qual_gap', 'current_q1', 'current_q2', 'current_q3', 'grid_log']
CHANNELS = [f'{channel}_{speed}' for speed in ('fast', 'slow') for channel in ('qual', 'lap', 'order')]
FAMILIES = ('legacy', 'continuous', 'innovation', 'combined')

spec = importlib.util.spec_from_file_location('forecast_diagnostics', ROOT / 'research/simplification/export-forecasts.py')
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


def digest(path):
    hasher = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def names_for(family, mask, mode):
    if family == 'legacy':
        if mask != 'both':
            raise ValueError('Legacy basis has no separately refitted car component')
        forms = [f'{name}{suffix}' for name in CHANNELS for suffix in ('', '_driver')]
    else:
        forms = [f'{name}_{part}' for name in CHANNELS for part in ('driver', 'car') if mask in ('both', part)]
        if family == 'combined':
            forms += [f'innovation_{name}_{part}' for name in CHANNELS for part in ('driver', 'car') if mask in ('both', part)]
    names = LEVELS + forms + (CURRENT if mode == 'post' else [])
    return names + [f'tanh({name})' for name in names]


def matrix(frame, family, mask, mode):
    names = names_for(family, mask, mode)
    base = [name for name in names if not name.startswith('tanh(')]
    columns = [frame[f'{family}__{name}'].to_numpy(dtype=float) for name in base]
    values = np.column_stack(columns + [np.tanh(col) for col in columns])
    if not np.isfinite(values).all():
        raise ValueError(f'Invalid {family}/{mask}/{mode} feature values')
    return values, names


def fit(frame, family, mask, mode, strength):
    values, names = matrix(frame, family, mask, mode)
    weights = frame.w.to_numpy(dtype=float)
    scale = np.sqrt(np.average(values * values, axis=0, weights=weights))
    scale[scale < 1e-7] = 1
    x = values / scale
    y = frame.y.to_numpy(dtype=int)
    classifier = LogisticRegression(C=strength, fit_intercept=False, max_iter=1000, tol=1e-8)
    classifier.fit(np.concatenate([x, -x]), np.concatenate([y, 1-y]),
                   sample_weight=np.tile(weights / weights.mean(), 2) / 2)
    return {'family': 'linear', 'mode': mode, 'name': f'{family}-{mask}', 'names': names,
            'coefficients': (classifier.coef_[0] / scale).tolist(), 'strength': strength}


def predict(frame, family, mask, mode, head):
    values, names = matrix(frame, family, mask, mode)
    if names != head['names']:
        raise ValueError('Head feature schema differs')
    values[np.abs(values) < 1e-7] = 0
    values = values.astype(np.float32).astype(float)
    z = np.clip(values @ np.asarray(head['coefficients']), -700, 700)
    return 1 / (1 + np.exp(-z))


def losses(y, probability):
    p = np.clip(np.asarray(probability), 1e-12, 1 - 1e-12)
    return -(y * np.log(p) + (1-y) * np.log1p(-p))


def score(frame, probability):
    if not len(frame):
        return None
    p = np.asarray(probability, dtype=float)
    if len(p) != len(frame) or not np.isfinite(p).all() or (p < 0).any() or (p > 1).any():
        raise ValueError('Invalid probability or coverage')
    y, w = frame.y.to_numpy(), frame.w.to_numpy()
    return {'loss': float(np.average(losses(y, p), weights=w)), 'brier': float(np.average((y-p)**2, weights=w)),
            'weight': float(w.sum()), 'observations': len(frame)}


def combine(a, b):
    if a is None or b is None:
        return None
    w = a['weight'] + b['weight']
    return {key: (a[key]*a['weight'] + b[key]*b['weight'])/w for key in ('loss', 'brier')} | {'weight': w}


def paired_season(frame, new, old, repetitions=2000):
    if not len(frame):
        return None
    d = frame.w.to_numpy() * (losses(frame.y.to_numpy(), new) - losses(frame.y.to_numpy(), old))
    season = pd.DataFrame({'year': frame.year.to_numpy(), 'weight': frame.w.to_numpy(), 'difference': d}).groupby('year')[['weight', 'difference']].sum().to_numpy()
    estimate = season[:, 1].sum() / season[:, 0].sum()
    out = {'difference': float(estimate), 'clusters': len(season), 'lower': None, 'upper': None}
    if len(season) >= 3:
        gen = np.random.default_rng(1972)
        draw = season[gen.integers(0, len(season), (repetitions, len(season)))].sum(axis=1)
        values = draw[:, 1] / draw[:, 0]
        out.update(lower=float(np.quantile(values, .025)), upper=float(np.quantile(values, .975)))
    return out


def frozen_summary(frame, candidate, reference, repetitions=2000):
    if not len(frame):
        return None
    row = frame[['move_key', 'year', 'session', 'horizon', 'w', 'y']].copy()
    row['new'] = row.w * losses(row.y.to_numpy(), candidate)
    row['reference'] = row.w * losses(row.y.to_numpy(), reference)
    group = row.groupby(['move_key', 'year', 'session', 'horizon'], sort=True)[['w', 'new', 'reference']].sum().reset_index()
    group['new'] /= group.w
    group['reference'] /= group.w
    cells = [(session, horizon) for session in ('race', 'qual') for horizon in (5, 10)]
    moves = group[['move_key', 'year']].drop_duplicates().reset_index(drop=True)
    keys = list(zip(moves.move_key, moves.year))
    lookup = {key: i for i, key in enumerate(keys)}
    values = np.full((len(moves), 4, 2), np.nan)
    for row in group.itertuples(index=False):
        values[lookup[(row.move_key, row.year)], cells.index((row.session, int(row.horizon)))] = [row.new, row.reference]
    valid = np.isfinite(values[:, :, 0]).any(axis=1)
    values, moves = values[valid], moves.loc[valid].reset_index(drop=True)
    def stats(sample):
        if not np.isfinite(sample[:, :, 0]).any(axis=0).all():
            return None
        return float(np.mean(np.nanmean(sample[:, :, 0] - sample[:, :, 1], axis=0)))
    mean_new = float(np.mean(np.nanmean(values[:, :, 0], axis=0))) if len(values) and np.isfinite(values[:, :, 0]).any(axis=0).all() else None
    mean_old = float(np.mean(np.nanmean(values[:, :, 1], axis=0))) if mean_new is not None else None
    result = {'moves': len(moves), 'observations': len(frame), 'candidate': mean_new, 'reference': mean_old,
              'difference': stats(values) if len(values) else None, 'cells': {}}
    for j, (session, horizon) in enumerate(cells):
        good = np.isfinite(values[:, j, 0])
        result['cells'][f'{session}.{horizon}'] = {'moves': int(good.sum()),
            'candidate': float(values[good, j, 0].mean()) if good.any() else None,
            'reference': float(values[good, j, 1].mean()) if good.any() else None}
    gen = np.random.default_rng(1972)
    for name, labels in [('movesInterval', np.arange(len(moves))), ('seasonSensitivity', moves.year.to_numpy())]:
        clusters = np.unique(labels)
        out = {'clusters': len(clusters), 'lower': None, 'upper': None}
        if len(clusters) >= 3:
            indices = [np.flatnonzero(labels == key) for key in clusters]
            draws = []
            for _ in range(repetitions):
                sample = values[np.concatenate([indices[i] for i in gen.integers(0, len(indices), len(indices))])]
                estimate = stats(sample)
                if estimate is not None:
                    draws.append(estimate)
            if len(draws) >= 20:
                out.update(lower=float(np.quantile(draws, .025)), upper=float(np.quantile(draws, .975)))
        result[name] = out
    return result


def validate(frame, frozen=False):
    required = {'raceId', 'year', 'session', 'a', 'b', 'y', 'w'}
    if frozen:
        required |= {'move_key', 'horizon'}
    else:
        required |= {'observationIndex', 'same_team'}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f'Missing metadata columns: {sorted(missing)}')
    if frame.empty or not frame.y.isin([0, 1]).all() or not np.isfinite(frame.w).all() or (frame.w <= 0).any():
        raise ValueError('Invalid outcomes or weights')
    if frozen and (frame.move_key.isna().any() or not frame.horizon.isin([5, 10]).all()):
        raise ValueError('Invalid frozen move identities or horizons')


def mode_rows(frame, mode):
    return frame[frame.session.eq('qual' if mode == 'qual' else 'race')]


def calibration(frame, probabilities):
    try:
        return diagnostics.calibration(frame, probabilities)
    except ValueError as error:
        if str(error) != 'Calibration is not identifiable':
            raise
        return {'unavailable': 'Calibration is not identifiable'}


def ordinary_report(frame, predicted, reference):
    output = {}
    for mode in MODES:
        part = mode_rows(frame, mode)
        idx = part.index.to_numpy()
        new, old = predicted[mode][idx], reference[mode][idx]
        entry = {'candidate': score(part, new), 'reference': score(part, old),
                 'pairedSeasons': paired_season(part, new, old)}
        if len(part):
            entry['calibration'] = calibration(part, new)
            entry['referenceCalibration'] = calibration(part, old)
            for label, select in [('teammate', part.same_team.astype(bool).to_numpy()), ('field', ~part.same_team.astype(bool).to_numpy())]:
                sub = part.iloc[np.flatnonzero(select)]
                entry[label] = {'candidate': score(sub, new[select]), 'reference': score(sub, old[select]),
                                'pairedSeasons': paired_season(sub, new[select], old[select])}
        output[mode] = entry
    grid_rows = mode_rows(frame, 'pre')
    if 'reference_grid' in grid_rows:
        grid = grid_rows.reference_grid.to_numpy(dtype=float)
        output['grid'] = {'candidate': score(grid_rows, grid), 'reference': score(grid_rows, grid),
                          'pairedSeasons': paired_season(grid_rows, grid, grid)}
    for mode in ('pre', 'post'):
        combined = {key: combine(output[mode][key], output['qual'][key]) for key in ('candidate', 'reference')}
        race, qual = mode_rows(frame, mode), mode_rows(frame, 'qual')
        parts = pd.concat([race, qual])
        combined['pairedSeasons'] = paired_season(parts, np.concatenate([predicted[mode][race.index], predicted['qual'][qual.index]]),
            np.concatenate([reference[mode][race.index], reference['qual'][qual.index]]))
        output[f'{mode}Combined'] = combined
    return output


def train_family(frame, frozen, family, mask, reference, frozen_reference):
    n, nf = len(frame), len(frozen)
    predicted = {mode: np.full(n, np.nan) for mode in MODES}
    frozen_predicted = np.full(nf, np.nan)
    heads, folds, inner_scores = {}, [], {}
    for first, last in FOLDS:
        head_set, selected_inner = {}, {}
        for mode in MODES:
            relevant = mode_rows(frame, mode)
            past = relevant[relevant.year.lt(first)]
            initial, inner = past[past.year.lt(first-4)], past[past.year.ge(first-4)]
            if initial.empty or inner.empty:
                raise ValueError(f'Empty training prefix or inner block: {first}/{mode}')
            choices = []
            for strength in STRENGTHS:
                head = fit(initial, family, mask, mode, strength)
                choice_loss = score(inner, predict(inner, family, mask, mode, head))['loss']
                choices.append((choice_loss, strength))
            selected_inner[mode] = {'loss': min(choices)[0], 'strength': min(choices)[1], 'weight': float(inner.w.sum())}
            head = fit(past, family, mask, mode, min(choices)[1])
            head_set[mode] = head
            part = relevant[relevant.year.between(first, last)]
            predicted[mode][part.index] = predict(part, family, mask, mode, head)
            if mode != 'post':
                transfer = mode_rows(frozen, mode)
                transfer = transfer[transfer.year.between(first, last)]
                if len(transfer):
                    frozen_predicted[transfer.index] = predict(transfer, family, mask, mode, head)
        heads[str(first)] = head_set
        inner_scores[first] = selected_inner
        block = frame[frame.year.between(first, last)]
        transfer = frozen[frozen.year.between(first, last)]
        block_report = ordinary_report(block, predicted, reference)
        transfer_report = frozen_summary(transfer, frozen_predicted[transfer.index], frozen_reference[transfer.index])
        folds.append({'from': first, 'to': last, 'ordinary': block_report, 'frozen': transfer_report})
    validation = frame[frame.year.between(FOLDS[0][0], FOLDS[-1][1])]
    transfer = frozen[frozen.year.between(FOLDS[0][0], FOLDS[-1][1])]
    ordinary = ordinary_report(validation, predicted, reference)
    frozen_result = frozen_summary(transfer, frozen_predicted[transfer.index], frozen_reference[transfer.index])
    checks = {'preGain': ordinary['preCombined']['candidate']['loss'] <= ordinary['preCombined']['reference']['loss'] - .001,
              'frozen': frozen_result is not None and frozen_result['difference'] is not None and frozen_result['difference'] <= 0}
    for key in ('postCombined', 'qual'):
        checks[f'{key}Pooled'] = ordinary[key]['candidate']['loss'] <= ordinary[key]['reference']['loss'] + .001
    for block in folds:
        for key in ('preCombined', 'postCombined', 'qual'):
            v = block['ordinary'][key]
            checks[f'{block["from"]}.{key}'] = v['candidate']['loss'] <= v['reference']['loss'] + .003
    return {'family': family, 'mask': mask, 'heads': heads, 'inner': inner_scores, 'ordinary': ordinary,
            'folds': folds, 'frozen': frozen_result, 'checks': checks, 'eligible': all(checks.values()),
            '_predicted': predicted, '_frozen_predicted': frozen_predicted}


def deploy(frame, model, reference_heads):
    family, mask = model['family'], model['mask']
    result = {}
    for mode in MODES:
        relevant = mode_rows(frame, mode)
        past = relevant[relevant.year.lt(2026)]
        initial, inner = past[past.year.lt(2022)], past[past.year.ge(2022)]
        choices = []
        for strength in STRENGTHS:
            head = fit(initial, family, mask, mode, strength)
            choices.append((score(inner, predict(inner, family, mask, mode, head))['loss'], strength))
        result[mode] = fit(past, family, mask, mode, min(choices)[1])
    result['grid'] = reference_heads['2026']['grid']
    return result



def verify_reference(frame, frozen, archive):
    for first, last in FOLDS:
        bundle = archive['heads'][str(first)]
        for mode in MODES:
            head = bundle[mode]
            for table in (frame, frozen):
                if table is frozen and mode == 'post':
                    continue
                part = mode_rows(table, mode)
                part = part[part.year.between(first, last)]
                if part.empty:
                    continue
                values, names = matrix(part, 'legacy', 'both', mode)
                if names != head['names']:
                    raise ValueError(f'Archived reference feature schema differs in {first}/{mode}')
                values[np.abs(values) < 1e-7] = 0
                z = values.astype(np.float32).astype(float) @ np.asarray(head['coefficients'])
                predicted = 1 / (1 + np.exp(-np.clip(z, -700, 700)))
                error = np.max(np.abs(predicted - part[f'reference_{mode}'].to_numpy(dtype=float)))
                if not np.isfinite(error) or error > 2e-6:
                    raise ValueError(f'Archived reference prediction mismatch: {first}/{mode} max error {error}')


def adaptive_summary(index, frame, predicted, reference):
    if index is None:
        return {'unavailable': 'Move-event identity mapping not supplied'}
    required = {'row_index', 'move_key', 'move_year', 'horizon', 'kind'}
    if required - set(index.columns):
        raise ValueError(f'Missing adaptive index fields: {sorted(required - set(index.columns))}')
    if index.row_index.isna().any() or not index.horizon.isin([5, 10]).all() or not index.kind.isin(['tm', 'fd']).all():
        raise ValueError('Invalid adaptive mover mapping')
    index = index[index.move_year.between(FOLDS[0][0], FOLDS[-1][1])].reset_index(drop=True)
    indices = index.row_index.to_numpy(dtype=int)
    if (indices < 0).any() or (indices >= len(frame)).any():
        raise ValueError('Adaptive index points outside forecast rows')
    observations = frame.iloc[indices].copy().reset_index(drop=True)
    for key in ('raceId', 'observationIndex', 'session', 'source'):
        if key in index and key in observations and not np.array_equal(index[key].astype(str).to_numpy(), observations[key].astype(str).to_numpy()):
            raise ValueError(f'Adaptive mapping differs at {key}')
    expected_teammate = index.kind.eq('tm').to_numpy()
    if not np.array_equal(expected_teammate, observations.same_team.astype(bool).to_numpy()):
        raise ValueError('Adaptive mapping teammate/field identity differs')
    observations['move_key'] = index.move_key.to_numpy()
    observations['year'] = index.move_year.to_numpy()
    observations['horizon'] = index.horizon.to_numpy()
    observations['kind'] = index.kind.to_numpy()
    results = {}
    for race_mode in ('pre', 'post'):
        new = np.where(observations.session.eq('qual'), predicted['qual'][indices], predicted[race_mode][indices])
        old = np.where(observations.session.eq('qual'), reference['qual'][indices], reference[race_mode][indices])
        for kind in ('tm', 'fd'):
            selected = observations.kind.eq(kind).to_numpy()
            results[f'{race_mode}.{kind}'] = frozen_summary(observations.loc[selected], new[selected], old[selected])
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rows', default='tmp/current-form/features.csv')
    parser.add_argument('--frozen', default='tmp/current-form/frozen.csv')
    parser.add_argument('--output', default='research/current-form/results.json')
    parser.add_argument('--adaptive', default='tmp/current-form/adaptive.csv')
    parser.add_argument('--metadata', default='tmp/current-form/metadata.json')
    args = parser.parse_args()
    sources = [Path(__file__).resolve(), ROOT / 'research/current-form/protocol.md', ROOT / 'research/current-form/form-candidates.mjs']
    source_hashes = {str(path.relative_to(ROOT)): digest(path) for path in sources}
    metadata = json.loads((ROOT / args.metadata).read_text())
    ratings = json.loads((ROOT / 'research/current-form/reference-ratings.json').read_text())
    if (metadata.get('referenceSourceHash') != '7a44023e0b230847' or ratings.get('sourceHash') != '7a44023e0b230847'
        or metadata.get('ratingsSha256') != ratings.get('ratingsSha256')
        or abs(ratings.get('frozenMoverPrimary', 0) - 0.6888431259752807) > 1e-12
        or metadata.get('referenceArchiveSha256') != '606c5a4e824441f2592ef6a9c575712f13617d1063b835e1f2414d3735fc060f'):
        raise ValueError('Reference source, rating digest or frozen mover benchmark differs')
    for name, path in [('features', args.rows), ('frozen', args.frozen), ('adaptive', args.adaptive)]:
        item = metadata.get('files', {}).get(name, {})
        if (ROOT / item.get('path', '')).resolve() != (ROOT / path).resolve() or item.get('sha256') != digest(ROOT / path):
            raise ValueError(f'{name} export provenance differs')
    frame = pd.read_csv(ROOT / args.rows, float_precision='round_trip', dtype={'raceId': str, 'a': str, 'b': str}).reset_index(drop=True)
    frozen = pd.read_csv(ROOT / args.frozen, float_precision='round_trip', dtype={'raceId': str, 'a': str, 'b': str}).reset_index(drop=True)
    validate(frame)
    validate(frozen, True)
    if len(frame) != metadata['files']['features']['rows'] or len(frozen) != metadata['files']['frozen']['rows']:
        raise ValueError('Export row counts differ from metadata')
    archive_path = ROOT / 'research/current-form/reference-heads.json'
    if digest(archive_path) != '606c5a4e824441f2592ef6a9c575712f13617d1063b835e1f2414d3735fc060f':
        raise ValueError('Archived reference head file differs from the frozen copy')
    archive = json.loads(archive_path.read_text())
    if archive['sourceHash'] != '7a44023e0b230847':
        raise ValueError('Unexpected reference head source')
    for mode in MODES:
        relevant = mode_rows(frame, mode)
        if not np.isfinite(relevant[f'reference_{mode}']).all():
            raise ValueError(f'Missing {mode} reference predictions')
    verify_reference(frame, frozen, archive)
    reference = {mode: frame[f'reference_{mode}'].to_numpy(dtype=float) for mode in MODES}
    frozen_reference = np.where(frozen.session.eq('qual'), frozen.reference_qual, frozen.reference_pre).astype(float)
    if not np.isfinite(frozen_reference).all():
        raise ValueError('Missing same-cutoff reference predictions for frozen movers')
    adaptive_path = ROOT / args.adaptive
    adaptive = pd.read_csv(adaptive_path, float_precision='round_trip')
    if len(adaptive) != metadata['files']['adaptive']['rows']:
        raise ValueError('Adaptive export row count differs from metadata')
    models = {}
    for family in FAMILIES:
        print(f'Evaluating {family}-both', flush=True)
        models[f'{family}-both'] = train_family(frame, frozen, family, 'both', reference, frozen_reference)
        models[f'{family}-both']['adaptiveMovers'] = adaptive_summary(adaptive, frame, models[f'{family}-both']['_predicted'], reference)
    single_best = min(models[f'{f}-both']['ordinary']['preCombined']['candidate']['loss'] for f in ('continuous', 'innovation'))
    combined = models['combined-both']
    combined['checks']['incrementalComplexity'] = combined['ordinary']['preCombined']['candidate']['loss'] <= single_best - .002
    combined['eligible'] = all(combined['checks'].values())
    eligible = [v for k, v in models.items() if k != 'legacy-both' and v['eligible']]
    selected = min(eligible, key=lambda m: m['frozen']['candidate']) if eligible else None
    if selected:
        for mask in ('driver', 'car', 'none'):
            print(f'Evaluating {selected["family"]}-{mask}', flush=True)
            model = train_family(frame, frozen, selected['family'], mask, reference, frozen_reference)
            if model['family'] == 'combined':
                model['checks']['incrementalComplexity'] = model['ordinary']['preCombined']['candidate']['loss'] <= single_best - .002
                model['eligible'] = all(model['checks'].values())
            model['adaptiveMovers'] = adaptive_summary(adaptive, frame, model['_predicted'], reference)
            models[f'{selected["family"]}-{mask}'] = model
        options = [models[f'{selected["family"]}-{mask}'] for mask in ('none', 'driver', 'car')]
        supported = [m for m in options if m['eligible'] and m['ordinary']['preCombined']['candidate']['loss'] <= selected['ordinary']['preCombined']['candidate']['loss'] and m['frozen']['candidate'] <= selected['frozen']['candidate']]
        if supported:
            selected = min(supported, key=lambda m: (m['mask'] != 'none', m['frozen']['candidate']))
    nested = []
    for first, last in FOLDS:
        def inner_loss(model):
            parts = model['inner'][first]
            return (parts['pre']['loss']*parts['pre']['weight'] + parts['qual']['loss']*parts['qual']['weight'])/(parts['pre']['weight']+parts['qual']['weight'])
        chosen = min((models[f'{family}-both'] for family in FAMILIES), key=inner_loss)
        nested.append({'from': first, 'to': last, 'selected': chosen['family'], 'selectionThrough': first-1,
                       'innerPreCombinedLoss': inner_loss(chosen), 'outer': chosen['folds'][FOLDS.index((first, last))]['ordinary']})
    result = {'protocol': 'research/current-form/protocol.md', 'referenceSourceHash': archive['sourceHash'],
              'rowsSha256': digest(ROOT / args.rows),
              'frozenSha256': digest(ROOT / args.frozen),
              'adaptiveSha256': digest(adaptive_path) if adaptive_path.exists() else None,
              'referenceArchiveSha256': digest(archive_path),
              'sourceSha256': source_hashes,
              'historicalEvidence': 'Retrospective chronological validation; historical seasons informed development.',
              'adaptiveMovers': 'Adaptive pre- and post-qualifying scores are reported separately by model and teammate/field kind.', 'nestedSelection': nested,
              'selected': None, 'models': {}}
    if selected:
        deployment = deploy(frame, selected, archive['heads'])
        selected['heads']['2026'] = deployment
        for first, _ in FOLDS:
            selected['heads'][str(first)]['grid'] = archive['heads'][str(first)]['grid']
        monitoring = {}
        for mode in MODES:
            part = mode_rows(frame, mode)
            part = part[part.year.eq(2026)]
            monitoring[mode] = {'candidate': score(part, predict(part, selected['family'], selected['mask'], mode, deployment[mode])) if len(part) else None,
                                'reference': score(part, reference[mode][part.index])}
        result['selected'] = {'family': selected['family'], 'mask': selected['mask'], 'heads': selected['heads'], 'monitoring2026': monitoring}
    for key, model in models.items():
        result['models'][key] = {name: value for name, value in model.items() if not name.startswith('_')}
    if any(digest(path) != source_hashes[str(path.relative_to(ROOT))] for path in sources):
        raise ValueError('Protocol or model source changed during fitting')
    destination = ROOT / args.output
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print('Selected:', result['selected']['family'] + '-' + result['selected']['mask'] if selected else 'none; published heads retained', flush=True)


if __name__ == '__main__':
    main()
