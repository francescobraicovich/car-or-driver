import unittest
from summarize_onchain import summarize


class SummaryTest(unittest.TestCase):
    def test_both_sides_exclude_exchange_summaries_and_count_transactions(self):
        rows = [
            {'race': 'example', 'side': 0, 'makerAmountFilled': '500000', 'takerAmountFilled': '1000000',
             'transactionHash': 'same', 'takerIsExchange': False},
            {'race': 'example', 'side': 1, 'makerAmountFilled': '2000000', 'takerAmountFilled': '800000',
             'transactionHash': 'same', 'takerIsExchange': False},
            {'race': 'example', 'side': 0, 'makerAmountFilled': '1000000', 'takerAmountFilled': '1000000',
             'transactionHash': 'same', 'takerIsExchange': True},
        ]
        self.assertEqual(summarize(rows), {'example': {'makerEvents': 2, 'transactions': 1, 'collateralMicroUnits': 1300000}})

    def test_rejects_invalid_side_and_negative_amount(self):
        row = {'race': 'example', 'side': 2, 'makerAmountFilled': '5', 'takerAmountFilled': '10',
               'transactionHash': 'a', 'takerIsExchange': False}
        with self.assertRaisesRegex(ValueError, 'Unknown maker side'):
            summarize([row])
        row['side'] = 0
        row['makerAmountFilled'] = '-5'
        with self.assertRaisesRegex(ValueError, 'Invalid collateral amount'):
            summarize([row])


if __name__ == '__main__':
    unittest.main()
