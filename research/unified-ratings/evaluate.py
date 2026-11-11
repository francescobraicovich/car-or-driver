"""Common, race-balanced chronological exams for all rating candidates."""
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.optimize import minimize, minimize_scalar
from scipy.special import expit, logit

from model import CHANNELS, POINTS, TIME_UNIT, hazard_probability
from unified_calibration import timing_distribution, outcome_probability, binary_loss, fit_calibration

FOLDS = [(2008, 2011), (2012, 2015), (2016, 2020), (2021, 2025), (2026, 2026)]


def table(data, history=None, revised=False):
    rows = []
    for i, weekend in enumerate(data["weekends"]):
        if weekend["year"] < 2002:
            continue
        tests = weekend["revisedTests" if revised else "tests"]
        predictions = history[i]["revisedPredictions" if revised else "predictions"] if history else weekend["revisedReference" if revised else "reference"]
        if len(tests) != len(predictions):
            raise ValueError("Evaluation coverage differs")
        counts = [sum(row["channel"] == channel for row in tests) for channel in range(3)]
        for observation, prediction in zip(tests, predictions):
            rows.append([i, weekend["year"], observation["channel"], observation["target"],
                         prediction["mean"], prediction["variance"], observation["same"],
                         observation.get("bothFinish", True), observation.get("hazardA", 0), observation.get("hazardB", 0),
                         1 / counts[observation["channel"]], prediction.get("probability") or np.nan])
    return np.asarray(rows, dtype=float)


def calibration_slope(target, probability, weight):
    logits = logit(np.clip(probability, 1e-6, 1 - 1e-6))
    fit = minimize_scalar(lambda slope: np.average(np.logaddexp(0, slope * logits) - target * slope * logits, weights=weight),
                          bounds=(0.05, 4), method="bounded")
    return float(fit.x)


def summarize(rows):
    if not len(rows):
        return None
    weight = rows[:, 10]
    result = {"count": len(rows), "weekends": len(np.unique(rows[:, 0])), "logScore": float(np.average(rows[:, 14], weights=weight))}
    if rows[0, 2] < 2:
        result.update(mae=float(np.average(np.abs(rows[:, 3] - rows[:, 12]), weights=weight)),
                      coverage90=float(np.average(np.abs(rows[:, 3] - rows[:, 12]) <= np.log(19) * rows[:, 13], weights=weight)),
                      meanIntervalWidth90=float(np.average(2 * np.log(19) * rows[:, 13], weights=weight)))
    else:
        result.update(brier=float(np.average((rows[:, 3] - rows[:, 12]) ** 2, weights=weight)),
                      accuracy=float(np.average((rows[:, 12] > .5) == rows[:, 3], weights=weight)),
                      calibrationSlope=calibration_slope(rows[:, 3], rows[:, 12], weight))
        result["reliability"] = []
        for low in np.arange(0, 1, .1):
            selected = rows[(rows[:, 12] >= low) & (rows[:, 12] < low + .1)]
            if len(selected):
                result["reliability"].append({"low": round(float(low), 1), "count": len(selected),
                    "predicted": float(np.average(selected[:, 12], weights=selected[:, 10])),
                    "observed": float(np.average(selected[:, 3], weights=selected[:, 10]))})
    return result


