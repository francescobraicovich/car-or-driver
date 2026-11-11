"""Fixed synthetic worlds test attribution, uncertainty and misspecification."""
import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from model import CHANNELS, POINTS, TIME_UNIT, run_history


def world(seed, kind, length=100):
    rng = np.random.default_rng(seed)
    count = 12
    correlation = .2 if kind == "specialization" else .8
    def strengths(n, sd):
        return sd * (np.sqrt(correlation) * rng.normal(size=(n, 1)) + np.sqrt(1 - correlation) * rng.normal(size=(n, 3)))
    drivers, cars = strengths(count, .7), strengths(count // 2, 1.4)
    fit = rng.normal(0, .45, (count, count // 2)) if kind == "persistent_fit" else np.zeros((count, count // 2))
    history, truth = [], []
    assignments = np.arange(count) // 2
    for index in range(length):
        if index == 60:
            assignments[[0, 2]] = assignments[[2, 0]]
        drivers += rng.normal(0, .015, drivers.shape)
        cars += rng.normal(0, .09, cars.shape)
        if index == 70:
            cars[0] += 1.0
        entries = [{"driver": str(driver), "car": str(assignments[driver])} for driver in range(count)]
        performance = drivers + cars[assignments] + fit[np.arange(count), assignments, None]
        noise = rng.normal(0, .7, (count, 2))
        if kind == "heavy_noise" and index % 7 == 0:
            noise += rng.standard_t(3, (count, 2)) * 1.5
        timing = performance[:, :2] + noise
        order = performance[:, 2] + rng.gumbel(size=count)
        retired = rng.random(count) < .08
        observations = []
        for a in range(count):
            for b in range(a + 1, count):
                same = assignments[a] == assignments[b]
                weight = 1 if same else 1 / (count - 1)
                for channel in range(3):
                    if channel == 2 and (retired[a] or retired[b]):
                        continue
                    target = (timing[a, channel] - timing[b, channel]) * TIME_UNIT if channel < 2 else int(order[a] > order[b])
                    observations.append({"a": str(a), "b": str(b), "ca": str(assignments[a]), "cb": str(assignments[b]),
                                         "channel": channel, "target": target, "weight": weight * (1 if channel == 0 else .75)})
        history.append({"raceId": str(index), "date": (date(2000, 1, 1) + timedelta(days=14 * index)).isoformat(),
                        "entries": entries, "observations": observations, "tests": observations, "revisedTests": []})
        truth.append((drivers.copy(), cars.copy(), assignments.copy()))
    return history, truth


def recovery(history, truth):
    driver_errors, car_errors, gap_errors, coverage = [], [], [], []
    shock = []
    for index, (snapshot, (drivers, cars, assignments)) in enumerate(zip(history, truth)):
        if index < 25:
            continue
        estimated_driver = np.array([snapshot["post"]["drivers"][str(i)] for i in range(len(drivers))]) / POINTS
        estimated_car = np.array([snapshot["post"]["cars"][str(i)] for i in range(len(cars))]) / POINTS
        driver_errors.append((estimated_driver - (drivers - drivers.mean(axis=0))) ** 2)
        car_errors.append((estimated_car - (cars - cars.mean(axis=0))) ** 2)
        for a in range(len(drivers)):
            for b in range(a + 1, len(drivers)):
                gap_errors.append((estimated_driver[a] - estimated_driver[b] - drivers[a] + drivers[b]) ** 2)
        pre = snapshot["pre"]
        for a in range(0, len(drivers), 2):
            b = a + 1
            ia, ib = pre["covarianceIds"].index(str(a)), pre["covarianceIds"].index(str(b))
            for channel in range(3):
                matrix = pre["driverCovariance"][channel]
                sd = np.sqrt(max(0, matrix[ia][ia] + matrix[ib][ib] - 2 * matrix[ia][ib]))
                gap = (pre["drivers"][str(a)][channel] - pre["drivers"][str(b)][channel]) / POINTS
                coverage.append(abs(gap - drivers[a, channel] + drivers[b, channel]) <= 1.645 * sd)
        if index == 75:
            baseline = history[69]["post"]
            changes = [snapshot["post"]["drivers"][str(i)][2] - baseline["drivers"][str(i)][2]
                       for i in range(len(drivers)) if assignments[i] == 0]
            shock.append({"driverChange": float(np.mean(changes)),
                          "carChange": snapshot["post"]["cars"]["0"][2] - baseline["cars"]["0"][2]})
    return {"driverRMSE": (np.sqrt(np.mean(driver_errors, axis=(0, 1))) * POINTS).tolist(),
            "carRMSE": (np.sqrt(np.mean(car_errors, axis=(0, 1))) * POINTS).tolist(),
            "driverGapRMSE": (np.sqrt(np.mean(gap_errors, axis=0)) * POINTS).tolist(),
            "driverGapCoverage90": float(np.mean(coverage)), "carShock": shock[0]}


if __name__ == "__main__":
    configurations = json.loads(Path("research/unified-ratings/parameters.json").read_text())["configurations"]
    results = []
    for kind in ("shared", "specialization", "persistent_fit", "heavy_noise"):
        for seed in (41, 42, 43):
            weekends, truth = world(seed, kind)
            for name in ("control", "combined"):
                result = run_history(weekends, configurations[name])
                results.append({"world": kind, "seed": seed, "model": name, **recovery(result["history"], truth)})
        print(f"Completed simulation {kind}", flush=True)
    Path("research/unified-ratings/simulation-results.json").write_text(json.dumps({"channels": CHANNELS, "results": results,
        "limitations": "Three paired seeds per deliberately different world; exploratory and not real-world driver/car ground truth."}, indent=2))
