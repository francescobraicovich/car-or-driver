import unittest
from summarize_winner_markets import summarize_markets


class WinnerSummaryTest(unittest.TestCase):
    def test_counts_yes_no_and_excludes_exchange_summary(self):
        markets = {'example': [{'marketSlug': 'event-driver', 'outcomes': [
            {'name': 'Yes', 'tokenId': 'yes'}, {'name': 'No', 'tokenId': 'no'}]}]}
        events = [
            {'race': 'example', 'tokenId': 'yes', 'side': 0, 'makerAmountFilled': '500000',
             'takerAmountFilled': '1000000', 'transactionHash': 'tx', 'takerIsExchange': False},
            {'race': 'example', 'tokenId': 'no', 'side': 1, 'makerAmountFilled': '2000000',
             'takerAmountFilled': '800000', 'transactionHash': 'tx', 'takerIsExchange': False},
            {'race': 'example', 'tokenId': 'yes', 'side': 0, 'makerAmountFilled': '1',
             'takerAmountFilled': '1', 'transactionHash': 'tx', 'takerIsExchange': True},
        ]
        output = summarize_markets(events, markets)
        self.assertEqual(output['races']['example']['collateralMicroUnits'], 1300000)
        self.assertEqual(output['markets'][0]['makerEvents'], 2)
        self.assertEqual(output['markets'][0]['transactions'], 1)
        self.assertEqual(output['markets'][0]['yesEvents'], 1)
        self.assertEqual(output['markets'][0]['noEvents'], 1)

    def test_rejects_unknown_and_mismatched_tokens(self):
        with self.assertRaisesRegex(ValueError, 'Unknown or mismatched'):
            summarize_markets([{'race': 'example', 'tokenId': 'unknown', 'takerIsExchange': False}], {'example': []})
        with self.assertRaisesRegex(ValueError, 'Invalid winner outcome'):
            summarize_markets([], {'example': [{'marketSlug': 'event-driver', 'outcomes': [{'name': 'Maybe', 'tokenId': 'x'}]}]})


if __name__ == '__main__':
    unittest.main()
