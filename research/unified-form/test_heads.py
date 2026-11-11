import unittest

import numpy as np

from heads import design, objective_gradient, probability


class HeadTests(unittest.TestCase):
    def test_reversal_all_families(self):
        rng = np.random.default_rng(62)
        features = rng.normal(size=(20, 12))
        context = np.column_stack([np.arange(20) % 3, rng.integers(1, 20, 20), rng.integers(1, 20, 20), np.zeros((20, 3))])
        reverse = context.copy()
        reverse[:, 1:3] = context[:, [2, 1]]
        for family in ('ratings', 'context', 'nonlinear'):
            for mode in ('pre', 'grid'):
                first, _ = design(features, context, mode, family, [0, 1, 2], True)
                second, _ = design(-features, reverse, mode, family, [0, 1, 2], True)
                np.testing.assert_allclose(first, -second, atol=1e-12)

    def test_likelihood_gradient_and_risk_symmetry(self):
        rng = np.random.default_rng(24)
        matrix = rng.normal(size=(30, 5))
        offset = rng.normal(size=30)
        rows = np.zeros((30, 11))
        rows[:, 3] = rng.integers(0, 2, 30)
        rows[:, 8:10] = rng.uniform(.001, .02, (30, 2))
        rows[:, 10] = rng.uniform(.01, 1, 30)
        coefficients = rng.normal(size=5) * .2
        value, gradient = objective_gradient(coefficients, matrix, offset, rows, .01)
        numerical = []
        for index in range(5):
            delta = np.zeros(5)
            delta[index] = 1e-5
            numerical.append((objective_gradient(coefficients + delta, matrix, offset, rows, .01)[0] -
                              objective_gradient(coefficients - delta, matrix, offset, rows, .01)[0]) / 2e-5)
        np.testing.assert_allclose(gradient, numerical, atol=1e-8)
        reversed_rows = rows.copy()
        reversed_rows[:, 8:10] = rows[:, [9, 8]]
        np.testing.assert_allclose(probability(rows, offset) + probability(reversed_rows, -offset), 1, atol=1e-12)

    def test_pre_weekend_excludes_grid(self):
        features = np.ones((4, 12))
        context = np.ones((4, 6))
        changed = context.copy()
        changed[:, 1:3] = 99
        for family in ('ratings', 'context', 'nonlinear'):
            np.testing.assert_array_equal(design(features, context, 'pre', family, [1])[0],
                                          design(features, changed, 'pre', family, [1])[0])


if __name__ == '__main__':
    unittest.main()
