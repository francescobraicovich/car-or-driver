import unittest

import numpy as np

from model import UnifiedModel
from unified_grid import grid_design, grid_rows, grid_objective, fit_grid_head, grid_probability


class GridTests(unittest.TestCase):
    def rows(self):
        rng = np.random.default_rng(83)
        count = 240
        rows = np.zeros((count, 13))
        rows[:, 0] = np.arange(count) // 10
        rows[:, 1] = 2002 + np.arange(count) // 30
        rows[:, 2] = 2
        rows[:, 3] = rng.integers(0, 2, count)
        rows[:, 4] = rng.normal(size=count)
        rows[:, 5] = .2
        rows[:, 8:10] = rng.uniform(.0001, .01, (count, 2))
        rows[:, 10] = .1
        rows[:, 11] = rng.integers(1, 10, count)
        rows[:, 12] = rng.integers(11, 21, count)
        return rows

    def test_gradient(self):
        rows = self.rows()
        matrix = grid_design(rows)
        values = np.array([.12, -.2])
        _, gradient = grid_objective(values, matrix, matrix[:, 0], rows, .01)
        numerical = []
        for i in range(2):
            delta = np.eye(2)[i] * 1e-5
            numerical.append((grid_objective(values + delta, matrix, matrix[:, 0], rows, .01)[0] -
                              grid_objective(values - delta, matrix, matrix[:, 0], rows, .01)[0]) / 2e-5)
        np.testing.assert_allclose(gradient, numerical, atol=1e-8)

    def test_future_invariance(self):
        rows = self.rows()
        head = fit_grid_head(rows, 2008)
        rows[rows[:, 1] >= 2008, 3] = 1 - rows[rows[:, 1] >= 2008, 3]
        rows[rows[:, 1] >= 2008, 4] = 99
        self.assertEqual(head, fit_grid_head(rows, 2008))

    def test_invalid_grids_and_symmetry(self):
        rows = self.rows()
        for i, positions in enumerate([(0, 1), (1, 1), (-2, 1), (1.5, 2), (1, 41)]):
            rows[i, 11:13] = positions
        self.assertEqual(len(grid_rows(rows)), len(rows) - 5)
        rows = grid_rows(rows)
        head = dict(ratingCoefficient=.9, gridCoefficient=1.5)
        opposite = rows.copy()
        opposite[:, 4] *= -1
        opposite[:, 8:10] = rows[:, [9, 8]]
        opposite[:, 11:13] = rows[:, [12, 11]]
        np.testing.assert_allclose(grid_probability(rows, head) + grid_probability(opposite, head), 1, atol=1e-12)


if __name__ == '__main__':
    unittest.main()
