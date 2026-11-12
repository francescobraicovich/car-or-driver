"""Check that simulated pair results share race-level performance."""
import unittest

import numpy as np

from validate_race_dependence import simulate
from validate_simulation import empty, measure


class RaceDependenceTest(unittest.TestCase):
    def test_shared_performance_and_reproducibility(self):
        entries = [{'driver': value, 'car': str(index // 2)} for index, value in enumerate(('a', 'b', 'c'))]
        pairs = [('a', 'b', '0', '0'), ('b', 'c', '0', '1'), ('a', 'c', '0', '1')]
        observations = [{'a': a, 'b': b, 'ca': ca, 'cb': cb, 'channel': 0, 'target': 0, 'weight': 1}
                        for a, b, ca, cb in pairs]
        evidence = [{'date': '2012-01-01', 'entries': entries, 'observations': observations}]
        first, _ = simulate(3, .3, evidence)
        repeat, _ = simulate(3, .3, evidence)
        other, _ = simulate(4, .3, evidence)
        self.assertEqual(first, repeat)
        self.assertNotEqual(first, other)
        values = [row['target'] for row in first[0]['observations']]
        self.assertAlmostEqual(values[0] + values[1], values[2])

    def test_same_car_cancels_in_package_gap_variance(self):
        positions = {('driver', 'a'): 0, ('driver', 'b'): 3, ('car', 'x'): 6}
        first = {'terms': [('driver', 'a', 1), ('car', 'x', 1)], 'truth': np.zeros(3)}
        second = {'terms': [('driver', 'b', 1), ('car', 'x', 1)], 'truth': np.zeros(3)}
        samples = empty()
        measure(np.zeros(9), np.eye(9), positions, {'package': [(first, second)]}, samples)
        for channel in range(3):
            self.assertEqual(samples['package'][channel], [[0, 2]])


if __name__ == '__main__':
    unittest.main()