def evaluate(rows, installed=False):
    scores, calibrations = [], []
    for start, end in FOLDS:
        for channel in range(3):
            training = rows[(rows[:, 1] < start) & (rows[:, 2] == channel)]
            current = rows[(rows[:, 1] >= start) & (rows[:, 1] <= end) & (rows[:, 2] == channel)]
            if not len(current):
                continue
            if channel < 2:
                parameters = fit_calibration(training, channel)
                prediction, scale, loss = timing_distribution(current, np.log([parameters["slope"], parameters["noise"]]))
            else:
                if installed:
                    prediction = current[:, 11]
                    if not np.isfinite(prediction).all():
                        raise ValueError("Missing installed Thursday prediction")
                    parameters = {"installed": True}
                    if installed == "calibrated":
                        training_logits = logit(np.clip(training[:, 11], 1e-6, 1 - 1e-6))
                        fit = minimize_scalar(lambda slope: np.average(binary_loss(training[:, 3], expit(np.exp(slope) * training_logits)), weights=training[:, 10]),
                                              bounds=(-3, 3), method="bounded")
                        prediction = expit(np.exp(fit.x) * logit(np.clip(prediction, 1e-6, 1 - 1e-6)))
                        parameters["targetCalibrationSlope"] = float(np.exp(fit.x))
                else:
                    fit = minimize_scalar(lambda slope: np.average(binary_loss(training[:, 3], outcome_probability(training, slope)), weights=training[:, 10]),
                                          bounds=(-3, 3), method="bounded")
                    prediction = outcome_probability(current, fit.x)
                    parameters = {"slope": float(np.exp(fit.x))}
                scale = np.zeros(len(current))
                loss = binary_loss(current[:, 3], prediction)
            scores.append(np.column_stack([current, prediction, scale, loss]))
            calibrations.append({"from": start, "to": end, "channel": CHANNELS[channel], "trainedThrough": start - 1, **parameters})
    scored = np.concatenate(scores)
    report = {"calibration": calibrations, "historical": {}, "monitoring2026": {}, "blocks": []}
    for channel, name in enumerate(CHANNELS):
        historical = scored[(scored[:, 1] <= 2025) & (scored[:, 2] == channel)]
        report["historical"][name] = {"all": summarize(historical), "teammates": summarize(historical[historical[:, 6] == 1])}
        if channel == 2:
            report["historical"][name].update(finishers=summarize(historical[historical[:, 7] == 1]),
                                               retirements=summarize(historical[historical[:, 7] == 0]))
        report["monitoring2026"][name] = summarize(scored[(scored[:, 1] == 2026) & (scored[:, 2] == channel)])
        for start, end in FOLDS[:-1]:
            report["blocks"].append({"from": start, "to": end, "channel": name,
                                     **summarize(scored[(scored[:, 1] >= start) & (scored[:, 1] <= end) & (scored[:, 2] == channel)])})
    return report, scored


def paired_intervals(reference, candidate, repetitions=500):
    output = {}
    rng = np.random.default_rng(20261111)
    for channel, name in enumerate(CHANNELS):
        first = reference[(reference[:, 1] <= 2025) & (reference[:, 2] == channel)]
        second = candidate[(candidate[:, 1] <= 2025) & (candidate[:, 2] == channel)]
        if not np.array_equal(first[:, :4], second[:, :4]):
            raise ValueError("Paired evaluation identities differ")
        difference = second[:, 14] - first[:, 14]
        years = np.unique(first[:, 1])
        sums = np.array([[np.sum(difference[first[:, 1] == year] * first[first[:, 1] == year, 10]),
                          np.sum(first[first[:, 1] == year, 10])] for year in years])
        sampled = sums[rng.integers(0, len(years), (repetitions, len(years)))].sum(axis=1)
        output[name] = {"logScoreDifference": float(np.average(difference, weights=first[:, 10])),
                        "seasonInterval95": np.quantile(sampled[:, 0] / sampled[:, 1], [.025, .975]).tolist()}
    return output


def published_history(data):
    return [{phase: {"drivers": {identity: [weekend["published"][phase][channel]["drivers"].get(identity, 0) for channel in CHANNELS]
                                     for identity in weekend["published"][phase]["overall"]["drivers"]},
                    "cars": {entry["car"]: [weekend["published"][phase][channel]["cars"].get(entry["constructor"], 0) for channel in CHANNELS]
                             for entry in weekend["entries"]}}
             for phase in ("pre", "post")} for weekend in data["weekends"]]


