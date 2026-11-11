"""Sparse temporal paired-comparison model; see protocol.md for the objective."""
import json
import hashlib
import math
import sys
from datetime import date

import numpy as np
from scipy.sparse import coo_matrix, diags
from scipy.sparse.linalg import splu
from scipy.special import expit

POINTS = 75 / math.log(10)


def measurement_loss(gaps, targets, continuous):
    residual = (gaps - targets) / 2
    loss = np.where(continuous, np.logaddexp(residual, -residual) - math.log(2),
                    np.logaddexp(0, gaps) - targets * gaps)
    gradient = np.where(continuous, np.tanh(residual) / 2, expit(gaps) - targets)
    curvature = np.where(continuous, (1 - np.tanh(residual) ** 2) / 4,
                         expit(gaps) * expit(-gaps))
    return loss, gradient, curvature


class TemporalGraph:
    def __init__(self, half_life=3, drift=4, precision=2, sessions=False,
                 coupling=2, resolution="season", covariance=False):
        if half_life is not None and (not math.isfinite(half_life) or half_life <= 0):
            raise ValueError("half_life must be finite and positive, or None")
        if any(not math.isfinite(x) or x <= 0 for x in [drift, precision]):
            raise ValueError("drift and precision must be finite and positive")
        if not math.isfinite(coupling) or coupling < 0 or resolution not in ["season", "weekend"]:
            raise ValueError("Invalid coupling or temporal resolution")
        self.half_life, self.drift, self.precision = half_life, drift, precision
        self.sessions, self.coupling, self.resolution, self.covariance = sessions, coupling, resolution, covariance
        self.nodes, self.latest, self.transitions, self.observations = [], {}, [], []
        self.values = np.array([], dtype=float)
        self.previous_date = None
        self.maximum_gradient = 0.0

    def ensure(self, driver, day):
        period = day.year if self.resolution == "season" else day.toordinal()
        session_names = ["race", "qual"] if self.sessions else ["shared"]
        inserted = []
        for session in session_names:
            key = (driver, session)
            previous = self.latest.get(key)
            if previous is not None and self.nodes[previous][1] == period:
                continue
            index = len(self.nodes)
            self.nodes.append((driver, period, previous is None))
            self.values = np.append(self.values, 0 if previous is None else self.values[previous])
            if previous is not None:
                elapsed = period - self.nodes[previous][1]
                if self.resolution == "weekend":
                    elapsed /= 365.25
                temporal_precision = 1 / ((self.drift / POINTS) ** 2 * elapsed)
                self.transitions.append((previous, index, temporal_precision / (2 if self.sessions else 1)))
            self.latest[key] = index
            inserted.append(index)
        if self.sessions and inserted and self.coupling:
            self.transitions.append((*inserted, self.coupling))

    @staticmethod
    def incidence(pairs, size):
        count = len(pairs)
        if not count:
            return coo_matrix((0, size)).tocsr()
        columns = np.asarray(pairs, dtype=int).ravel()
        return coo_matrix((np.tile([1., -1.], count), (np.repeat(np.arange(count), 2), columns)), shape=(count, size)).tocsr()

    def system(self, day):
        size = len(self.nodes)
        prior = diags([self.precision / (2 if self.sessions else 1) if node[2] else 0 for node in self.nodes], format="csc")
        if self.transitions:
            links = self.incidence([link[:2] for link in self.transitions], size)
            prior = prior + links.T @ diags([link[2] for link in self.transitions]) @ links
        design = self.incidence([row[:2] for row in self.observations], size)
        targets = np.array([row[2] for row in self.observations])
        continuous = np.array([row[3] for row in self.observations], dtype=bool)
        weights = np.array([row[4] for row in self.observations], dtype=float)
        if self.half_life is not None:
            elapsed = np.array([(day - row[5]).days for row in self.observations])
            weights *= 2 ** (-elapsed / (365.25 * self.half_life))
        return prior, design, targets, continuous, weights

    def snapshot(self, day, entries, include_covariance=False):
        if not self.nodes:
            return {"ids": [], "levels": {"race": [], "qual": []}, "covariance": {}}
        prior, design, targets, continuous, weights = self.system(day)

        def objective(values):
            losses, _, _ = measurement_loss(design @ values, targets, continuous)
            return float(values @ (prior @ values) / 2 + weights @ losses)

        for _ in range(60):
            _, score, information = measurement_loss(design @ self.values, targets, continuous)
            gradient = prior @ self.values + design.T @ (weights * score)
            hessian = (prior + design.T @ diags(weights * information) @ design).tocsc()
            if np.max(np.abs(gradient)) < 1e-8:
                break
            step = splu(hessian).solve(gradient)
            before = objective(self.values)
            scale = 1.0
            while scale > 2 ** -30:
                candidate = self.values - scale * step
                if objective(candidate) <= before + 1e-12:
                    break
                scale /= 2
            self.values = candidate
        _, score, information = measurement_loss(design @ self.values, targets, continuous)
        gradient = prior @ self.values + design.T @ (weights * score)
        residual = float(np.max(np.abs(gradient)))
        if not np.isfinite(self.values).all() or residual > 1e-6:
            raise ArithmeticError(f"Graph did not converge: gradient {residual}")
        self.maximum_gradient = max(self.maximum_gradient, residual)
        result = {"ids": entries, "levels": {}, "covariance": {}}
        factor = None
        for session in ["race", "qual"]:
            positions = [self.latest[(driver, session if self.sessions else "shared")] for driver in entries]
            result["levels"][session] = (self.values[positions] * POINTS).tolist()
            if include_covariance and entries:
                if not self.sessions and session == "qual":
                    result["covariance"][session] = result["covariance"]["race"]
                    continue
                if factor is None:
                    hessian = (prior + design.T @ diags(weights * information) @ design).tocsc()
                    factor = splu(hessian)
                right = np.zeros((len(self.nodes), len(entries)))
                right[positions, np.arange(len(entries))] = 1
                covariance = factor.solve(right)[positions, :]
                result["covariance"][session] = ((covariance + covariance.T) / 2).tolist()
        return result

    def advance(self, weekend):
        day = date.fromisoformat(weekend["date"])
        if day.isoformat() != weekend["date"] or (self.previous_date and day < self.previous_date):
            raise ValueError("Dates must be valid and chronological")
        entries = list(dict.fromkeys(map(str, weekend["entries"])))
        observations = weekend["observations"]
        for row in observations:
            if (row["a"] == row["b"] or row["a"] not in entries or row["b"] not in entries
                    or row["kind"] not in ["binary", "margin"] or row["session"] not in ["race", "qual"]
                    or not math.isfinite(row["target"]) or not math.isfinite(row["weight"]) or row["weight"] <= 0
                    or (row["kind"] == "binary" and row["target"] not in [0, 1])):
                raise ValueError("Invalid graph observation")
        self.previous_date = day
        forecast_entries = list(dict.fromkeys(entries + list(map(str, weekend.get("forecastEntries", [])))))
        for driver in forecast_entries:
            self.ensure(driver, day)
        before = self.snapshot(day, forecast_entries, self.covariance)
        for row in observations:
            session = row["session"] if self.sessions else "shared"
            self.observations.append((self.latest[(row["a"], session)], self.latest[(row["b"], session)],
                                      row["target"], row["kind"] == "margin", row["weight"], day))
        after = self.snapshot(day, entries) if observations or forecast_entries != entries else before
        return {"raceId": weekend["raceId"], "pre": before, "post": after}


