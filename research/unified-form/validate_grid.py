"""Final compact head: two predictors, raw-error selection and valid grid pairs."""
import json

import numpy as np

from model import UnifiedModel
from unified_grid import fit_grid_head, grid_probability, grid_rows
from heads import DIRECTORY, REPORTS, FOLDS, summarize_comparison
from evaluate import binary_summary
from check_heads import eligible


def main():
    saved = np.load(DIRECTORY / 'baseline.npz')
    rows = np.column_stack([saved['rows'], saved['contexts'][:, 1:3]])
    valid = np.all((rows[:, 11:13] >= 1) & (rows[:, 11:13] <= 40) & (rows[:, 11:13] == np.floor(rows[:, 11:13])), axis=1)
    known = (rows[:, 2] == 2) & valid & (rows[:, 11] != rows[:, 12])
    selected = grid_rows(rows)
    reference = np.load(DIRECTORY / 'baseline-scores.npz')['predictions'][known]
    prediction = np.full(len(selected), np.nan)
    heads = []
    for first, last in FOLDS:
        head = fit_grid_head(rows, first)
        mask = (selected[:, 1] >= first) & (selected[:, 1] <= last)
        prediction[mask] = grid_probability(selected[mask], head)
        heads.append(head)
    report = summarize_comparison(selected, prediction, reference)
    historical = (selected[:, 1] >= 2008) & (selected[:, 1] <= 2025)
    report.update(eligible=eligible(report), heads=heads, control=binary_summary(selected[historical], reference[historical]),
                  specification='Two coefficients on uncertainty-tempered overall package gap and signed grid gap / 10; ridge toward the calibrated rating-only forecast. No extra temperature. Four duplicate positive-grid pairs are excluded as invalid.')
    for label, condition in [('normalFinishers', selected[:, 7] == 1), ('retirements', selected[:, 7] == 0), ('teammates', selected[:, 6] == 1)]:
        use = historical & condition
        report[label] = dict(control=binary_summary(selected[use], reference[use]), grid=binary_summary(selected[use], prediction[use]))
    (REPORTS / 'production-grid-results.json').write_text(json.dumps(report, indent=2) + '\n')
    np.savez_compressed(DIRECTORY / 'production-grid.npz', rows=selected, prediction=prediction, baseline=reference)
    print('Grid head', report['historical']['logLoss'], report['historical']['difference'], report['differenceInterval95'], report['eligible'])
    print(heads[-1])


if __name__ == '__main__':
    main()