def diagnostics(data, history):
    changes = {name: [] for name in CHANNELS}
    normalized = {name: [] for name in CHANNELS}
    graph_error = {name: [] for name in CHANNELS}
    covariance_changes = []
    arrivals = []
    previous = {}
    previous_lineups = {}
    for i, (weekend, snapshot) in enumerate(zip(data["weekends"], history)):
        field = [snapshot["post"]["drivers"][row["driver"]] for row in weekend["entries"] if row["driver"] in snapshot["post"]["drivers"]]
        spread = np.maximum(np.std(field, axis=0), 1e-9)
        graph_ids = [row["driver"] for row in weekend["entries"] if row["driver"] in weekend["graph"]["post"]]
        graph_center = np.mean([weekend["graph"]["post"][identity] for identity in graph_ids])
        lineups = {}
        for row in weekend["entries"]:
            lineups.setdefault(row["team"], []).append(row["driver"])
            identity = row["driver"]
            if identity not in snapshot["post"]["drivers"]:
                continue
            value = np.array(snapshot["post"]["drivers"][identity])
            if identity in previous and 2008 <= weekend["year"] <= 2025:
                before, team, car_value = previous[identity]
                difference = value - before
                for channel, name in enumerate(CHANNELS):
                    changes[name].append(abs(difference[channel]))
                    normalized[name].append(abs(difference[channel]) / spread[channel])
                if team == row["team"]:
                    car_difference = np.array(snapshot["post"]["cars"][row["car"]]) - car_value
                    covariance_changes.append([difference[2], car_difference[2]])
            previous[identity] = (value, row["team"], np.array(snapshot["post"]["cars"][row["car"]]))
            if identity in graph_ids and 2008 <= weekend["year"] <= 2025:
                graph_value = weekend["graph"]["post"][identity] - graph_center
                for channel, name in enumerate(CHANNELS):
                    graph_error[name].append((value[channel] - graph_value) ** 2)
        if 2008 <= weekend["year"] <= 2025 and i > 0 and i + 4 < len(history):
            for team, ids in lineups.items():
                old = previous_lineups.get(team, [])
                if set(old) == set(ids) or not old:
                    continue
                for identity in set(old) & set(ids):
                    future_entries = data["weekends"][i + 4]["entries"]
                    if any(row["driver"] == identity and row["team"] == team for row in future_entries):
                        before = history[i - 1]["post"]["drivers"].get(identity)
                        after = history[i + 4]["post"]["drivers"].get(identity)
                        if before and after:
                            arrivals.append(after[2] - before[2])
        previous_lineups = lineups
    pair = np.asarray(covariance_changes)
    return {"stability": {name: {"median": float(np.median(changes[name])), "p90": float(np.quantile(changes[name], .9)),
                                  "normalizedP90": float(np.quantile(normalized[name], .9))} for name in CHANNELS},
            "graphDisagreementRMSE": {name: float(np.sqrt(np.mean(graph_error[name]))) for name in CHANNELS},
            "sameTeamDriverCarRevisionCorrelation": float(np.corrcoef(pair.T)[0, 1]),
            "stayerFiveWeekendArrival": {"count": len(arrivals), "mean": float(np.mean(arrivals)), "meanAbsolute": float(np.mean(np.abs(arrivals)))}}


