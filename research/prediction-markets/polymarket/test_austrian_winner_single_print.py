import json
import unittest
from decimal import Decimal
from pathlib import Path

from austrian_winner_single_print import CASES, paired_payoff, scenario

ROOT = Path('research/prediction-markets/polymarket')


class WinnerSinglePrintTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive = json.loads((ROOT / 'austrian-2026-june-25-winner-events.json').read_text())
        cls.chain = json.loads((ROOT / 'onchain/winner/winner-onchain-events.json').read_text())
        cls.baseline = json.loads((ROOT.parent / 'forecast/austrian-2026-baseline.json').read_text())
        cls.resolution = json.loads((ROOT / 'austrian-2026-official-outcomes.json').read_text())

    def test_documented_hypothetical_fills(self):
        norris, hamilton = [scenario(case, self.archive, self.chain, self.baseline, self.resolution) for case in CASES]
        self.assertEqual(Decimal(norris['displayedAheadAtActivation']), Decimal('2605.48'))
        self.assertEqual(Decimal(norris['onchainSharesAtQuote']), Decimal('42.50526'))
        self.assertEqual(Decimal(norris['allAheadShares']), 0)
        self.assertEqual(Decimal(norris['zeroAheadPnlAtReportedSettlement']), Decimal('-0.25'))
        self.assertEqual(Decimal(hamilton['displayedAheadAtActivation']), Decimal('596.72'))
        self.assertEqual(Decimal(hamilton['onchainSharesAtQuote']), Decimal('226.77'))
        self.assertEqual(Decimal(hamilton['printReportedShares']), Decimal('266.77'))
        self.assertEqual(Decimal(hamilton['allAheadShares']), 0)
        self.assertEqual(Decimal(hamilton['zeroAheadPnlAtReportedSettlement']), Decimal('1.15'))

    def test_paired_positions_and_unsupported_void(self):
        self.assertEqual(paired_payoff(1, 0), Decimal('5.90'))
        self.assertEqual(paired_payoff(0, 1), Decimal('-4.10'))
        self.assertEqual(paired_payoff(0, 0), Decimal('0.90'))
        for payouts in ((1, 1), (0.5, 0), (0, None)):
            with self.assertRaises(ValueError):
                paired_payoff(*payouts)

    def test_missing_or_wrong_print_rejected(self):
        corrupted = {'rows': [r for r in self.archive['rows'] if r.get('transactionHash') != CASES[0]['transaction']]}
        with self.assertRaisesRegex(ValueError, 'one later observed print'):
            scenario(CASES[0], corrupted, self.chain, self.baseline, self.resolution)

    def test_matching_time_must_follow_activation(self):
        selected = CASES[0]['transaction']
        altered = {'rows': [{**r, 'source': 1782396307967} if r.get('transactionHash') == selected else r
                            for r in self.archive['rows']]}
        with self.assertRaisesRegex(ValueError, 'one later observed print'):
            scenario(CASES[0], altered, self.chain, self.baseline, self.resolution)

    def test_limit_is_chosen_at_submission_not_activation(self):
        snapshot = next(r for r in self.archive['rows'] if r['condition'] == CASES[1]['condition']
                        and r['asset'] == CASES[1]['yes'] and r['type'] == 'book')
        improved_ask = {'condition': CASES[1]['condition'], 'asset': CASES[1]['yes'], 'type': 'price_change',
                        'received': snapshot['received'] + 500, 'source': snapshot['source'] + 500,
                        'side': 'SELL', 'price': '0.22', 'size': '1', 'transactionHash': None}
        altered = {'rows': sorted([*self.archive['rows'], improved_ask], key=lambda r: r['received'])}
        result = scenario(CASES[1], altered, self.chain, self.baseline, self.resolution)
        self.assertEqual(Decimal(result['quotePrice']), Decimal('0.23'))

    def test_unresolved_exchange_metadata_rejected(self):
        unresolved = {**self.resolution, 'markets': [{**market, 'umaResolutionStatus': 'pending'} for market in self.resolution['markets']]}
        with self.assertRaisesRegex(ValueError, 'closed, resolved'):
            scenario(CASES[0], self.archive, self.chain, self.baseline, unresolved)


if __name__ == '__main__':
    unittest.main()
