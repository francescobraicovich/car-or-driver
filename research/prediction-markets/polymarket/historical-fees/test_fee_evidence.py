from decimal import Decimal
import json
from pathlib import Path
import unittest


class HistoricalFeeEvidenceTest(unittest.TestCase):
    def test_samples_agree_with_published_category_coefficients(self):
        directory = Path(__file__).resolve().parent
        for race, coefficient, count in [('austrian', '0.03', 3), ('hungarian', '0.05', 2)]:
            events = json.loads((directory / f'{race}-winner-fee-events.json').read_text())
            self.assertEqual(len(events), count)
            for event in events:
                if event['side'] == 0:
                    shares = Decimal(event['takerAmountFilled']) / 1_000_000
                    collateral = Decimal(event['makerAmountFilled']) / 1_000_000
                elif event['side'] == 1:
                    shares = Decimal(event['makerAmountFilled']) / 1_000_000
                    collateral = Decimal(event['takerAmountFilled']) / 1_000_000
                else:
                    self.fail('Unrecognized side')
                price = collateral / shares
                theoretical = shares * Decimal(coefficient) * price * (1 - price)
                observed = Decimal(event['fee']) / 1_000_000
                self.assertLess(abs(theoretical - observed), Decimal('0.00001'))


if __name__ == '__main__':
    unittest.main()
