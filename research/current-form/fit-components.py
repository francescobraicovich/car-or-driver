"""Post hoc component comparison under the declared frozen-mover priority."""
import argparse
import csv
import importlib.util
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('current_form_fit', Path(__file__).with_name('fit-forecasts.py'))
fit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fit)


def followup_checks(model):
    ordinary = model['ordinary']
    frozen = model['frozen']
    checks = {'frozenGain': frozen is not None and frozen['difference'] is not None and frozen['difference'] <= -.010,
              'preCombined': ordinary['preCombined']['candidate']['loss'] <= ordinary['preCombined']['reference']['loss']}
    for key in ('postCombined', 'qual'):
        cell = ordinary[key]
        checks[f'{key}Pooled'] = cell['candidate']['loss'] <= cell['reference']['loss'] + .001
    for fold in model['folds']:
        for key in ('preCombined', 'postCombined', 'qual'):
            cell = fold['ordinary'][key]
            checks[f'{fold["from"]}.{key}'] = cell['candidate']['loss'] <= cell['reference']['loss'] + .003
    return checks


def choose(models):
    eligible = [model for model in models.values() if all(followup_checks(model).values())]
    if not eligible:
        return None
    both = models['both']
    selected = min(eligible, key=lambda model: model['frozen']['candidate'])
    simpler = [model for model in eligible if model['mask'] != 'both'
               and model['ordinary']['preCombined']['candidate']['loss'] <= both['ordinary']['preCombined']['candidate']['loss']
               and model['frozen']['candidate'] <= both['frozen']['candidate']
               and model['frozen']['candidate'] <= selected['frozen']['candidate']]
    if simpler:
        selected = min(simpler, key=lambda model: (model['mask'] != 'none', model['frozen']['candidate']))
    return selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rows', default='tmp/current-form/features.csv')
    parser.add_argument('--frozen', default='tmp/current-form/frozen.csv')
    parser.add_argument('--adaptive', default='tmp/current-form/adaptive.csv')
    parser.add_argument('--original', default='research/current-form/results.json')
    parser.add_argument('--output', default='research/current-form/component-results.json')
    args = parser.parse_args()
    sources = [Path(__file__).resolve(), ROOT / 'research/current-form/component-protocol.md',
               ROOT / 'research/current-form/fit-forecasts.py', ROOT / 'research/current-form/protocol.md',
               ROOT / 'research/current-form/form-candidates.mjs', ROOT / args.original,
               ROOT / 'research/current-form/reference-heads.json', ROOT / 'research/current-form/reference-ratings.json',
               ROOT / 'research/current-form/check-frozen-coverage.py']
    hashes = {str(path.relative_to(ROOT)): fit.digest(path) for path in sources}
    original = json.loads((ROOT / args.original).read_text())
    if original['referenceSourceHash'] != '7a44023e0b230847':
        raise ValueError('Reference source differs')
    for path, expected in original['sourceSha256'].items():
        if fit.digest(ROOT / path) != expected:
            raise ValueError(f'Initial-trial source changed: {path}')
    for path, field in [(args.rows, 'rowsSha256'), (args.frozen, 'frozenSha256'), (args.adaptive, 'adaptiveSha256')]:
        if fit.digest(ROOT / path) != original[field]:
            raise ValueError(f'Initial-trial data changed: {path}')
    archive = json.loads((ROOT / 'research/current-form/reference-heads.json').read_text())
    if fit.digest(ROOT / 'research/current-form/reference-heads.json') != original['referenceArchiveSha256']:
        raise ValueError('Archived reference heads differ')
    with (ROOT / args.rows).open(newline='') as source:
        header = next(csv.reader(source))
    needed = set(fit.LEVELS + fit.CURRENT + [f'{name}_{part}' for name in fit.CHANNELS for part in ('driver', 'car')])
    meta = {'raceId', 'year', 'session', 'a', 'b', 'y', 'w', 'observationIndex', 'same_team',
            'reference_pre', 'reference_post', 'reference_qual', 'reference_grid'}
    columns = sorted(meta | {f'continuous__{name}' for name in needed})
    if set(columns) - set(header):
        raise ValueError(f'Missing columns: {sorted(set(columns) - set(header))}')
    dtype = {'raceId': str, 'a': str, 'b': str}
    frame = pd.read_csv(ROOT / args.rows, usecols=columns, float_precision='round_trip', dtype=dtype).reset_index(drop=True)
    frozen_columns = set(columns) - {'observationIndex'} | {'move_key', 'horizon'}
    frozen = pd.read_csv(ROOT / args.frozen, usecols=sorted(frozen_columns), float_precision='round_trip', dtype=dtype).reset_index(drop=True)
    adaptive = pd.read_csv(ROOT / args.adaptive, float_precision='round_trip')
    fit.validate(frame)
    fit.validate(frozen, True)
    # For these data every move covers all four cells, making both specified aggregations equal.
    historical = frozen[frozen.year.between(2008, 2025)]
    cells = {('race', 5), ('race', 10), ('qual', 5), ('qual', 10)}
    if historical.move_key.nunique() != 51:
        raise ValueError('Frozen move coverage differs')
    for _, rows in historical.groupby('move_key'):
        if set(zip(rows.session, rows.horizon)) != cells or rows.year.nunique() != 1:
            raise ValueError('Frozen move cell coverage differs')
    reference = {mode: frame[f'reference_{mode}'].to_numpy(dtype=float) for mode in fit.MODES}
    frozen_reference = np.where(frozen.session.eq('qual'), frozen.reference_qual, frozen.reference_pre).astype(float)
    if not np.isfinite(frozen_reference).all():
        raise ValueError('Invalid frozen reference probabilities')
    models = {'both': original['models']['continuous-both']}
    for mask in ('driver', 'car', 'none'):
        print(f'Evaluating continuous-{mask}', flush=True)
        model = fit.train_family(frame, frozen, 'continuous', mask, reference, frozen_reference)
        model['adaptiveMovers'] = fit.adaptive_summary(adaptive, frame, model['_predicted'], reference)
        models[mask] = model
    for model in models.values():
        model['followupChecks'] = followup_checks(model)
        model['followupEligible'] = all(model['followupChecks'].values())
    selected = choose(models)
    report = {'protocol': 'research/current-form/component-protocol.md', 'postHoc': True,
              'originalResultsSha256': hashes[args.original], 'originalPreGainFailed': not original['models']['continuous-both']['checks']['preGain'],
              'referenceSourceHash': original['referenceSourceHash'], 'rowsSha256': original['rowsSha256'],
              'frozenSha256': original['frozenSha256'], 'adaptiveSha256': original['adaptiveSha256'],
              'sourceSha256': hashes, 'frozenCoverage': {'moves': 51, 'cellsPerMove': 4}, 'selected': None, 'models': {}}
    if selected:
        deployment = fit.deploy(frame, selected, archive['heads'])
        heads = dict(selected['heads'])
        heads['2026'] = deployment
        for first, _ in fit.FOLDS:
            heads[str(first)] = dict(heads[str(first)], grid=archive['heads'][str(first)]['grid'])
        monitoring = {}
        for mode in fit.MODES:
            part = fit.mode_rows(frame, mode)
            part = part[part.year.eq(2026)]
            monitoring[mode] = {'candidate': fit.score(part, fit.predict(part, 'continuous', selected['mask'], mode, deployment[mode])) if len(part) else None,
                                'reference': fit.score(part, reference[mode][part.index])}
        report['selected'] = {'family': 'continuous', 'mask': selected['mask'], 'heads': heads, 'monitoring2026': monitoring}
    for mask, model in models.items():
        report['models'][mask] = {key: value for key, value in model.items() if not key.startswith('_')}
    if any(fit.digest(ROOT / path) != expected for path, expected in hashes.items()):
        raise ValueError('Follow-up source or initial results changed while fitting')
    destination = ROOT / args.output
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print('Selected:', selected['mask'] if selected else 'none', flush=True)


if __name__ == '__main__':
    main()
