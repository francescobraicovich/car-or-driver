"""Small, training-only empirical parameter selection; no validation search."""
import hashlib
import json
from pathlib import Path
import time

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import expit

from model import DEFAULTS, TIME_UNIT, run_history


def training_score(weekends, result):
    totals = []
    for weekend, snapshot in zip(weekends, result["history"]):
        if weekend["year"] < 2002:
            continue
        channels = [[], [], []]
        for row, prediction in zip(weekend["observations"], snapshot["trainingPredictions"]):
            channel = row["channel"]
            mean, variance = prediction["mean"], prediction["variance"]
            if channel < 2:
                scale = np.sqrt(result["parameters"]["noise"][channel] ** 2 + 3 * variance / np.pi ** 2)
                residual = (row["target"] / TIME_UNIT - mean) / scale
                value = 2 * np.logaddexp(residual / 2, -residual / 2) + np.log(scale)
            else:
                mean /= np.sqrt(1 + np.pi * variance / 8)
                value = np.logaddexp(0, mean) - row["target"] * mean
            channels[channel].append((value, row["weight"]))
        totals.append(np.mean([np.average([v for v, _ in values], weights=[w for _, w in values]) for values in channels if values]))
    return float(np.mean(totals))


def fit_parameters(weekends):
    training = [weekend for weekend in weekends if weekend["year"] <= 2007]
    trials = []
    cache = {}

    def evaluate(parameters):
        key = json.dumps(parameters, sort_keys=True)
        if key not in cache:
            result = run_history(training, parameters, compact=True)
            score = training_score(training, result)
            cache[key] = (score, result)
            trials.append({"parameters": parameters, "trainingScore": score})
            print(f"Training score {score:.6f}: {key}", flush=True)
        return cache[key]

    control = dict(DEFAULTS)
    _, control_result = evaluate(control)
    pooling = dict(control)
    for kind in ("driver", "car"):
        candidates = [{**pooling, f"{kind}_correlation": value} for value in (0., .5, .85)]
        pooling = min(candidates, key=lambda parameters: evaluate(parameters)[0])
    noise = dict(control)
    scales = []
    for channel in (0, 1):
        observations = [(row["target"] / TIME_UNIT, prediction["mean"], prediction["variance"], row["weight"])
                        for weekend, snapshot in zip(training, control_result["history"]) if weekend["year"] >= 2002
                        for row, prediction in zip(weekend["observations"], snapshot["trainingPredictions"]) if row["channel"] == channel]
        target, mean, variance, weight = np.asarray(observations).T

        def objective(log_scale):
            scale = np.sqrt(np.exp(log_scale) ** 2 + 3 * variance / np.pi ** 2)
            residual = (target - mean) / scale
            return float(np.average(2 * np.logaddexp(residual / 2, -residual / 2) + np.log(scale), weights=weight))

        fit = minimize_scalar(objective, bounds=(np.log(.25), np.log(4)), method="bounded")
        scales.append(float(np.exp(fit.x)))
    noise["noise"] = scales
    evaluate(noise)
    adaptation = dict(control)
    for kind in ("driver", "car"):
        candidates = [{**adaptation, f"{kind}_multiplier": value} for value in (.5, 1., 2.)]
        adaptation = min(candidates, key=lambda parameters: evaluate(parameters)[0])
    combined = {**pooling, "noise": scales, "driver_multiplier": adaptation["driver_multiplier"], "car_multiplier": adaptation["car_multiplier"]}
    return {"control": control, "pooling": pooling, "noise": noise, "adaptation": adaptation, "combined": combined}, trials


if __name__ == "__main__":
    import scipy
    import sys
    directory = Path("tmp/unified-ratings")
    raw = (directory / "input.json").read_bytes()
    data = json.loads(raw)
    fingerprint = hashlib.sha256(raw).hexdigest()
    configurations, trials = fit_parameters(data["weekends"])
    selection = {"inputHash": fingerprint, "dataFingerprint": data["fingerprint"], "trainingThrough": 2007,
                 "configurations": configurations, "trials": trials,
                 "runtime": {"python": sys.version, "numpy": np.__version__, "scipy": scipy.__version__}}
    Path("research/unified-ratings/parameters.json").write_text(json.dumps(selection, indent=2))
    for name, parameters in list(configurations.items()) + [(f"refined_{kind}", configurations["combined"]) for kind in ("qualifying", "pace", "retirement", "all")]:
        start = time.monotonic()
        result = run_history(data["weekends"], parameters, name.removeprefix("refined_") if name.startswith("refined_") else None)
        result["inputHash"] = fingerprint
        result["modelHash"] = hashlib.sha256(Path("research/unified-ratings/model.py").read_bytes()).hexdigest()
        (directory / f"{name}.json").write_text(json.dumps(result, separators=(",", ":"), allow_nan=False))
        print(f"Completed {name}: {result['states']} states; {time.monotonic() - start:.1f}s", flush=True)
