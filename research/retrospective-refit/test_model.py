"""Tests of the retrospective joint-mode prototype."""
import copy
import unittest

import numpy as np

from retrospective_refit import fit_history, UnifiedModel


def weekend(day, target):
    return {'date': day, 'entries': [{'driver': 'a', 'car': 'x'}, {'driver': 'b', 'car': 'x'}],
            'observations': [{'a': 'a', 'b': 'b', 'ca': 'x', 'cb': 'x',
                              'channel': 2, 'target': target, 'weight': 1}]}


class RefitTest(unittest.TestCase):
    def test_single_weekend_matches_filter_mode(self):
        first = weekend('2020-01-01', 1)
        model = UnifiedModel()
        model.begin(first)
        model.update(first['observations'])
        result = fit_history([first])['history'][0]
        for kind in ('driver', 'car'):
            for identity, value in result[kind].items():
                start = model.indices[(kind, identity)]
                np.testing.assert_allclose(value, model.mean[start:start + 3] * (75 / np.log(10)), atol=0.002)

    def test_later_evidence_revises_history_and_changes_latest_mode(self):
        first = weekend('2020-01-01', 1)
        second = weekend('2020-02-01', 1)
        single = fit_history([first])['history'][0]['driver']['a'][2]
        joint = fit_history([first, second])['history'][0]['driver']['a'][2]
        self.assertGreater(joint, single)
        opposite = fit_history([first, weekend('2020-02-01', 0)])['history'][0]['driver']['a'][2]
        self.assertLess(opposite, single)

    def test_single_weekend_covariance_matches_filter(self):
        first = weekend('2020-01-01', 1)
        model = UnifiedModel()
        model.begin(first)
        model.update(first['observations'])
        block = fit_history([first], covariance_weekends=[0])['covariance'][0]
        indices = [model.indices[tuple(key)] + channel for key in block['keys'] for channel in range(3)]
        np.testing.assert_allclose(block['matrix'], model.covariance[np.ix_(indices, indices)], atol=1e-10)
        np.testing.assert_allclose(block['standardDeviation']['driver']['a'],
                                   np.sqrt(np.diag(model.covariance)[:3]) * (75 / np.log(10)), atol=1e-9)

    def test_covariance_is_joint_and_reflects_later_evidence(self):
        first = weekend('2020-01-01', 1)
        second = weekend('2020-02-01', 1)
        prior = fit_history([first], covariance_weekends=[0])['covariance'][0]
        progress = []
        smoothed = fit_history([first, second], covariance_weekends=[0, 1],
                               progress=lambda completed, total: progress.append((completed, total)))['covariance']
        self.assertEqual(progress, [(1, 2), (2, 2)])
        initial = np.array(prior['matrix'])
        updated = np.array(smoothed[0]['matrix'])
        self.assertGreater(np.linalg.eigvalsh(updated).min(), 0)
        self.assertGreater(np.max(np.abs(updated - np.diag(np.diag(updated)))), 0)
        self.assertLess(updated[2, 2], initial[2, 2])
        self.assertEqual(np.array(smoothed[1]['matrix']).shape, updated.shape)

    def test_cross_weekend_covariance(self):
        weekends = [weekend('2020-01-01', 1), weekend('2020-02-01', 0)]
        result = fit_history(weekends, covariance_weekends=[0, 1], covariance_pairs=[(0, 1)])
        first = np.asarray(result['covariance'][0]['matrix'])
        second = np.asarray(result['covariance'][1]['matrix'])
        cross = np.asarray(result['crossCovariance']['0:1']['matrix'])
        joint = np.block([[first, cross], [cross.T, second]])
        self.assertGreater(np.linalg.eigvalsh(joint).min(), 0)
        self.assertGreater(cross[2, 2], 0)
        with self.assertRaises(ValueError):
            fit_history(weekends, covariance_pairs=[(1, 0)])

    def test_cross_covariance_supports_changing_fields(self):
        first = weekend('2020-01-01', 1)
        second = weekend('2020-02-01', 0)
        second['entries'].append({'driver': 'c', 'car': 'y'})
        result = fit_history([first, second], covariance_pairs=[(0, 1)])
        cross = result['crossCovariance']['0:1']
        self.assertNotIn(['driver', 'c'], cross['firstKeys'])
        self.assertIn(['driver', 'c'], cross['secondKeys'])
        self.assertEqual(np.asarray(cross['matrix']).shape,
                         (3 * len(cross['firstKeys']), 3 * len(cross['secondKeys'])))

    def test_two_weekend_covariance_matches_dense_hessian(self):
        weekends = [weekend('2020-01-01', 1), weekend('2020-02-01', 0)]
        parameters = {'driver_correlation': 0, 'car_correlation': 0}
        result = fit_history(weekends, parameters, covariance_weekends=[0, 1], covariance_pairs=[(0, 1)])
        points = 75 / np.log(10)
        initial = (20 / points) ** 2
        increment = (4 / points) ** 2 * 31 / 365.25
        prior = np.array([[initial, 0, initial, 0], [0, initial, 0, initial],
                          [initial, 0, initial + increment, 0], [0, initial, 0, initial + increment]])
        design = np.array([[1, -1, 0, 0], [0, 0, 1, -1]])
        gaps = np.array([(snap['driver']['a'][2] - snap['driver']['b'][2]) / points for snap in result['history']])
        probability = 1 / (1 + np.exp(-gaps))
        expected = np.linalg.inv(np.linalg.inv(prior) + design.T @ np.diag(probability * (1 - probability)) @ design)
        blocks = [np.asarray(result['covariance'][i]['matrix']) for i in (0, 1)]
        cross = np.asarray(result['crossCovariance']['0:1']['matrix'])
        keys = [result['covariance'][i]['keys'] for i in (0, 1)]
        positions = [[3 * key.index(['driver', identity]) + 2 for identity in ('a', 'b')] for key in keys]
        actual = np.block([[blocks[0][np.ix_(positions[0], positions[0])], cross[np.ix_(positions[0], positions[1])]],
                           [cross[np.ix_(positions[0], positions[1])].T, blocks[1][np.ix_(positions[1], positions[1])]]])
        np.testing.assert_allclose(actual, expected, atol=1e-10)

    def test_initial_prior_sensitivity_option(self):
        first = weekend('2020-01-01', 1)
        first['observations'] = []
        result = fit_history([first], initial_sd={'driver': 10, 'car': 25}, covariance_weekends=[0])
        np.testing.assert_allclose(result['covariance'][0]['standardDeviation']['driver']['a'], [10, 10, 10])
        np.testing.assert_allclose(result['covariance'][0]['standardDeviation']['car']['x'], [25, 25, 25])

    def test_alternative_sparse_solver_agrees(self):
        weekends = [weekend('2020-01-01', 1), weekend('2020-02-01', 0)]
        baseline = fit_history(weekends, covariance_weekends=[0])
        alternative = fit_history(weekends, covariance_weekends=[0], rhs_batch_size=2, permutation='MMD_AT_PLUS_A')
        np.testing.assert_allclose(baseline['covariance'][0]['matrix'], alternative['covariance'][0]['matrix'], atol=1e-10)
        np.testing.assert_allclose(baseline['history'][0]['driver']['a'], alternative['history'][0]['driver']['a'], atol=1e-7)

    def test_validation(self):
        with self.assertRaises(ValueError):
            fit_history([])
        with self.assertRaises(ValueError):
            fit_history([weekend('2020-01-01', 1)], rhs_batch_size=0)
        with self.assertRaises(ValueError):
            fit_history([weekend('2020-01-01', 1)], permutation='invalid')
        with self.assertRaises(ValueError):
            fit_history([weekend('2020-01-01', 1)], initial_sd={'driver': -1, 'car': 50})
        with self.assertRaises(ValueError):
            fit_history([weekend('2020-01-01', 1)], initial_sd={'driver': 20})
        with self.assertRaises(ValueError):
            fit_history([weekend('2020-01-01', 1)], covariance_weekends=[1])
        with self.assertRaises(ValueError):
            fit_history([weekend('2020-01-01', 1)], covariance_weekends=[0, 0])
        first = weekend('2020-01-01', 1)
        invalid = copy.deepcopy(first)
        invalid['observations'][0]['weight'] = -1
        with self.assertRaises(ValueError):
            fit_history([invalid])
        with self.assertRaises(ValueError):
            fit_history([weekend('2020-02-01', 1), first])
        duplicate = copy.deepcopy(first)
        duplicate['observations'] *= 2
        with self.assertRaises(ValueError):
            fit_history([duplicate])


if __name__ == '__main__':
    unittest.main()
