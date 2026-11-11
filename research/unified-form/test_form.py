import copy
from datetime import date, timedelta
import unittest

import numpy as np

from fit import FORM_DEFAULTS
from model import FormModel, UnifiedModel


def weekend(index=0, same=True):
    return dict(date=(date(2020, 1, 1) + timedelta(days=28 * index)).isoformat(),
                entries=[dict(driver='a', car='x'), dict(driver='b', car='x' if same else 'y')])


def observations(same=True):
    return [dict(a='a', b='b', ca='x', cb='x' if same else 'y', channel=channel,
                 target=.006 if channel < 2 else 1, weight=1.) for channel in range(3)]


class FormTests(unittest.TestCase):
    def test_zero_offset_parity_and_validation(self):
        first, second = UnifiedModel(), UnifiedModel()
        for model in (first, second):
            model.begin(weekend())
        first.update(observations())
        second.update(observations(), np.zeros(3))
        np.testing.assert_array_equal(first.mean, second.mean)
        np.testing.assert_array_equal(first.covariance, second.covariance)
        with self.assertRaises(ValueError):
            first.update(observations(), [0, 1])
        with self.assertRaises(ValueError):
            first.update(observations(), [0, 1, np.nan])

    def test_embedded_reversal_and_shared_car(self):
        models = [FormModel({}, FORM_DEFAULTS, True) for _ in range(2)]
        rows = observations()
        reverse = [{**row, 'a': row['b'], 'b': row['a'], 'target': -row['target'] if row['channel'] < 2 else 1 - row['target']} for row in rows]
        for model, values in zip(models, (rows, reverse)):
            model.begin(weekend())
            start = model.indices[('car', 'x')]
            self.assertTrue(np.all(model.design(values)[:, start:start + 6] == 0))
            model.update(values)
            np.testing.assert_array_equal(model.mean[start:start + 6], 0)
            np.linalg.cholesky(model.covariance)
        np.testing.assert_allclose(models[0].mean, models[1].mean, atol=1e-12)

    def test_decay_and_transfer(self):
        model = FormModel({}, FORM_DEFAULTS, True)
        model.begin(weekend())
        model.update(observations())
        before = model.mean[:6].copy()
        moved = weekend(1)
        moved['entries'][0]['car'] = 'new'
        model.begin(moved)
        np.testing.assert_array_equal(model.mean[:3], before[:3])
        np.testing.assert_allclose(model.mean[3:6], before[3:] / 2, atol=1e-12)

    def test_covariance_of_sum_and_prefix(self):
        model = FormModel({}, FORM_DEFAULTS, True)
        model.begin(weekend())
        model.update(observations())
        saved = copy.deepcopy(model)
        a = model.design(observations())
        prediction = model.predict(observations())
        np.testing.assert_allclose([row['variance'] for row in prediction], np.diag(a @ model.covariance @ a.T))
        model.begin(weekend(1))
        model.update([{**row, 'target': -.03 if row['channel'] < 2 else 0} for row in observations()])
        self.assertEqual(saved.predict(observations()), prediction)
        self.assertGreater(np.max(np.abs(saved.covariance[:3, 3:6])), 0)

    def test_offset_means_residual(self):
        model = FormModel({}, FORM_DEFAULTS, False)
        model.begin(weekend())
        model.update(observations()[:2], [2, 2])
        np.testing.assert_allclose(model.mean, 0, atol=1e-12)
        with self.assertRaises(ValueError):
            FormModel({}, {**FORM_DEFAULTS, 'half_life_days': 0}, True)


if __name__ == '__main__':
    unittest.main()
