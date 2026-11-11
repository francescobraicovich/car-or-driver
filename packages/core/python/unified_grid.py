"""A small conditional outcome model: uncertain overall gap and known grid."""
import numpy as np
from scipy.optimize import minimize
from scipy.special import expit

from unified_calibration import binary_loss, fit_calibration
from unified_model import hazard_probability

PENALTIES = (.001, .01, .1)


def grid_design(rows):
    return np.column_stack([rows[:, 4] / np.sqrt(1 + np.pi * rows[:, 5] / 8), (rows[:, 12] - rows[:, 11]) / 10])


def grid_rows(rows):
    valid = np.all((rows[:, 11:13] >= 1) & (rows[:, 11:13] <= 40) & (rows[:, 11:13] == np.floor(rows[:, 11:13])), axis=1)
    selected = rows[(rows[:, 2] == 2) & valid & (rows[:, 11] != rows[:, 12])].copy()
    _, indices, counts = np.unique(selected[:, 0], return_inverse=True, return_counts=True)
    selected[:, 10] = 1 / counts[indices]
    return selected


def grid_probability(rows, head):
    return hazard_probability(expit(grid_design(rows) @ np.array([head['ratingCoefficient'], head['gridCoefficient']])), rows[:, 8], rows[:, 9])


def grid_objective(coefficients, matrix, offset, rows, penalty):
    competitive = expit(offset + matrix @ coefficients)
    predicted = hazard_probability(competitive, rows[:, 8], rows[:, 9])
    weights = rows[:, 10] / rows[:, 10].sum()
    survival = ((1 - rows[:, 8]) * (1 - rows[:, 9])) ** 60
    derivative = (predicted - rows[:, 3]) / (predicted * (1 - predicted)) * survival * competitive * (1 - competitive)
    value = weights @ binary_loss(rows[:, 3], predicted) + penalty * (coefficients @ coefficients) / 2
    return value, matrix.T @ (weights * derivative) + penalty * coefficients


def fit_grid(training, penalty):
    slope = fit_calibration(training, 2)['slope']
    matrix = grid_design(training)
    scale = np.sqrt(np.average(matrix ** 2, axis=0, weights=training[:, 10]))
    scale = np.where(scale > 1e-8, scale, 1.)
    fit = minimize(grid_objective, np.zeros(2), args=(matrix / scale, slope * matrix[:, 0], training, penalty),
                   jac=True, method='L-BFGS-B', options=dict(ftol=1e-11, gtol=1e-7, maxiter=400))
    if not fit.success:
        raise ArithmeticError(f'Grid forecast fit failed: {fit.message}')
    return dict(ratingCoefficient=float(slope + fit.x[0] / scale[0]), gridCoefficient=float(fit.x[1] / scale[1]), penalty=penalty)


def fit_grid_head(rows, first):
    available = grid_rows(rows[(rows[:, 1] >= 2002) & (rows[:, 1] < first)])
    training = available[available[:, 1] < first - 4]
    validation = available[available[:, 1] >= first - 4]
    trials = []
    for penalty in PENALTIES:
        head = fit_grid(training, penalty)
        score = np.average(binary_loss(validation[:, 3], grid_probability(validation, head)), weights=validation[:, 10])
        trials.append(dict(penalty=penalty, score=float(score)))
    chosen = min(trials, key=lambda item: item['score'])
    return dict(fromYear=first, trainedThrough=first - 1, **fit_grid(available, chosen['penalty']), innerScore=chosen['score'])
