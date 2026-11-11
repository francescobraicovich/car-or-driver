"""Check whether all six strengths earn their place once the grid is known."""
import json

import numpy as np

from heads import DIRECTORY, REPORTS, FOLDS, fit_selected, head_logits, probability, summarize_comparison
from check_heads import eligible


def main():
    selected = json.loads((REPORTS / 'head-selection.json').read_text())
    saved = np.load(DIRECTORY / 'head-selection-grid.npz')
    rows, features, contexts, baseline, larger = (saved[key] for key in ('rows', 'features', 'contexts', 'baseline', 'selected'))
    raw, calibrated = np.full(len(rows), np.nan), np.full(len(rows), np.nan)
    heads = []
    for first, last in FOLDS:
        head = fit_selected(rows, features, contexts, 'grid', 'overall_grid', first, False)
        mask = (rows[:, 1] >= first) & (rows[:, 1] <= last)
        logits = head_logits(head, rows[mask], features[mask], contexts[mask])
        raw[mask], calibrated[mask] = probability(rows[mask], logits), probability(rows[mask], logits * head['temperature'])
        heads.append(head)
    calibration = summarize_comparison(rows, calibrated, raw)
    temperature = eligible(calibration)
    simple = calibrated if temperature else raw
    comparison = summarize_comparison(rows, larger, simple)
    retained = 'ratings' if eligible(comparison) else 'overall_grid'
    report = dict(selected=retained, keepTemperature=temperature if retained == 'overall_grid' else selected['grid']['keepTemperature'],
                  minimal=summarize_comparison(rows, simple, baseline), sixRatingsAgainstMinimal=comparison,
                  temperatureComparison=calibration)
    (REPORTS / 'grid-comparison.json').write_text(json.dumps(report, indent=2) + '\n')
    bundles = json.loads((REPORTS / 'heads-grid.json').read_text())
    bundles['overall_grid'] = heads
    (REPORTS / 'heads-grid.json').write_text(json.dumps(bundles, indent=2) + '\n')
    if retained == 'overall_grid':
        selected['grid'].update(selected=retained, keepTemperature=temperature,
                                selectedScores=summarize_comparison(rows, simple, baseline))
        payload = {key: saved[key] for key in saved.files}
        payload['selected'] = simple
        np.savez_compressed(DIRECTORY / 'head-selection-grid.npz', **payload)
    (REPORTS / 'head-selection.json').write_text(json.dumps(selected, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key in ('selected', 'keepTemperature')}), flush=True)
    print('minimal improvement', report['minimal']['historical']['difference'], flush=True)
    print('six ratings incremental', comparison['historical']['difference'], flush=True)


if __name__ == '__main__':
    main()
