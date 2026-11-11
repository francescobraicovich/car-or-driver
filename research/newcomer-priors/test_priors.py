import copy
from datetime import date, timedelta
import itertools
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'packages/core/python'))
from unified_model import POINTS, TIME_UNIT, correlation
from newcomer_model import NewcomerModel as UnifiedModel


PARAMETERS = {'newcomer_offsets': {'driver': [-20, -15, -18], 'car': [-40, -30, -25]}}
INITIAL = {'date': '2020-01-01', 'entries': [{'driver': 'a', 'car': 'x'}, {'driver': 'b', 'car': 'y'}]}
ARRIVAL = {'date': '2020-01-15', 'entries': [*INITIAL['entries'], {'driver': 'c', 'car': 'z'}, {'driver': 'd', 'car': 'w'}]}


def prepared():
    model = UnifiedModel(PARAMETERS)
    model.begin(INITIAL)
    model.update([{'a': 'a', 'b': 'b', 'ca': 'x', 'cb': 'y', 'channel': 0, 'target': .003, 'weight': 1}])
    return model


class PriorTests(unittest.TestCase):
    def test_bootstrap_and_legacy(self):
        for parameters in (None, PARAMETERS):
            model = UnifiedModel(parameters)
            model.begin(INITIAL)
            np.testing.assert_array_equal(model.mean, np.zeros(12))
        legacy = prepared()
        legacy.parameters.pop('newcomer_offsets')
        legacy.begin(ARRIVAL)
        for key in [('driver', 'c'), ('car', 'z')]:
            start = legacy.indices[key]
            np.testing.assert_array_equal(legacy.mean[start:start + 3], np.zeros(3))

    def test_conditional_mean_and_covariance(self):
        model = prepared()
        established = copy.deepcopy(model)
        established.begin({**ARRIVAL, 'entries': INITIAL['entries']})
        model.begin(ARRIVAL)
        np.testing.assert_array_equal(model.mean[:12], established.mean)
        np.testing.assert_allclose(model.covariance[:12, :12], established.covariance)
        for kind, originals, new_ids, sd in [('driver', ['a', 'b'], ['c', 'd'], 20), ('car', ['x', 'y'], ['z', 'w'], 50)]:
            positions = np.array([model.indices[(kind, identity)] for identity in originals])[:, None] + np.arange(3)
            cross = established.covariance[positions].mean(axis=0)
            reference_variance = cross[:, positions].mean(axis=1)
            first, second = [model.indices[(kind, identity)] for identity in new_ids]
            np.testing.assert_allclose(model.mean[first:first + 3], established.mean[positions].mean(axis=0) + np.array(PARAMETERS['newcomer_offsets'][kind]) / POINTS)
            np.testing.assert_allclose(model.covariance[first:first + 3, :12], cross)
            np.testing.assert_allclose(model.covariance[first:first + 3, first:first + 3], reference_variance + (sd / POINTS) ** 2 * correlation(.5))
            np.testing.assert_allclose(model.covariance[first:first + 3, second:second + 3], reference_variance)
        np.linalg.cholesky(model.covariance)

    def test_translation_and_entry_order(self):
        original, shifted, reversed_entries = prepared(), prepared(), prepared()
        shifts = {'driver': np.array([.3, -.2, .4]), 'car': np.array([-.5, .4, .8])}
        for (kind, _), start in shifted.indices.items():
            shifted.mean[start:start + 3] += shifts[kind]
        original.begin(ARRIVAL)
        shifted.begin(ARRIVAL)
        reversed_entries.begin({**ARRIVAL, 'entries': ARRIVAL['entries'][::-1]})
        order = []
        for key, start in original.indices.items():
            np.testing.assert_allclose(shifted.mean[start:start + 3] - original.mean[start:start + 3], shifts[key[0]], atol=1e-12)
            other = reversed_entries.indices[key]
            order.extend(range(other, other + 3))
        np.testing.assert_allclose(original.mean, reversed_entries.mean[order], atol=1e-12)
        np.testing.assert_allclose(original.covariance, reversed_entries.covariance[np.ix_(order, order)], atol=1e-12)
        rows = [{'a': 'c', 'b': 'a', 'ca': 'z', 'cb': 'x', 'channel': channel} for channel in range(3)]
        np.testing.assert_allclose([row['mean'] for row in original.predict(rows)], [row['mean'] for row in shifted.predict(rows)], atol=1e-12)

    def test_return_and_transfer_keep_strength(self):
        model = prepared()
        before = model.mean.copy()
        model.begin({'date': '2020-01-15', 'entries': [{'driver': 'a', 'car': 'y'}]})
        model.begin({'date': '2020-02-01', 'entries': [{'driver': 'a', 'car': 'new'}, {'driver': 'b', 'car': 'x'}]})
        np.testing.assert_array_equal(model.mean[:12], before)

    def test_invalid_offsets(self):
        for offsets in ({}, {'driver': [0, 0, 0]}, {'driver': [0, 0], 'car': [0, 0, 0]},
                        {'driver': [0, float('nan'), 0], 'car': [0, 0, 0]}, {'driver': [0, 0, 0], 'car': [0, float('inf'), 0]}):
            with self.assertRaises(ValueError):
                UnifiedModel({'newcomer_offsets': offsets})

    def test_deviations_and_prefix_invariance(self):
        model = UnifiedModel(PARAMETERS)
        model.begin(INITIAL)
        self.assertAlmostEqual(model.covariance[0, 0], (20 / POINTS) ** 2)
        model.begin(ARRIVAL)
        a, b, c = [model.indices[('driver', identity)] for identity in ('a', 'b', 'c')]
        contrast = np.zeros(len(model.mean))
        contrast[c], contrast[a], contrast[b] = 1, -.5, -.5
        self.assertAlmostEqual(contrast @ model.covariance @ contrast, (20 / POINTS) ** 2)
        weeks = [{**week, 'raceId': str(i), 'observations': []} for i, week in enumerate((INITIAL, ARRIVAL))]
        def history(weekends):
            fitted = UnifiedModel(PARAMETERS)
            snapshots = []
            for weekend in weekends:
                fitted.begin(weekend)
                fitted.update(weekend['observations'])
                snapshots.append(fitted.snapshot(weekend['entries']))
            return snapshots
        self.assertEqual(history(weeks[:1]), history(weeks)[:1])

    def test_constant_ability_turnover(self):
        # Only the identity of the weak slot changes. The correct entry gap is
        # known here, so turnover should not raise established abilities.
        truth = np.array([.8, .2, -.2, -.8])
        relative_gap = (truth[-1] - truth[:3].mean()) * POINTS
        parameters = {'newcomer_offsets': {'driver': [relative_gap] * 3, 'car': [0] * 3}}
        means = []
        for settings in ({}, parameters):
            model = UnifiedModel(settings)
            for index in range(160):
                identities = ['a', 'b', 'c', f'd{index // 8}']
                entries = [{'driver': identity, 'car': 'shared'} for identity in identities]
                rows = [{'a': identities[a], 'b': identities[b], 'ca': 'shared', 'cb': 'shared', 'channel': channel,
                         'target': (truth[a] - truth[b]) * TIME_UNIT, 'weight': 1}
                        for a, b in itertools.combinations(range(4), 2) for channel in (0, 1)]
                model.begin({'date': (date(2000, 1, 1) + timedelta(days=14 * index)).isoformat(), 'entries': entries})
                model.update(rows)
            means.append(np.mean([model.mean[model.indices[('driver', identity)]] for identity in identities]) * POINTS)
        self.assertGreater(means[0], 20)
        self.assertLess(abs(means[1]), 1)


if __name__ == '__main__':
    unittest.main()
