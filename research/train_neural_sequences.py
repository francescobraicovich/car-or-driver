"""Chronological two-tower sequence learner for portable driver/car corrections.

Each pre-weekend prediction uses weights trained on earlier weekends only. The
current weekend's pair and lap targets update shared weights only afterwards.
The driver and car towers never receive team-change indicators or special
update rules for movers.
"""

import json
import sys

import numpy as np


class Tower:
    def __init__(self, width, hidden, seed, scale):
        random = np.random.default_rng(seed)
        self.scale = scale
        self.parameters = {
            "first": random.normal(0, np.sqrt(1 / width), (width, hidden)),
            "first_bias": np.zeros(hidden),
            "second": random.normal(0, np.sqrt(1 / hidden), (hidden, hidden // 2)),
            "second_bias": np.zeros(hidden // 2),
            "output": np.zeros((hidden // 2, 1)),
            "output_bias": np.zeros(1),
        }
        self.moments = {key: np.zeros_like(value) for key, value in self.parameters.items()}
        self.variances = {key: np.zeros_like(value) for key, value in self.parameters.items()}

    def forward(self, features):
        first = np.tanh(features @ self.parameters["first"] + self.parameters["first_bias"])
        second = np.tanh(first @ self.parameters["second"] + self.parameters["second_bias"])
        raw = second @ self.parameters["output"] + self.parameters["output_bias"]
        activated = np.tanh(raw)
        return self.scale * activated[:, 0], (features, first, second, activated)

    def backward(self, cache, output_gradient):
        features, first, second, activated = cache
        raw_gradient = (output_gradient[:, None] * self.scale) * (1 - activated * activated)
        gradients = {
            "output": second.T @ raw_gradient,
            "output_bias": raw_gradient.sum(axis=0),
        }
        second_gradient = (raw_gradient @ self.parameters["output"].T) * (1 - second * second)
        gradients["second"] = first.T @ second_gradient
        gradients["second_bias"] = second_gradient.sum(axis=0)
        first_gradient = (second_gradient @ self.parameters["second"].T) * (1 - first * first)
        gradients["first"] = features.T @ first_gradient
        gradients["first_bias"] = first_gradient.sum(axis=0)
        return gradients

    def update(self, gradients, step, learning_rate, weight_decay):
        for key, parameter in self.parameters.items():
            gradient = gradients[key]
            if not key.endswith("bias"):
                gradient = gradient + weight_decay * parameter
            gradient = np.clip(gradient, -2, 2)
            first = self.moments[key] = 0.9 * self.moments[key] + 0.1 * gradient
            second = self.variances[key] = 0.999 * self.variances[key] + 0.001 * gradient * gradient
            corrected_first = first / (1 - 0.9 ** step)
            corrected_second = second / (1 - 0.999 ** step)
            parameter -= learning_rate * corrected_first / (np.sqrt(corrected_second) + 1e-8)


def train(input_path, output_path, options):
    with open(input_path, encoding="utf-8") as source:
        weekends = json.load(source)["weekends"]
    hidden = int(options.get("hidden", 64))
    correction_scale = float(options.get("correctionScale", 40))
    learning_rate = float(options.get("learningRate", 0.003))
    lap_weight = float(options.get("lapWeight", 0.02))
    output_penalty = float(options.get("outputPenalty", 0.003))
    weight_decay = float(options.get("weightDecay", 0.0001))
    updates = int(options.get("updatesPerWeekend", 2))
    pace_points = float(options.get("pacePoints", 150))
    driver = Tower(len(weekends[0]["driverFeatures"][0]), hidden, 117, correction_scale)
    car = Tower(len(weekends[0]["carFeatures"][0]), hidden, 811, correction_scale)
    predictions = []
    losses = []
    step = 0
    for weekend in weekends:
        driver_features = np.asarray(weekend["driverFeatures"], dtype=np.float64)
        car_features = np.asarray(weekend["carFeatures"], dtype=np.float64)
        pairs = np.asarray(weekend["pairs"], dtype=np.float64)
        pair_index = pairs[:, :4].astype(np.int32)
        first_driver, second_driver, first_car, second_car = pair_index.T
        outcomes = pairs[:, 4]
        weights = pairs[:, 5]
        weights = weights / weights.sum()
        baseline = pairs[:, 6]
        car_of_driver = np.asarray(weekend["driverCar"], dtype=np.int32)
        lap_target = np.asarray(weekend["lapTargets"], dtype=np.float64)
        lap_mask = np.asarray(weekend["lapMask"], dtype=np.float64)
        driver_correction, _ = driver.forward(driver_features)
        car_correction, _ = car.forward(car_features)
        logit = baseline + np.log(10) / 75 * (
            driver_correction[first_driver] - driver_correction[second_driver]
            + car_correction[first_car] - car_correction[second_car]
        )
        losses.append({"year": weekend["year"], "pairLoss": float(np.sum(
            weights * (np.maximum(logit, 0) - outcomes * logit + np.log1p(np.exp(-np.abs(logit))))))})
        predictions.append({
            "raceId": weekend["raceId"],
            "driverIds": weekend["driverIds"],
            "constructorIds": weekend["constructorIds"],
            "driverCorrection": driver_correction.tolist(),
            "carCorrection": car_correction.tolist(),
        })
        for _ in range(updates):
            step += 1
            driver_correction, driver_cache = driver.forward(driver_features)
            car_correction, car_cache = car.forward(car_features)
            logit = baseline + np.log(10) / 75 * (
                driver_correction[first_driver] - driver_correction[second_driver]
                + car_correction[first_car] - car_correction[second_car]
            )
            probability = 1 / (1 + np.exp(-np.clip(logit, -30, 30)))
            error = weights * (probability - outcomes) * np.log(10) / 75
            driver_gradient = np.bincount(first_driver, error, minlength=len(driver_features))
            driver_gradient -= np.bincount(second_driver, error, minlength=len(driver_features))
            car_gradient = np.bincount(first_car, error, minlength=len(car_features))
            car_gradient -= np.bincount(second_car, error, minlength=len(car_features))
            driver_gradient += 2 * output_penalty * driver_correction / (correction_scale ** 2 * len(driver_features))
            car_gradient += 2 * output_penalty * car_correction / (correction_scale ** 2 * len(car_features))
            if lap_weight > 0 and lap_mask.sum() > 0:
                total = 50 * (driver_features[:, 0] + car_features[car_of_driver, 0])
                total += driver_correction + car_correction[car_of_driver]
                predicted_pace = (total - total.mean()) / pace_points
                difference = predicted_pace - lap_target
                # Robust auxiliary pace loss; one normalized contribution per race.
                lap_gradient = lap_weight * lap_mask * np.clip(difference, -1, 1) / lap_mask.sum()
                lap_gradient = (lap_gradient - lap_gradient.mean()) / pace_points
                driver_gradient += lap_gradient
                car_gradient += np.bincount(car_of_driver, lap_gradient, minlength=len(car_features))
            driver.update(driver.backward(driver_cache, driver_gradient), step, learning_rate, weight_decay)
            car.update(car.backward(car_cache, car_gradient), step, learning_rate, weight_decay)
        post_driver, _ = driver.forward(np.asarray(weekend["driverPostFeatures"], dtype=np.float64))
        post_car, _ = car.forward(np.asarray(weekend["carPostFeatures"], dtype=np.float64))
        predictions[-1]["driverPostCorrection"] = post_driver.tolist()
        predictions[-1]["carPostCorrection"] = post_car.tolist()
    result = {"options": options, "predictions": predictions, "trainingLoss": losses}
    with open(output_path, "w", encoding="utf-8") as target:
        json.dump(result, target, separators=(",", ":"))
    for start, end in [(2002, 2007), (2008, 2011), (2012, 2015), (2016, 2025)]:
        selected = [row["pairLoss"] for row in losses if start <= row["year"] <= end]
        print(f"{start}-{end}: {np.mean(selected):.6f} ({len(selected)} weekends)")
    print(f"saved {len(predictions)} dated rating snapshots to {output_path}")


if __name__ == "__main__":
    train(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {})
