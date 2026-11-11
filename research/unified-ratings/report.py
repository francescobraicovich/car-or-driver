"""Create the reviewable research decision, ratings and completion record."""
import hashlib
import json
from pathlib import Path

import numpy as np

from evaluate import CHANNELS, evaluate, summarize, table


def main():
    root = Path("research/unified-ratings")
    report = json.loads((root / "results.json").read_text())
    candidate = "refined_all"
    selected = report["candidates"][candidate]
    reference = report["publishedRatings"]
    installed = report["publishedCalibratedHeads"]
    public = report["published"]
    ratio = selected["diagnostics"]["stability"]["overall"]["normalizedP90"] / public["diagnostics"]["stability"]["overall"]["normalizedP90"]
    move_first = np.asarray(public["transfers"]["moveScores"])
    move_second = np.asarray(selected["transfers"]["moveScores"])
    if not np.array_equal(move_first[:, 0], move_second[:, 0]) or public["transfers"]["omissions"] != selected["transfers"]["omissions"]:
        raise ValueError("Frozen mover coverage differs")
    differences = move_second[:, 1] - move_first[:, 1]
    rng = np.random.default_rng(20261111)
    move_interval = np.quantile(np.mean(differences[rng.integers(0, len(differences), (500, len(differences)))], axis=1), [.025, .975]).tolist()
    guards = {
        "overallPooled": selected["historical"]["overall"]["all"]["logScore"] <= reference["historical"]["overall"]["all"]["logScore"] + .005,
        "overallBlocks": all(row["logScore"] <= next(old["logScore"] for old in reference["blocks"] if old["from"] == row["from"] and old["channel"] == "overall") + .015 for row in selected["blocks"] if row["channel"] == "overall"),
        "timingPooled": all(selected["historical"][channel]["all"]["mae"] <= reference["historical"][channel]["all"]["mae"] * 1.05 for channel in ("qual", "race")),
        "timingBlocks": all(row["mae"] <= next(old["mae"] for old in reference["blocks"] if old["from"] == row["from"] and old["channel"] == row["channel"]) * 1.1 for row in selected["blocks"] if row["channel"] != "overall"),
        "frozenTransfers": float(np.mean(differences)) <= .01,
        "normalizedStability": ratio <= 1.25,
    }
    calibration = {item["channel"]: {key: item[key] for key in ("slope", "noise") if key in item}
                   for item in selected["calibration"] if item["from"] == 2026}
    selection = {"candidate": candidate, "refinement": "all", "parameters": selected["parameters"], "inputHash": report["inputHash"],
                 "status": "preferred research baseline", "productionIntegrated": False, "completedScope": "steps 1–9",
                 "guards": guards, "allGuardsPass": all(guards.values()), "calibration": calibration, "calibrationThrough": 2025,
                 "frozenTransferDifference": float(np.mean(differences)), "frozenTransferInterval95": move_interval,
                 "normalizedStabilityRatio": ratio,
                 "decision": "Retain all three learned components and the three measurement refinements for a coherent research baseline under the user's explicit theoretical-preference trade-off. This is not a claim that each extension independently improves prediction or that production acceptance has passed."}
    (root / "selection.json").write_text(json.dumps(selection, indent=2, allow_nan=False))
    latest = selected["latest"]
    ratings = {"date": latest["date"], "channels": CHANNELS, "drivers": [], "cars": []}
    seen_cars = set()
    for entry in latest["entries"]:
        identity, car = entry["driver"], entry["car"]
        ratings["drivers"].append({"id": identity, "name": latest["names"]["drivers"].get(identity, identity), "car": car,
                                   "ratings": {name: 1000 + latest["ratings"]["drivers"][identity][channel] for channel, name in enumerate(CHANNELS)},
                                   "standardDeviations": latest["ratings"]["uncertainty"]["drivers"][identity]})
        if car not in seen_cars:
            ratings["cars"].append({"id": car, "name": latest["names"]["cars"].get(entry["constructor"], car),
                                   "ratings": {name: 1000 + latest["ratings"]["cars"][car][channel] for channel, name in enumerate(CHANNELS)},
                                   "standardDeviations": latest["ratings"]["uncertainty"]["cars"][car]})
            seen_cars.add(car)
    for kind in ("drivers", "cars"):
        ratings[kind].sort(key=lambda row: -row["ratings"]["overall"])
    (root / "latest-ratings.json").write_text(json.dumps(ratings, indent=2, allow_nan=False))

    # Situation labels are calculated from information before each weekend.
    data = json.loads(Path("tmp/unified-ratings/input.json").read_text())
    history = json.loads(Path(f"tmp/unified-ratings/{candidate}.json").read_text())["history"]
    _, scored = evaluate(table(data, history))
    _, public_scored = evaluate(table(data), installed=False)
    peers, teams, tenure = {}, {}, {}
    slices = {name: [[], []] for name in ("rookies", "firstFiveAfterMove", "limitedTeammateHistory", "confidentPredictions")}
    for i, weekend in enumerate(data["weekends"]):
        entries = {entry["driver"]: entry for entry in weekend["entries"]}
        for identity, entry in entries.items():
            tenure[identity] = tenure.get(identity, 0) + 1 if teams.get(identity) == entry["team"] else 1
            teams[identity] = entry["team"]
        current = scored[(scored[:, 0] == i) & (scored[:, 2] == 2)]
        old = public_scored[(public_scored[:, 0] == i) & (public_scored[:, 2] == 2)]
        observations = [row for row in weekend["tests"] if row["channel"] == 2]
        if 2008 <= weekend["year"] <= 2025:
            if len(current) != len(observations):
                raise ValueError("Situation coverage differs")
            for row, new, before in zip(observations, current, old):
                ids = (row["a"], row["b"])
                flags = {
                    "rookies": any(entries[identity]["appearances"] < 10 for identity in ids),
                    "firstFiveAfterMove": any(entries[identity]["appearances"] >= 10 and tenure[identity] <= 5 for identity in ids),
                    "limitedTeammateHistory": any(len(peers.get(identity, set())) < 2 for identity in ids),
                    "confidentPredictions": new[12] >= .8 or new[12] <= .2,
                }
                for name, include in flags.items():
                    if include:
                        slices[name][0].append(new)
                        slices[name][1].append(before)
        for identity, entry in entries.items():
            peers.setdefault(identity, set()).update(other for other, value in entries.items() if other != identity and value["team"] == entry["team"])
    situations = {name: {"selected": summarize(np.asarray(values[0])), "publishedRatings": summarize(np.asarray(values[1]))} for name, values in slices.items()}
    (root / "situations.json").write_text(json.dumps(situations, indent=2, allow_nan=False))

    source_files = sorted([*root.glob("*.py"), *root.glob("*.mjs"), root / "protocol.md", Path("tests/test-unified-ratings.mjs")])
    hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in source_files}
    (root / "manifest.json").write_text(json.dumps({"inputHash": report["inputHash"], "dataFingerprint": report["dataFingerprint"],
        "productionSource": report["productionSource"], "files": hashes, "runtime": report["parameters"]["runtime"]}, indent=2))

    def value(model, channel, metric):
        return model["historical"][channel]["all"][metric]
    lines = ["# Unified ratings: completed research through step 9", "",
        "Selected: **joint three-output model with learned sharing, measurement noise and adaptation; all three evidence refinements**. Production is unchanged.", "",
        "The user's explicit preference for a theoretically coherent model with a small predictive trade-off governs the research selection. Individual failed/inconclusive comparisons remain visible; this is not a claim that every component improves every score.", "",
        "## Fixed historical exam, 2008–2025", "",
        "Rows are distinct comparisons, balanced so each weekend has equal total influence within each target. Overall includes actual classified finishing outcomes with retirements; timing metrics use unchanged comparison targets. Calibration is trained on earlier years only.", "",
        "| Model | Overall log-loss | Qualifying margin MAE | Race-pace margin MAE |", "| --- | ---: | ---: | ---: |"]
    for name, model in [("Installed Thursday head", public), ("Head recalibrated for actual results", installed), ("Published ratings, same target calibration", reference),
                        *[(name, report["candidates"][name]) for name in ("control", "pooling", "noise", "adaptation", "combined", "refined_all")]]:
        lines.append(f"| {name} | {value(model, 'overall', 'logScore'):.6f} | {value(model, 'qual', 'mae') * 100:.4f}% | {value(model, 'race', 'mae') * 100:.4f}% |")
    lines += ["", "MAE is fractional lap duration in percentage points. The installed head was trained on a weighted pace/order benchmark, so its raw loss on actual results is not a fair architecture-only comparison. The recalibrated head and equally calibrated published ratings are the informative controls.", ""]
    for key, label in (("versusPublishedRatings", "equally calibrated published ratings"), ("versusCalibratedHeads", "recalibrated installed heads")):
        difference = selected[key]["overall"]
        lines.append(f"Selected overall loss difference versus {label}: **{difference['logScoreDifference']:+.6f}**, paired 95% season interval **{difference['seasonInterval95']}**.")
    lines += ["", "## Separate evidence refinements", "", "| Change | Original-exam overall loss | Revised-exam qualifying MAE | Revised-exam pace MAE |", "| --- | ---: | ---: | ---: |"]
    for name in ("combined", "refined_qualifying", "refined_pace", "refined_retirement", "refined_all"):
        model = report["candidates"][name]
        lines.append(f"| {name} | {value(model, 'overall', 'logScore'):.6f} | {model['revisedExam']['historical']['qual']['all']['mae'] * 100:.4f}% | {model['revisedExam']['historical']['race']['all']['mae'] * 100:.4f}% |")
    lines += ["", "Q2/Q1 replaces fuel-loaded Q3 in 2006–2009; race laps must actually overlap before window aggregation; pre-retirement position snapshots are omitted. Effects on overall prediction are tiny. These changes are retained for clearer measurement interpretation, not advertised as statistically established forecast gains. Both original and revised exams are preserved in results.json.", "",
        "## Attribution, transfers and uncertainty", "",
        f"Frozen transfer loss: published **{public['transfers']['loss']:.6f}**, selected **{selected['transfers']['loss']:.6f}**, across **{selected['transfers']['moves']}** matched moves. Difference **{np.mean(differences):+.6f}**, paired move interval **{move_interval}**. This uses the new three-target exam, with slopes fitted only on earlier frozen stayer duels; it is not numerically interchangeable with earlier graph-study mover scores.", "",
        f"Overall rating p90 movement: **{public['diagnostics']['stability']['overall']['p90']:.3f} → {selected['diagnostics']['stability']['overall']['p90']:.3f} points**. Field-spread-normalized ratio: **{ratio:.3f}**. The new model is more responsive and less steady; the difference is not hidden by rating rescaling.", "",
        f"Same-team driver/car consecutive-revision correlation: **{public['diagnostics']['sameTeamDriverCarRevisionCorrelation']:.3f} → {selected['diagnostics']['sameTeamDriverCarRevisionCorrelation']:.3f}**. This is descriptive, not causal proof of better attribution.", "",
        f"Timing predictive 90% interval coverage: qualifying **{value(selected, 'qual', 'coverage90'):.1%}**, pace **{value(selected, 'race', 'coverage90'):.1%}**. These intervals are conservative in aggregate. They are observation intervals, not validated driver-rating confidence intervals.", "",
        "## Decision guards", "", "| Guard | Result |", "| --- | --- |"]
    lines += [f"| {name} | {'Pass' if passed else '**Fail**'} |" for name, passed in guards.items()]
    lines += ["", "Passing uncertainty intervals does not establish equivalence or account for all historical model development. The research selection does not override failed guards or authorize step 10.", "",
        "## Synthetic recovery", "", "Three paired seeds in four fixed worlds compare the unified control and learned combination. All channels share correlated weekend noise. A known car shock and a driver swap test attribution; persistent driver–car fit and weak specialization deliberately challenge the model.", "",
        "| World | Model | Overall driver RMSE | Overall car RMSE | Driver-gap 90% coverage, all channels |", "| --- | --- | ---: | ---: | ---: |"]
    simulated = json.loads((root / "simulation-results.json").read_text())["results"]
    for world in ("shared", "specialization", "persistent_fit", "heavy_noise"):
        for model in ("control", "combined"):
            rows = [row for row in simulated if row["world"] == world and row["model"] == model]
            lines.append(f"| {world} | {model} | {np.mean([row['driverRMSE'][2] for row in rows]):.2f} | {np.mean([row['carRMSE'][2] for row in rows]):.2f} | {np.mean([row['driverGapCoverage90'] for row in rows]):.1%} |")
    lines += ["", "Car recovery generally improves, but stronger pooling can harm genuinely specialized drivers. Persistent driver–car fit causes undercoverage; other worlds show conservative intervals. The model does not recover universal car-free ability, and these simulations are not an independent validation against the production model.", "",
        "## Monitoring and reproducibility", "",
        f"2026 overall log-loss: selected **{selected['monitoring2026']['overall']['logScore']:.6f}**, equally calibrated published ratings **{reference['monitoring2026']['overall']['logScore']:.6f}**. Monitoring was not used to tune global parameters.", "",
        f"Data end: **{ratings['date']}**. Production source fingerprint: `{report['productionSource']['sourceHash']}`. Input fingerprint: `{report['inputHash']}`.", "",
        "The numerical solver checked convergence for every update. Focused tests cover derivatives, symmetry, exact teammate cancellation, partial pooling, invalid inputs, duplicates, chronology, covariance, weak connections, transfer invariance, retirement handling and serialized forecasting. Full production regression results are recorded in verification.json.", "",
        "Files: [selection](selection.json), [all metrics](results.json), [latest ratings](latest-ratings.json), [situation diagnostics](situations.json), [simulation results](simulation-results.json), [manifest](manifest.json), [reproduction](README.md).", ""]
    (root / "results.md").write_text("\n".join(lines))
    print(json.dumps({"selection": candidate, "guards": guards, "transferDifference": float(np.mean(differences)), "normalizedStabilityRatio": ratio}))


if __name__ == "__main__":
    main()
