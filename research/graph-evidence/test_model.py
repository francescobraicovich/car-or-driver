import unittest
import numpy as np
from model import TemporalGraph, measurement_loss, run_history, POINTS


def observation(a="a", b="b", target=1, weight=1, kind="binary", session="race"):
    return dict(a=a, b=b, target=target, weight=weight, kind=kind, session=session)


def weekend(day="2020-01-01", observations=None, entries=None):
    return dict(date=day, raceId=day, entries=entries or ["a", "b"], observations=observations or [])


def gap(snapshot, session="race"):
    values = snapshot["levels"][session]
    return values[0] - values[1]


class GraphTests(unittest.TestCase):
    def test_derivatives(self):
        for continuous in [False, True]:
            for value in [-8, -1, 0, 2, 12]:
                arguments = (np.array([.7 if continuous else 1]), np.array([continuous]))
                def loss(x):
                    return measurement_loss(np.array([x]), *arguments)
                epsilon = 1e-5
                _, gradient, curvature = loss(value)
                self.assertAlmostEqual(gradient[0], (loss(value + epsilon)[0][0] - loss(value - epsilon)[0][0]) / (2 * epsilon), places=7)
                self.assertAlmostEqual(curvature[0], (loss(value + epsilon)[1][0] - loss(value - epsilon)[1][0]) / (2 * epsilon), places=7)

    def test_original_objective(self):
        result = TemporalGraph().advance(weekend(observations=[observation(weight=80)]))["post"]
        a, b = np.array(result["levels"]["race"]) / POINTS
        self.assertLess(abs(2 * a + 80 * (1 / (1 + np.exp(b - a)) - 1)), 1e-7)

    def test_margin_and_outlier(self):
        gaps = [gap(TemporalGraph().advance(weekend(observations=[observation(target=value, kind="margin")]))["post"]) for value in [.01, 1, 10, 1e6]]
        self.assertTrue(all(first < second for first, second in zip(gaps, gaps[1:])))
        self.assertLess(gaps[-1], POINTS / 2 + 1e-6)
        negative = gap(TemporalGraph().advance(weekend(observations=[observation(target=-1, kind="margin")]))["post"])
        self.assertAlmostEqual(negative, -gaps[1])

    def test_chronology_and_invalid_inputs(self):
        first = weekend(observations=[observation()])
        future = weekend("2021-01-01", [observation(target=0)])
        self.assertEqual(run_history([first], {})["history"], run_history([first, future], {})["history"][:1])
        for item in [observation(a="a", b="a"), observation(weight=-1), observation(target=float("nan")), observation(target=.5), observation(b="unknown")]:
            with self.assertRaises(ValueError):
                TemporalGraph().advance(weekend(observations=[item]))
        with self.assertRaises(ValueError):
            TemporalGraph().advance(weekend("2020-02-30"))
        model = TemporalGraph()
        model.advance(future)
        with self.assertRaises(ValueError):
            model.advance(first)

    def test_reversal_and_covariance(self):
        first = TemporalGraph(covariance=True)
        second = TemporalGraph(covariance=True)
        first.advance(weekend(observations=[observation(weight=20)]))
        second.advance(weekend(observations=[observation(a="b", b="a", target=0, weight=20)]))
        before = first.advance(weekend("2020-01-02"))["pre"]
        reversed_before = second.advance(weekend("2020-01-02"))["pre"]
        np.testing.assert_allclose(before["levels"]["race"], reversed_before["levels"]["race"])
        covariance = np.asarray(before["covariance"]["race"])
        np.testing.assert_allclose(covariance, covariance.T)
        self.assertGreater(np.linalg.eigvalsh(covariance).min(), 0)
        self.assertGreater(covariance[0, 1], 0)
        contrast = covariance[0, 0] + covariance[1, 1] - 2 * covariance[0, 1]
        self.assertLess(contrast, covariance.trace())

    def test_weak_chain(self):
        variances = []
        for weight in [1, 100]:
            graph = TemporalGraph(covariance=True)
            evidence = [observation(weight=20), observation(target=0, weight=20), observation(a="b", b="c", weight=weight), observation(a="b", b="c", target=0, weight=weight)]
            graph.advance(weekend(observations=evidence, entries=["a", "b", "c"]))
            covariance = np.array(graph.advance(weekend("2020-01-02", entries=["a", "b", "c"]))["pre"]["covariance"]["race"])
            variances.append(covariance[0, 0] + covariance[2, 2] - 2 * covariance[0, 2])
        self.assertGreater(variances[0], variances[1])

    def test_session_specialization(self):
        evidence = [observation(weight=20, session="race"), observation(weight=20, target=0, session="qual")]
        shared = TemporalGraph().advance(weekend(observations=evidence))["post"]
        separated = TemporalGraph(sessions=True).advance(weekend(observations=evidence))["post"]
        self.assertAlmostEqual(gap(shared), 0)
        self.assertGreater(gap(separated, "race"), 0)
        self.assertLess(gap(separated, "qual"), 0)
        locked = TemporalGraph(sessions=True, coupling=1e6).advance(weekend(observations=[observation(weight=10)]))["post"]
        original = TemporalGraph().advance(weekend(observations=[observation(weight=10)]))["post"]
        self.assertLess(abs(gap(locked) - gap(original)), 1e-4)

    def test_qualifier_without_race_start(self):
        graph = TemporalGraph(covariance=True)
        item = weekend(observations=[observation()])
        item["forecastEntries"] = ["a", "b", "c"]
        result = graph.advance(item)
        self.assertEqual(result["pre"]["ids"], ["a", "b", "c"])
        self.assertEqual(result["post"]["ids"], ["a", "b"])
        self.assertEqual(result["pre"]["levels"]["qual"][2], 0)
        self.assertAlmostEqual(result["pre"]["covariance"]["qual"][2][2], .5)


if __name__ == "__main__":
    unittest.main()
