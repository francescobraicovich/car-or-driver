"""Build a reusable research state and forecast a pair without website changes."""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.special import expit

from model import UnifiedModel, TIME_UNIT, hazard_probability


def state_dict(model):
    return {"parameters": model.parameters, "indices": [[kind, identity, index] for (kind, identity), index in model.indices.items()],
            "mean": model.mean.tolist(), "covariance": model.covariance.tolist(), "date": model.previous_date.isoformat()}


def restore(state):
    model = UnifiedModel(state["parameters"])
    model.indices = {(kind, identity): index for kind, identity, index in state["indices"]}
    model.mean = np.asarray(state["mean"], dtype=float)
    model.covariance = np.asarray(state["covariance"], dtype=float)
    model.previous_date = date.fromisoformat(state["date"])
    return model


def predict(state, day, driver_a, car_a, driver_b, car_b, hazard_a=None, hazard_b=None):
    model = restore(state)
    if (hazard_a is None) != (hazard_b is None):
        raise ValueError("Supply both hazards or neither")
    if hazard_a is not None and not all(np.isfinite(value) and 0 <= value <= .2 for value in (hazard_a, hazard_b)):
        raise ValueError("Hazards must be per-lap probabilities in [0, .2]")
    model.begin({"date": day, "entries": [{"driver": driver_a, "car": car_a}, {"driver": driver_b, "car": car_b}]})
    predictions = model.predict([{"a": driver_a, "b": driver_b, "ca": car_a, "cb": car_b, "channel": channel} for channel in range(3)])
    result = {"date": day, "trainedThrough": state["date"], "calibrationThrough": state.get("calibrationThrough"), "channels": {}}
    for channel, name in enumerate(("qual", "race", "overall")):
        row = predictions[channel]
        calibration = state.get("calibration", {}).get(name, {})
        slope = calibration.get("slope", 1)
        if channel < 2:
            noise = calibration.get("noise", model.parameters["noise"][channel])
            mean = slope * row["mean"] * TIME_UNIT
            scale = np.sqrt(noise ** 2 + 3 * slope ** 2 * row["variance"] / np.pi ** 2) * TIME_UNIT
            result["channels"][name] = {"fractionalTimeAdvantage": mean, "predictiveInterval90": [mean - np.log(19) * scale, mean + np.log(19) * scale]}
        else:
            probability = float(expit(slope * row["mean"] / np.sqrt(1 + np.pi * row["variance"] / 8)))
            result["channels"][name] = {"competitiveWinProbability": probability,
                "actualResultProbability": float(hazard_probability(probability, hazard_a, hazard_b)) if hazard_a is not None else None,
                "hazardHorizonLaps": 60, "note": "Actual-result probability requires both explicit pre-weekend per-lap hazards."}
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build")
    build.add_argument("--output", default="tmp/unified-ratings/selected-state.json")
    forecast = commands.add_parser("predict")
    forecast.add_argument("--state", default="tmp/unified-ratings/selected-state.json")
    forecast.add_argument("--date", required=True)
    for name in ("driver-a", "driver-b", "car-a", "car-b"):
        forecast.add_argument(f"--{name}", required=True)
    forecast.add_argument("--hazard-a", type=float)
    forecast.add_argument("--hazard-b", type=float)
    arguments = parser.parse_args()
    if arguments.command == "build":
        raw = Path("tmp/unified-ratings/input.json").read_bytes()
        data = json.loads(raw)
        selection = json.loads(Path("research/unified-ratings/selection.json").read_text())
        if hashlib.sha256(raw).hexdigest() != selection["inputHash"]:
            raise ValueError("Input differs from selected experiment")
        model = UnifiedModel(selection["parameters"])
        for weekend in data["weekends"]:
            model.begin(weekend)
            model.update(weekend["refinements"][selection["refinement"]] if selection["refinement"] else weekend["observations"])
        expected = json.loads(Path(f"tmp/unified-ratings/{selection['candidate']}.json").read_text())["history"][-1]["post"]
        actual = model.snapshot(data["weekends"][-1]["entries"], field_relative=True)
        for kind in ("drivers", "cars"):
            for identity in expected[kind]:
                np.testing.assert_allclose(actual[kind][identity], expected[kind][identity], rtol=0, atol=1e-10)
        state = {**state_dict(model), "inputHash": selection["inputHash"], "calibration": selection["calibration"],
                 "calibrationThrough": selection["calibrationThrough"]}
        Path(arguments.output).write_text(json.dumps(state, separators=(",", ":"), allow_nan=False))
        print(f"Built {arguments.output}; exact selected-history reproduction verified")
    else:
        state = json.loads(Path(arguments.state).read_text())
        print(json.dumps(predict(state, arguments.date, arguments.driver_a, arguments.car_a, arguments.driver_b, arguments.car_b,
                                 arguments.hazard_a, arguments.hazard_b), indent=2))