def transfers(data, history, reference_history):
    def frozen_gap(snapshot, row):
        channel = row["channel"]
        gap = (snapshot["drivers"][row["a"]][channel] - snapshot["drivers"][row["b"]][channel]) / POINTS
        variance = 0
        if "driverCovariance" in snapshot:
            ids = snapshot["covarianceIds"]
            if row["a"] not in ids or row["b"] not in ids:
                raise ValueError("Missing frozen covariance")
            a, b = ids.index(row["a"]), ids.index(row["b"])
            covariance = snapshot["driverCovariance"][channel]
            variance = max(0, covariance[a][a] + covariance[b][b] - 2 * covariance[a][b])
        return gap / np.sqrt(1 + np.pi * variance / 8)

    stayers = []
    tenures, team_previous = {}, {}
    tenure_history = []
    for weekend in data["weekends"]:
        for entry in weekend["entries"]:
            identity, team = entry["driver"], entry["team"]
            tenures[identity] = tenures.get(identity, 0) + 1 if team_previous.get(identity) == team else 1
            team_previous[identity] = team
        tenure_history.append(dict(tenures))
    for i, weekend in enumerate(data["weekends"]):
        if weekend["year"] < 2002:
            continue
        current_entries = {entry["driver"]: entry for entry in weekend["entries"]}
        for horizon in (5, 10):
            freeze = i - i % horizon
            entries = {entry["driver"]: entry for entry in data["weekends"][freeze]["entries"]}
            snapshot = history[freeze]["pre"]
            reference = reference_history[freeze]["pre"]
            for row in weekend["tests"]:
                if not row["same"] or (row["channel"] == 2 and not row["bothFinish"]):
                    continue
                if any(identity not in entries or identity not in snapshot["drivers"] or identity not in reference["drivers"]
                       or tenure_history[freeze].get(identity, 0) < 10 or entries[identity]["team"] != current_entries[identity]["team"]
                       for identity in (row["a"], row["b"])):
                    continue
                if row["channel"] < 2 and row["target"] == 0:
                    continue
                target = row["target"] if row["channel"] == 2 else float(row["target"] > 0)
                stayers.append([weekend["year"], row["channel"], horizon, frozen_gap(snapshot, row), target])
    stayers = np.asarray(stayers)
    slopes = {}
    for start, end in FOLDS[:-1]:
        for channel in range(3):
            for horizon in (5, 10):
                past = stayers[(stayers[:, 0] < start) & (stayers[:, 1] == channel) & (stayers[:, 2] == horizon)]
                fit = minimize_scalar(lambda slope: np.mean(np.logaddexp(0, slope * past[:, 3]) - past[:, 4] * slope * past[:, 3]),
                                      bounds=(.05, 4), method="bounded")
                slopes[(end, channel, horizon)] = float(fit.x)
    rows = []
    omissions = []
    for move_index, move in enumerate(data["moves"]):
        if not 2008 <= move["year"] <= 2025:
            continue
        block_end = next(end for start, end in FOLDS if start <= move["year"] <= end)
        if move.get("eligibilityYear", move["year"]) > block_end:
            continue
        freeze = move["freeze"]
        snapshot = history[freeze]["pre"]
        reference = reference_history[freeze]["pre"]
        driver = move["driver"]
        team = next(row["team"] for row in data["weekends"][move["start"]]["entries"] if row["driver"] == driver)
        for horizon in (5, 10):
            for index in move["targets"][:horizon]:
                weekend = data["weekends"][index]
                if weekend["year"] > block_end or not any(row["driver"] == driver and row["team"] == team for row in weekend["entries"]):
                    break
                for row in weekend["tests"]:
                    if not row["same"] or driver not in (row["a"], row["b"]) or (row["channel"] == 2 and not row["bothFinish"]):
                        continue
                    if any(identity not in reference["drivers"] or identity not in snapshot["drivers"] for identity in (row["a"], row["b"])):
                        omissions.append([move_index, index, row["a"], row["b"]])
                        continue
                    channel = row["channel"]
                    probability = expit(slopes[(block_end, channel, horizon)] * frozen_gap(snapshot, row))
                    target = row["target"] if channel == 2 else float(row["target"] > 0)
                    if channel < 2 and row["target"] == 0:
                        continue
                    rows.append([move_index, channel, horizon, float(binary_loss(target, probability))])
    values = np.asarray(rows)
    move_scores = []
    for identity in np.unique(values[:, 0]):
        cells = [np.mean(values[(values[:, 0] == identity) & (values[:, 1] == channel) & (values[:, 2] == horizon), 3])
                 for channel in range(3) for horizon in (5, 10)
                 if np.any((values[:, 0] == identity) & (values[:, 1] == channel) & (values[:, 2] == horizon))]
        move_scores.append([int(identity), float(np.mean(cells))])
    return {"moves": len(move_scores), "comparisons": len(values), "loss": float(np.mean([score for _, score in move_scores])),
            "byChannel": {name: float(np.mean(values[values[:, 1] == channel, 3])) for channel, name in enumerate(CHANNELS)},
            "moveScores": move_scores, "omissions": omissions,
            "calibration": [{"blockEnd": end, "channel": CHANNELS[channel], "horizon": horizon, "slope": slope}
                            for (end, channel, horizon), slope in slopes.items()],
            "definition": "Frozen driver gap and covariance before final old-team weekend; 5/10 horizons; normal finish and timing signs. Calibration uses only earlier frozen stayer duels. Distinct targets from the old mixed-target mover exam."}


