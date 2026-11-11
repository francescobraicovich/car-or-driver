"""Joint three-output Gaussian/Laplace filter with robust measurements.

All channels and driver/car entities share one posterior. Graph edges are
observations, never an additional posterior-valued observation.
"""
from datetime import date
import math

import numpy as np
from scipy.linalg import cho_factor, cho_solve
from scipy.special import expit

POINTS = 75 / math.log(10)
TIME_UNIT = 0.003
CHANNELS = ("qual", "race", "overall")
DEFAULTS = dict(driver_correlation=0.5, car_correlation=0.5,
                noise=[1.0, 1.0], driver_multiplier=1.0, car_multiplier=1.0)


def correlation(value):
    if not np.isfinite(value) or not 0 <= value < 1:
        raise ValueError("Correlation must be in [0, 1)")
    return np.eye(3) * (1 - value) + np.ones((3, 3)) * value


def measurement_terms(gaps, targets, channels, scales):
    continuous = channels < 2
    residual = (gaps - targets) / scales
    half = residual / 2
    loss = np.where(continuous, 2 * (np.logaddexp(half, -half)) + np.log(scales),
                    np.logaddexp(0, gaps) - targets * gaps)
    gradient = np.where(continuous, np.tanh(half) / scales, expit(gaps) - targets)
    curvature = np.where(continuous, (1 - np.tanh(half) ** 2) / (2 * scales ** 2),
                         expit(gaps) * expit(-gaps))
    return loss, gradient, curvature


def hazard_probability(probability, first, second, laps=60):
    first, second = np.clip(first, 1e-9, 0.2), np.clip(second, 1e-9, 0.2)
    a, b = 1 - first, 1 - second
    sa, sb = a ** laps, b ** laps
    return np.clip(sa * sb * probability + sa * (1 - sb) + (1 - sa)
                   - first * (1 - 0.5 * second) * (1 - sa * sb) / (1 - a * b), 1e-6, 1 - 1e-6)


