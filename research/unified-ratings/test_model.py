import copy
import unittest
from datetime import date, timedelta

import numpy as np

from model import UnifiedModel, measurement_terms, run_history, hazard_probability, POINTS
from forecast import state_dict, restore, predict


def weekend(index=0, target=.003, same=True):
    entries = [{"driver": "a", "car": "x"}, {"driver": "b", "car": "x" if same else "y"}]
    row = {"a": "a", "b": "b", "ca": "x", "cb": "x" if same else "y", "channel": 0, "target": target, "weight": 1}
    return {"raceId": str(index), "date": (date(2020, 1, 1) + timedelta(days=14 * index)).isoformat(),
            "entries": entries, "observations": [row], "tests": [row], "revisedTests": [row]}


class ModelTests(unittest.TestCase):
    def test_derivatives(self):
        x = np.array([-.7, 1.2, -.3])
        target, channels, scales = np.array([.3, -2., 1.]), np.array([0, 1, 2]), np.array([.8, 2., 1.])
        _, gradient, curvature = measurement_terms(x, target, channels, scales)
        epsilon = 1e-5
        above = measurement_terms(x + epsilon, target, channels, scales)
        below = measurement_terms(x - epsilon, target, channels, scales)
        np.testing.assert_allclose(gradient, (above[0] - below[0]) / (2 * epsilon), atol=1e-8)
        np.testing.assert_allclose(curvature, (above[1] - below[1]) / (2 * epsilon), atol=1e-8)

    def test_reversal_and_car_cancellation(self):
        week = weekend()
        first = UnifiedModel()
        first.begin(week)
        before = first.mean.copy()
        design = first.design(week["observations"])
        start = first.indices[("car", "x")]
        self.assertTrue(np.all(design[:, start:start + 3] == 0))
        first.update(week["observations"])
        np.testing.assert_allclose(first.mean[start:start + 3], before[start:start + 3])
        reverse = copy.deepcopy(week)
        row = reverse["observations"][0]
        row["a"], row["b"], row["target"] = row["b"], row["a"], -row["target"]
        second = UnifiedModel()
        second.begin(reverse)
        second.update(reverse["observations"])
        np.testing.assert_allclose(first.mean, second.mean, atol=1e-12)
        np.testing.assert_allclose(first.covariance, second.covariance, atol=1e-12)

    def test_pooling_and_separate_targets(self):
        week = weekend(target=.01)
        independent = UnifiedModel({"driver_correlation": 0, "car_correlation": 0})
        shared = UnifiedModel({"driver_correlation": .85})
        for model in (independent, shared):
            model.begin(week)
            model.update(week["observations"])
        self.assertEqual(independent.mean[independent.indices[("driver", "a")] + 2], 0)
        self.assertGreater(shared.mean[shared.indices[("driver", "a")] + 2], 0)
        self.assertNotEqual(shared.mean[0], shared.mean[2])

    def test_prefix_and_future_invariance(self):
        weeks = [weekend(index, .003 if index < 4 else -.02) for index in range(8)]
        short = run_history(weeks[:4])
        full = run_history(weeks)
        self.assertEqual(short["history"], full["history"][:4])
        changed = copy.deepcopy(weeks)
        changed[3]["observations"][0]["target"] = -.2
        altered = run_history(changed)
        self.assertEqual(full["history"][3]["pre"], altered["history"][3]["pre"])
        self.assertEqual(full["history"][2], altered["history"][2])

    def test_transfer_has_no_mean_jump(self):
        model = UnifiedModel()
        week = weekend()
        model.begin(week)
        model.update(week["observations"])
        before = model.mean[model.indices[("driver", "a")]:model.indices[("driver", "a")] + 3].copy()
        moved = weekend(1, same=False)
        moved["entries"][0]["car"] = "new"
        model.begin(moved)
        np.testing.assert_array_equal(before, model.mean[:3])

    def test_published_reference_is_independent_of_lineup(self):
        model = UnifiedModel()
        week = weekend(same=False)
        model.begin(week)
        model.update(week["observations"])
        before = model.snapshot(week["entries"])
        # A withdrawal changes the published field, but supplies no new evidence.
        after = model.snapshot(week["entries"][:1])
        for kind, identity in (("drivers", "a"), ("cars", "x")):
            np.testing.assert_array_equal(before[kind][identity], after[kind][identity])
            np.testing.assert_array_equal(before["uncertainty"][kind][identity], after["uncertainty"][kind][identity])
        for (kind, identity), start in model.indices.items():
            plural = "drivers" if kind == "driver" else "cars"
            np.testing.assert_allclose(before[plural][identity], model.mean[start:start + 3] * POINTS)
            np.testing.assert_allclose(before["uncertainty"][plural][identity],
                                       np.sqrt(np.diag(model.covariance)[start:start + 3]) * POINTS)

    def test_reference_projection_preserves_comparisons(self):
        from build_unified import field_state
        model = UnifiedModel()
        week = weekend(same=False)
        model.begin(week)
        model.update(week["observations"])
        fixed = model.snapshot(week["entries"])
        relative = model.snapshot(week["entries"], field_relative=True)
        for plural, a, b in (("drivers", "a", "b"), ("cars", "x", "y")):
            np.testing.assert_allclose(np.subtract(fixed[plural][a], fixed[plural][b]),
                                       np.subtract(relative[plural][a], relative[plural][b]), atol=1e-12)
        state = field_state(model, week["entries"])
        coefficients = np.array([1, 1, -1, -1])  # driver a, car x, driver b, car y
        overall = {**week["observations"][0], "channel": 2, "target": 1}
        published_variance = coefficients @ np.array(state["covariance"]) @ coefficients
        self.assertAlmostEqual(published_variance, model.predict([overall])[0]["variance"], places=12)

    def test_covariance_and_weak_connections(self):
        model = UnifiedModel()
        for i in range(15):
            week = weekend(i)
            week["entries"].append({"driver": "unseen", "car": "other"})
            model.begin(week)
            model.update(week["observations"])
        np.linalg.cholesky(model.covariance)
        within = model.predict(week["observations"])[0]["variance"]
        other = {**week["observations"][0], "b": "unseen", "cb": "x"}
        self.assertGreater(model.predict([other])[0]["variance"], within)

    def test_bounded_influence_and_invalid_values(self):
        gradients = measurement_terms(np.zeros(2), np.array([1e3, 1e6]), np.zeros(2), np.ones(2))[1]
        np.testing.assert_allclose(gradients, [-1, -1])
        model = UnifiedModel()
        week = weekend()
        model.begin(week)
        with self.assertRaises(ValueError):
            model.update(week["observations"] * 2)
        for target in (float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                model.update([{**week["observations"][0], "target": target}])
        with self.assertRaises(ValueError):
            UnifiedModel({"noise": [0, 1]})
        with self.assertRaises(ValueError):
            model.begin({**week, "date": "2019-01-01"})

    def test_hazard_symmetry(self):
        self.assertAlmostEqual(hazard_probability(.7, .01, .003), 1 - hazard_probability(.3, .003, .01), places=12)
        self.assertLess(hazard_probability(.7, .02, .001), .7)

    def test_serialized_forecast(self):
        model = UnifiedModel()
        week = weekend()
        model.begin(week)
        model.update(week["observations"])
        state = state_dict(model)
        np.testing.assert_array_equal(restore(state).covariance, model.covariance)
        first = predict(state, '2020-02-01', 'a', 'x', 'b', 'x', .001, .002)
        reverse = predict(state, '2020-02-01', 'b', 'x', 'a', 'x', .002, .001)
        self.assertAlmostEqual(first['channels']['overall']['actualResultProbability'], 1 - reverse['channels']['overall']['actualResultProbability'])
        self.assertAlmostEqual(first['channels']['qual']['fractionalTimeAdvantage'], -reverse['channels']['qual']['fractionalTimeAdvantage'])


if __name__ == "__main__":
    unittest.main()
