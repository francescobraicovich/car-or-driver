"""Build dated joint posteriors and chronological forecast diagnostics."""
import json
from pathlib import Path
import sys

import numpy as np

from unified_model import UnifiedModel, CHANNELS
from unified_calibration import fit_calibration, outcome_probability, binary_loss
from unified_grid import fit_grid_head


def field_state(model, entries):
    keys = list(dict.fromkeys((kind, row[kind]) for row in entries for kind in ("driver", "car")))
    positions = [model.indices[key] + 2 for key in keys]
    # Publish covariance in the same fixed model coordinates as the ratings.
    return {"keys": [list(key) for key in keys],
            "covariance": model.covariance[np.ix_(positions, positions)].tolist()}


def build(data):
    settings = json.loads(Path(__file__).with_name("unified-settings.json").read_text())
    model = UnifiedModel(settings["parameters"])
    history, tests = [], []
    for index, weekend in enumerate(data):
        model.begin(weekend)
        predictions = model.predict(weekend["tests"])
        grids = {row['driver']: row.get('grid', 0) for row in weekend['entries']}
        counts = [sum(row["channel"] == channel for row in weekend["tests"]) for channel in range(3)]
        if weekend["year"] >= 2002:
            for observation, prediction in zip(weekend["tests"], predictions):
                tests.append([index, weekend["year"], observation["channel"], observation["target"],
                              prediction["mean"], prediction["variance"], observation["same"],
                              observation.get("bothFinish", True), observation.get("hazardA", 0), observation.get("hazardB", 0),
                              1 / counts[observation["channel"]], grids.get(observation['a'], 0), grids.get(observation['b'], 0)])
        model.update(weekend["observations"])
        post = model.snapshot(weekend["entries"])
        history.append({"drivers": post["drivers"], "cars": post["cars"], "uncertainty": post["uncertainty"],
                        "state": field_state(model, weekend["entries"])})
    state = history[-1]["state"]
    state["timingCovariance"] = []
    for channel in range(2):
        indices = [model.indices[tuple(key)] + channel for key in state["keys"]]
        state["timingCovariance"].append(model.covariance[np.ix_(indices, indices)].tolist())
    rows = np.asarray(tests)
    calibrations, grid_heads = [], []
    # Preserve the validated historical folds; refresh prospectively each year.
    starts = [2008, 2012, 2016, 2021, *range(2026, data[-1]["year"] + 2)]
    for start in starts:
        if start > data[-1]["year"] + 1:
            continue
        bundle = {"fromYear": start, "trainedThrough": start - 1}
        for channel, name in enumerate(CHANNELS):
            training = rows[(rows[:, 1] < start) & (rows[:, 2] == channel)]
            bundle[name] = fit_calibration(training, channel)
        calibrations.append(bundle)
        grid_heads.append(fit_grid_head(rows, start))
    for index, (weekend, snapshot) in enumerate(zip(data, history)):
        if weekend["year"] < 2008:
            continue
        calibration = next(item for item in reversed(calibrations) if item["fromYear"] <= weekend["year"])
        current = rows[(rows[:, 0] == index) & (rows[:, 2] == 2)]
        if not len(current):
            continue
        probability = outcome_probability(current, np.log(calibration["overall"]["slope"]))
        snapshot["diagnostics"] = {"obsCount": len(current), "weight": 1,
                                   "logLoss": float(np.mean(binary_loss(current[:, 3], probability))),
                                   "brier": float(np.mean((current[:, 3] - probability) ** 2)),
                                   "acc": float(np.mean((probability > .5) == current[:, 3]))}
    return {"history": history, "settings": settings, "calibrations": calibrations, "gridHeads": grid_heads,
            "maximumGradient": model.maximum_gradient}


if __name__ == "__main__":
    Path(sys.argv[2]).write_text(json.dumps(build(json.loads(Path(sys.argv[1]).read_text())), separators=(",", ":"), allow_nan=False))