class UnifiedModel:
    def __init__(self, parameters=None):
        self.parameters = {**DEFAULTS, **(parameters or {})}
        for name in ("driver", "car"):
            correlation(self.parameters[f"{name}_correlation"])
            if not np.isfinite(self.parameters[f"{name}_multiplier"]) or self.parameters[f"{name}_multiplier"] <= 0:
                raise ValueError("Process multipliers must be positive")
        if len(self.parameters["noise"]) != 2 or any(not np.isfinite(v) or v <= 0 for v in self.parameters["noise"]):
            raise ValueError("Two positive timing noise scales are required")
        self.indices = {}
        self.mean = np.zeros(0)
        self.covariance = np.zeros((0, 0))
        self.previous_date = None
        self.maximum_gradient = 0.0

    def ensure(self, kind, identity):
        key = (kind, str(identity))
        if key in self.indices:
            return
        start = len(self.mean)
        self.indices[key] = start
        self.mean = np.pad(self.mean, (0, 3))
        self.covariance = np.pad(self.covariance, ((0, 3), (0, 3)))
        sd = (20 if kind == "driver" else 50) / POINTS
        self.covariance[start:start + 3, start:start + 3] = sd ** 2 * correlation(self.parameters[f"{kind}_correlation"])

    def begin(self, weekend):
        day = date.fromisoformat(weekend["date"])
        if day.isoformat() != weekend["date"] or (self.previous_date and day < self.previous_date):
            raise ValueError("Weekends must have chronological ISO dates")
        elapsed = (day - self.previous_date).days / 365.25 if self.previous_date else 0
        winter = self.previous_date is not None and day.year != self.previous_date.year
        current_cars = {row["car"] for row in weekend["entries"]}
        for (kind, identity), start in self.indices.items():
            if kind == "driver":
                variance = (4 * self.parameters["driver_multiplier"] / POINTS) ** 2 * elapsed
            else:
                variance = ((3 ** 2 if identity in current_cars else 0) + (15 ** 2 if winter else 0)) * (self.parameters["car_multiplier"] / POINTS) ** 2
            self.covariance[start:start + 3, start:start + 3] += variance * correlation(self.parameters[f"{kind}_correlation"])
        for row in weekend["entries"]:
            self.ensure("driver", row["driver"])
            self.ensure("car", row["car"])
        self.previous_date = day

    def design(self, rows):
        matrix = np.zeros((len(rows), len(self.mean)))
        for i, row in enumerate(rows):
            channel = row["channel"]
            if channel not in (0, 1, 2) or row["a"] == row["b"]:
                raise ValueError("Invalid comparison")
            for kind, identity, sign in (("driver", row["a"], 1), ("driver", row["b"], -1),
                                         ("car", row["ca"], 1), ("car", row["cb"], -1)):
                matrix[i, self.indices[(kind, str(identity))] + channel] += sign
        return matrix

    def predict(self, rows):
        matrix = self.design(rows)
        active = np.flatnonzero(np.any(matrix != 0, axis=0))
        matrix = matrix[:, active]
        means = matrix @ self.mean[active]
        variances = np.maximum(0, np.sum((matrix @ self.covariance[np.ix_(active, active)]) * matrix, axis=1))
        return [{"mean": float(mean), "variance": float(variance)} for mean, variance in zip(means, variances)]

    def update(self, rows, offset=None):
        if not rows:
            return
        # Exact duplicate rows cannot manufacture extra evidence.
        identities = set()
        for row in rows:
            key = (min(row["a"], row["b"]), max(row["a"], row["b"]), row["channel"])
            if key in identities:
                raise ValueError("Duplicate pair/channel observation")
            identities.add(key)
            if not np.isfinite(row["target"]) or not np.isfinite(row["weight"]) or row["weight"] <= 0:
                raise ValueError("Invalid observation value or weight")
            if row["channel"] == 2 and row["target"] not in (0, 1):
                raise ValueError("Order must be binary")
        matrix = self.design(rows)
        active = np.flatnonzero(np.any(matrix != 0, axis=0))
        design = matrix[:, active]
        prior_mean = self.mean[active].copy()
        prior_covariance = self.covariance[np.ix_(active, active)]
        prior_factor = cho_factor(prior_covariance, lower=True)
        precision = cho_solve(prior_factor, np.eye(len(active)))
        channels = np.array([row["channel"] for row in rows])
        targets = np.array([row["target"] / TIME_UNIT if row["channel"] < 2 else row["target"] for row in rows])
        weights = np.array([row["weight"] for row in rows])
        scales = np.array([self.parameters["noise"][row["channel"]] if row["channel"] < 2 else 1 for row in rows])
        offset = np.zeros(len(rows)) if offset is None else np.asarray(offset)
        if offset.shape != (len(rows),) or not np.isfinite(offset).all():
            raise ValueError("Observation offsets must be finite and match the rows")

        def objective(values):
            difference = values - prior_mean
            losses = measurement_terms(design @ values + offset, targets, channels, scales)[0]
            return float(difference @ precision @ difference / 2 + weights @ losses)

        values = prior_mean.copy()
        for _ in range(40):
            _, score, information = measurement_terms(design @ values + offset, targets, channels, scales)
            gradient = precision @ (values - prior_mean) + design.T @ (weights * score)
            hessian = precision + design.T @ ((weights * information)[:, None] * design)
            if np.max(np.abs(gradient)) < 1e-7:
                break
            step = cho_solve(cho_factor(hessian, lower=True), gradient)
            before = objective(values)
            scale = 1.0
            while scale > 2 ** -25 and objective(values - scale * step) > before + 1e-12:
                scale /= 2
            values -= scale * step
        _, score, information = measurement_terms(design @ values + offset, targets, channels, scales)
        gradient = precision @ (values - prior_mean) + design.T @ (weights * score)
        residual = float(np.max(np.abs(gradient)))
        self.maximum_gradient = max(self.maximum_gradient, residual)
        if residual > 1e-5 or not np.isfinite(values).all():
            raise ArithmeticError(f"Nonconverged posterior: gradient {residual}")
        hessian = precision + design.T @ ((weights * information)[:, None] * design)
        posterior_covariance = cho_solve(cho_factor(hessian, lower=True), np.eye(len(active)))
        # Conditional Gaussian propagation preserves correlations with inactive
        # drivers. Only the small current-field Hessian needs factorization.
        transfer = cho_solve(prior_factor, self.covariance[active, :]).T
        self.mean += transfer @ (values - prior_mean)
        self.covariance += transfer @ (posterior_covariance - prior_covariance) @ transfer.T
        self.covariance = (self.covariance + self.covariance.T) / 2
        if not np.isfinite(self.covariance).all() or np.min(np.diag(self.covariance)) <= 0:
            raise ArithmeticError("Invalid posterior covariance")

    def snapshot(self, entries, query_drivers=(), *, field_relative=False):
        # Production uses the model's fixed zero-mean prior reference. The
        # field-relative projection is retained for archived research replays.
        result = {"drivers": {}, "cars": {}, "uncertainty": {"drivers": {}, "cars": {}}}
        for kind, plural, column in (("driver", "drivers", "driver"), ("car", "cars", "car")):
            field = list(dict.fromkeys(row[column] for row in entries))
            indices = np.array([self.indices[(kind, identity)] for identity in field])
            center = np.mean([self.mean[index:index + 3] for index in indices], axis=0) if field_relative else 0
            for (entity_kind, identity), start in self.indices.items():
                if entity_kind != kind:
                    continue
                result[plural][identity] = ((self.mean[start:start + 3] - center) * POINTS).tolist()
                if identity in field:
                    variance = np.diag(self.covariance)[start:start + 3].copy()
                    if field_relative:
                        for channel in range(3):
                            variance[channel] += (-2 * np.mean(self.covariance[start + channel, indices + channel])
                                                  + np.mean(self.covariance[np.ix_(indices + channel, indices + channel)]))
                    result["uncertainty"][plural][identity] = (np.sqrt(np.maximum(0, variance)) * POINTS).tolist()
        ids = list(dict.fromkeys([row["driver"] for row in entries] + list(query_drivers)))
        ids = [identity for identity in ids if ("driver", identity) in self.indices]
        result["covarianceIds"] = ids
        result["driverCovariance"] = []
        for channel in range(3):
            positions = [self.indices[("driver", identity)] + channel for identity in ids]
            result["driverCovariance"].append(self.covariance[np.ix_(positions, positions)].tolist())
        return result


def run_history(weekends, parameters=None, refinement=None, compact=False):
    model = UnifiedModel(parameters)
    history = []
    for weekend in weekends:
        model.begin(weekend)
        record = {"raceId": weekend["raceId"], "predictions": model.predict(weekend.get("tests", []))}
        if not compact:
            record["revisedPredictions"] = model.predict(weekend.get("revisedTests", []))
            record["pre"] = model.snapshot(weekend["entries"], weekend.get("queryDrivers", []), field_relative=True)
        observations = weekend["refinements"][refinement] if refinement else weekend["observations"]
        if compact:
            record["trainingPredictions"] = model.predict(observations)
        model.update(observations)
        if not compact:
            record["post"] = model.snapshot(weekend["entries"], field_relative=True)
            # Post covariance is unnecessary for forecasts or frozen tests.
            record["post"].pop("driverCovariance")
            record["post"].pop("covarianceIds")
        history.append(record)
    return {"history": history, "maximumGradient": model.maximum_gradient,
            "states": len(model.mean), "parameters": model.parameters}