def run_history(weekends, options):
    model = TemporalGraph(**options)
    history = [model.advance(weekend) for weekend in weekends]
    return {"history": history, "maximumGradient": model.maximum_gradient, "nodes": len(model.nodes)}


if __name__ == "__main__":
    import scipy
    with open(sys.argv[1]) as stream:
        payload = json.load(stream)
    with open(sys.argv[2]) as stream:
        configurations = json.load(stream)
    with open(__file__, "rb") as stream:
        solver_hash = hashlib.sha256(stream.read()).hexdigest()
    with open(sys.argv[1], "rb") as stream:
        input_hash = hashlib.sha256(stream.read()).hexdigest()
    result = {"inputFingerprint": payload["fingerprint"], "inputHash": input_hash, "solverHash": solver_hash,
              "runtime": {"python": sys.version, "numpy": np.__version__, "scipy": scipy.__version__}, "models": {}}
    for name, configuration in configurations.items():
        weekends = [weekend for weekend in payload[configuration["evidence"]] if weekend["year"] <= configuration.get("through", 9999)]
        result["models"][name] = run_history(weekends, configuration["options"])
        print(f"Completed {name}: {result['models'][name]['nodes']} nodes", flush=True)
    with open(sys.argv[3], "w") as stream:
        json.dump(result, stream, allow_nan=False, separators=(",", ":"))
