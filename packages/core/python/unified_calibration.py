"""Past-only probability and timing calibration; equal weight per weekend."""
import numpy as np
from scipy.optimize import minimize, minimize_scalar
from scipy.special import expit

from unified_model import TIME_UNIT, hazard_probability


def timing_distribution(rows, parameters):
    slope, noise = np.exp(parameters)
    mean = slope * rows[:, 4]
    scale = np.sqrt(noise ** 2 + 3 * slope ** 2 * rows[:, 5] / np.pi ** 2)
    residual = (rows[:, 3] / TIME_UNIT - mean) / scale
    loss = 2 * np.logaddexp(residual / 2, -residual / 2) + np.log(scale * TIME_UNIT)
    return mean * TIME_UNIT, scale * TIME_UNIT, loss


def outcome_probability(rows, log_slope):
    mean = np.exp(log_slope) * rows[:, 4] / np.sqrt(1 + np.pi * rows[:, 5] / 8)
    return hazard_probability(expit(mean), rows[:, 8], rows[:, 9])


def binary_loss(target, probability):
    p = np.clip(probability, 1e-9, 1 - 1e-9)
    return -(target * np.log(p) + (1 - target) * np.log1p(-p))


def fit_calibration(training, channel):
    if channel < 2:
        fit = minimize(lambda parameters: np.average(timing_distribution(training, parameters)[2], weights=training[:, 10]),
                       np.zeros(2), method="L-BFGS-B", bounds=[(-3, 3), (-3, 3)])
        if not fit.success:
            raise ArithmeticError(f"Timing calibration failed: {fit.message}")
        return {"slope": float(np.exp(fit.x[0])), "noise": float(np.exp(fit.x[1]))}
    fit = minimize_scalar(lambda slope: np.average(binary_loss(training[:, 3], outcome_probability(training, slope)), weights=training[:, 10]),
                          bounds=(-3, 3), method="bounded")
    if not fit.success:
        raise ArithmeticError("Outcome calibration failed")
    return {"slope": float(np.exp(fit.x))}
