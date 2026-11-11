"""Known-weather diagnostic; realized wet labels never enter Thursday forecasts."""
import json

import numpy as np
from scipy.optimize import minimize

from heads import (DIRECTORY, REPORTS, FOLDS, fit_head, head_logits, objective_gradient,
                   probability, fit_calibration, summarize_comparison, weighted_mean)
from check_heads import eligible
from evaluate import binary_summary


def main():
    decisions = json.loads((REPORTS / 'head-selection.json').read_text())
    result = {}
    for mode in ('pre', 'grid'):
        saved = np.load(DIRECTORY / f'head-selection-{mode}.npz')
        rows, features, contexts, baseline = (saved[key] for key in ('rows', 'features', 'contexts', 'selected'))
        family = decisions[mode]['selected']
        bundles = json.loads((REPORTS / f'heads-{mode}.json').read_text()) if family != 'baseline' else None
        prediction = np.full(len(rows), np.nan)
        fits = []
        for index, (first, last) in enumerate(FOLDS[:4]):
            early = (rows[:, 1] >= 2002) & (rows[:, 1] < first - 4)
            training = (rows[:, 1] >= first - 4) & (rows[:, 1] < first) & (contexts[:, 3] >= 0)
            outer = (rows[:, 1] >= first) & (rows[:, 1] <= last) & (contexts[:, 3] >= 0)
            if family == 'baseline':
                slope = fit_calibration(rows[early], 2)['slope']
                offset = slope * rows[training, 4] / np.sqrt(1 + np.pi * rows[training, 5] / 8)
                slope = fit_calibration(rows[(rows[:, 1] >= 2002) & (rows[:, 1] < first)], 2)['slope']
                outer_offset = slope * rows[outer, 4] / np.sqrt(1 + np.pi * rows[outer, 5] / 8)
            else:
                final = bundles[family][index]
                inner = fit_head(rows[early], features[early], contexts[early], mode, family, final['penalty'], final['hasForm'])
                temperature = final['temperature'] if decisions[mode]['keepTemperature'] else 1.
                offset = temperature * head_logits(inner, rows[training], features[training], contexts[training])
                outer_offset = temperature * head_logits(final, rows[outer], features[outer], contexts[outer])
            frequency = weighted_mean(contexts[training, 3], rows[training])
            matrix = features[training][:, [2, 5]] * (contexts[training, 3] - frequency)[:, None]
            scale = np.sqrt(np.average(matrix ** 2, axis=0, weights=rows[training, 10]))
            scale = np.where(scale > 1e-8, scale, 1.)
            fit = minimize(objective_gradient, np.zeros(2), args=(matrix / scale, offset, rows[training], .1),
                           jac=True, method='L-BFGS-B', options=dict(gtol=1e-8, ftol=1e-12))
            if not fit.success:
                raise ArithmeticError(fit.message)
            outer_matrix = features[outer][:, [2, 5]] * (contexts[outer, 3] - frequency)[:, None] / scale
            prediction[outer] = probability(rows[outer], outer_offset + outer_matrix @ fit.x)
            fits.append(dict(fromYear=first, frequency=frequency, scale=scale.tolist(), coefficients=fit.x.tolist(), penalty=.1))
        comparison = summarize_comparison(rows, prediction, baseline)
        # Monitoring has no established weather coverage, so do not print NaNs as scores.
        comparison['blocks'] = comparison['blocks'][:4]
        wet = (rows[:, 1] >= 2008) & (rows[:, 1] <= 2025) & (contexts[:, 3] == 1)
        dry = (rows[:, 1] >= 2008) & (rows[:, 1] <= 2025) & (contexts[:, 3] == 0)
        slices = {name: dict(control=binary_summary(rows[mask], baseline[mask]), conditional=binary_summary(rows[mask], prediction[mask]))
                  for name, mask in [('wet', wet), ('dry', dry)]}
        keep = eligible(comparison) and slices['wet']['conditional']['logLoss'] <= slices['wet']['control']['logLoss']
        result[mode] = dict(eligible=keep, comparison=comparison, slices=slices, fits=fits)
        print(mode, comparison['historical']['difference'], keep, flush=True)
    (REPORTS / 'weather-results.json').write_text(json.dumps(dict(modes=result,
        limitation='Conditional on realized 2000–2025 wet labels; not a weather forecast and not an improvement in unconditional pre-weekend prediction. No established 2026 weather coverage.'), indent=2, allow_nan=False) + '\n')


if __name__ == '__main__':
    main()
