"""Bounded calibration and form/head interaction checks, without new tuning."""
import json

import numpy as np

from heads import (DIRECTORY, REPORTS, FOLDS, FAMILIES, head_logits, probability,
                   fit_selected, summarize_comparison, balanced_weights)


def eligible(report):
    return report['historical']['difference'] <= -.001 and all(block['difference'] <= .003 for block in report['blocks'][:4])


def main():
    head_results = json.loads((REPORTS / 'head-results.json').read_text())
    decisions = {}
    for mode in ('pre', 'grid'):
        saved = np.load(DIRECTORY / f'heads-{mode}.npz')
        rows, features, contexts, baseline = (saved[key] for key in ('rows', 'features', 'contexts', 'baseline'))
        heads = json.loads((REPORTS / f'heads-{mode}.json').read_text())
        winner, best, best_temperature = 'baseline', baseline, False
        variants, predictions = {}, {}
        for family in FAMILIES:
            raw = np.full(len(rows), np.nan)
            for head, (first, last) in zip(heads[family], FOLDS):
                mask = (rows[:, 1] >= first) & (rows[:, 1] <= last)
                raw[mask] = probability(rows[mask], head_logits(head, rows[mask], features[mask], contexts[mask]))
            calibration = summarize_comparison(rows, saved[family], raw)
            keep_temperature = eligible(calibration)
            candidate = saved[family] if keep_temperature else raw
            comparison = summarize_comparison(rows, candidate, best)
            variants[family] = dict(raw=summarize_comparison(rows, raw, baseline),
                                    temperatureComparison=calibration, keepTemperature=keep_temperature,
                                    parent=winner, incrementalComparison=comparison, eligible=eligible(comparison))
            predictions[family] = candidate
            if eligible(comparison):
                winner, best, best_temperature = family, candidate, keep_temperature
        decisions[mode] = dict(selected=winner, keepTemperature=best_temperature, candidates=variants,
                               selectedScores=summarize_comparison(rows, best, baseline))
        np.savez_compressed(DIRECTORY / f'head-selection-{mode}.npz', rows=rows, features=features, contexts=contexts,
                            baseline=baseline, selected=best, **predictions)
        print(mode, winner, 'temperature', best_temperature, decisions[mode]['selectedScores']['historical']['difference'], flush=True)
    (REPORTS / 'head-selection.json').write_text(json.dumps(decisions, indent=2) + '\n')

    family = decisions['pre']['selected']
    if family == 'baseline':
        family = 'ratings'
    reference = np.load(DIRECTORY / 'head-selection-pre.npz')
    baseline = reference['baseline']
    same_head = reference[family]
    comparisons = {}
    winner = head_results['form']
    for form in ('external', 'embedded'):
        saved = np.load(DIRECTORY / f'{form}.npz')
        mask = saved['rows'][:, 2] == 2
        rows, features, contexts = saved['rows'][mask], saved['features'][mask], saved['contexts'][mask]
        forecasts = np.full(len(rows), np.nan)
        raw = np.full(len(rows), np.nan)
        bundles = []
        for first, last in FOLDS:
            head = fit_selected(rows, features, contexts, 'pre', family, first, True)
            mask = (rows[:, 1] >= first) & (rows[:, 1] <= last)
            logits = head_logits(head, rows[mask], features[mask], contexts[mask])
            raw[mask], forecasts[mask] = probability(rows[mask], logits), probability(rows[mask], logits * head['temperature'])
            bundles.append(head)
        calibration = summarize_comparison(rows, forecasts, raw)
        use_temperature = eligible(calibration)
        prediction = forecasts if use_temperature else raw
        same = summarize_comparison(rows, prediction, same_head)
        original = summarize_comparison(rows, prediction, baseline)
        keep = eligible(same) and eligible(original)
        comparisons[form] = dict(headFamily=family, sameHead=same, production=original,
                                 temperatureComparison=calibration, keepTemperature=use_temperature, eligible=keep)
        (REPORTS / f'heads-{form}-pre.json').write_text(json.dumps(bundles, indent=2) + '\n')
        np.savez_compressed(DIRECTORY / f'head-interaction-{form}.npz', rows=rows, prediction=prediction)
        if keep and original['historical']['logLoss'] < decisions['pre']['selectedScores']['historical']['logLoss'] - .001:
            winner = form
        print('interaction', form, original['historical']['difference'], same['historical']['difference'], keep, flush=True)
    (REPORTS / 'interaction-results.json').write_text(json.dumps(dict(selectedForm=winner, comparisons=comparisons), indent=2) + '\n')


if __name__ == '__main__':
    main()