def main():
    directory = Path("tmp/unified-ratings")
    raw = (directory / "input.json").read_bytes()
    data = json.loads(raw)
    source_hash = hashlib.sha256(Path("research/unified-ratings/model.py").read_bytes()).hexdigest()
    reference_history = published_history(data)
    reference, reference_scores = evaluate(table(data), installed=True)
    reference["diagnostics"] = diagnostics(data, reference_history)
    reference["transfers"] = transfers(data, reference_history, reference_history)
    ratings, ratings_scores = evaluate(table(data), installed=False)
    calibrated_heads, calibrated_head_scores = evaluate(table(data), installed="calibrated")
    revised_reference, revised_reference_scores = evaluate(table(data, revised=True))
    report = {"dataFingerprint": data["fingerprint"], "inputHash": hashlib.sha256(raw).hexdigest(),
              "productionSource": data["source"], "modelHash": source_hash,
              "parameters": json.loads(Path("research/unified-ratings/parameters.json").read_text()),
              "published": reference, "publishedRatings": ratings, "publishedCalibratedHeads": calibrated_heads,
              "publishedRevisedExam": revised_reference, "candidates": {}}
    baseline_scores = None
    combined_scores = None
    for name in ("control", "pooling", "noise", "adaptation", "combined", "refined_qualifying", "refined_pace", "refined_retirement", "refined_all"):
        result = json.loads((directory / f"{name}.json").read_text())
        if result["inputHash"] != report["inputHash"] or result["modelHash"] != source_hash:
            raise ValueError(f"Stale history: {name}")
        history = result["history"]
        scored, rows = evaluate(table(data, history))
        revised, revised_rows = evaluate(table(data, history, revised=True))
        if name == "control":
            baseline_scores = rows
        if name == "combined":
            combined_scores = rows
        scored.update(parameters=result["parameters"], maximumGradient=result["maximumGradient"],
                      versusPublished=paired_intervals(reference_scores, rows),
                      versusPublishedRatings=paired_intervals(ratings_scores, rows),
                      versusCalibratedHeads=paired_intervals(calibrated_head_scores, rows),
                      versusControl=paired_intervals(baseline_scores, rows),
                      diagnostics=diagnostics(data, history), transfers=transfers(data, history, reference_history),
                      revisedExam={"historical": revised["historical"], "versusPublished": paired_intervals(revised_reference_scores, revised_rows)})
        if name.startswith("refined_"):
            scored["versusCombined"] = paired_intervals(combined_scores, rows)
        scored["latest"] = {"date": data["weekends"][-1]["date"], "entries": data["weekends"][-1]["entries"],
                            "ratings": history[-1]["post"], "names": data["names"]}
        report["candidates"][name] = scored
        print(name, "overall", scored["historical"]["overall"]["all"]["logScore"], "movers", scored["transfers"]["loss"], flush=True)
    Path("research/unified-ratings/results.json").write_text(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
