import importlib.util
import math
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('compare_polymarket_prices', Path(__file__).with_name('compare_polymarket_prices.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PriceComparisonTests(unittest.TestCase):
    def test_cutoff_and_sample_age(self):
        samples = [{'t': 999, 'p': 0.2}, {'t': 1001, 'p': 0.9}]
        self.assertEqual(module.select_sample(samples, 1000)['price'], 0.2)
        with self.assertRaisesRegex(ValueError, 'older'):
            module.select_sample([{'t': 800, 'p': 0.2}], 1000)
        with self.assertRaisesRegex(ValueError, 'no sample'):
            module.select_sample([{'t': 1001, 'p': 0.2}], 1000)
        for boundary in (0, 1):
            with self.assertRaisesRegex(ValueError, 'boundary'):
                module.select_sample([{'t': 999, 'p': boundary}], 1000)

    def test_constant_half_is_sensitivity_not_excluded(self):
        result = module.select_sample([{'t': 999, 'p': 0.5}], 1000)
        self.assertTrue(result['constantHalfSeries'])
        self.assertEqual(result['price'], 0.5)

    def test_binary_losses(self):
        result = module.losses(0.2, 1)
        self.assertAlmostEqual(result['brier'], 0.64)
        self.assertAlmostEqual(result['logLoss'], -math.log(0.2))
        with self.assertRaises(ValueError):
            module.losses(0, 1)

    def test_binary_summary_uses_same_rows(self):
        rows = [{'outcome': 1, 'modelProbability': 0.8, 'sampledPrice': 0.5},
                {'outcome': 0, 'modelProbability': 0.2, 'sampledPrice': 0.5}]
        summary = module.summarize(rows)
        self.assertEqual(summary['contracts'], 2)
        self.assertEqual(summary['positiveOutcomes'], 1)
        self.assertAlmostEqual(summary['modelBrier'], 0.04)
        self.assertAlmostEqual(summary['sampledPriceBrier'], 0.25)
        self.assertIsNone(module.summarize([]))

    def test_saved_comparison_recomputes_offline(self):
        import json
        report = json.loads(Path(__file__).with_name('polymarket-binary-comparison-2026.json').read_text())
        baseline = json.loads(module.BASELINE.read_text())
        identifiers = json.loads(module.IDENTIFIERS.read_text())
        rows = []
        for key, race in zip(module.RACES, report['races']):
            self.assertLess(race['cutoff'], race['firstPractice'])
            checked = module.prepare_race(key, baseline, identifiers, race['gammaSource']['response'])
            self.assertEqual(len(checked['contracts']), 22)
            self.assertEqual(len(checked['excludedNonRosterMarkets']), 6)
            for row in race['contracts']:
                sample = module.select_sample(row['priceSource']['response']['history'], race['cutoff'])
                self.assertEqual(sample['price'], row['sampledPrice'])
                self.assertEqual(sample['timestamp'], row['sampleTimestamp'])
                rows.append(row)
        self.assertEqual(len(rows), 88)
        self.assertEqual(sum(row['outcome'] for row in rows), 4)
        recomputed = module.summarize(rows)
        for key in ('modelBrier', 'sampledPriceBrier', 'modelLogLoss', 'sampledPriceLogLoss'):
            self.assertAlmostEqual(recomputed[key], report['overall'][key])

    def test_match_identity_and_explicit_placeholder(self):
        baseline = {'results': [{'raceId': '1176', 'race': 'Austria', 'winnerId': 'a',
                                'decisionTime': '2026-06-25T14:00:00Z', 'firstPractice': '2026-06-26T11:30:00Z',
                                'roster': [{'name': 'Alice Brown', 'driverId': 'a', 'probability': 0.6},
                                           {'name': 'Bob White', 'driverId': 'b', 'probability': 0.4}]}]}
        identifiers = {'austrian': [{'conditionId': 'condition-a', 'outcomes': [{'name': 'Yes', 'tokenId': 'token-a'}]},
                                    {'conditionId': 'condition-b', 'outcomes': [{'name': 'Yes', 'tokenId': 'token-b'}]}]}
        def market(name, condition, token, prices):
            import json
            return {'groupItemTitle': name, 'conditionId': condition, 'outcomes': json.dumps(['Yes', 'No']),
                    'clobTokenIds': json.dumps([token, 'no']), 'outcomePrices': json.dumps(prices),
                    'createdAt': '2026-06-01T00:00:00Z', 'startDate': '2026-06-01T00:00:00Z',
                    'closed': True, 'umaResolutionStatus': 'resolved', 'slug': condition}
        gamma = [{'negRisk': True, 'markets': [market('Alice Brown', 'condition-a', 'token-a', ['1', '0']),
                                              market('Bob White', 'condition-b', 'token-b', ['0', '1']),
                                              {'groupItemTitle': 'Other'}]}]
        result = module.prepare_race('austrian', baseline, identifiers, gamma)
        self.assertEqual(len(result['contracts']), 2)
        self.assertEqual(result['excludedNonRosterMarkets'][0]['title'], 'Other')
        gamma[0]['markets'][0]['clobTokenIds'] = '["incorrect", "no"]'
        with self.assertRaisesRegex(ValueError, 'identifiers differ'):
            module.prepare_race('austrian', baseline, identifiers, gamma)


if __name__ == '__main__':
    unittest.main()
