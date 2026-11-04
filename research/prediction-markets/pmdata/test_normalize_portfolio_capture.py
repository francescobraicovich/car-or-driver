import unittest
import subprocess
import sys
from pathlib import Path

import pandas as pd

from normalize_portfolio_capture import inactive_market, normalize_fills, normalize_market


MARKET = {'slug': 'race-winner-norris-2026', 'conditionId': 'condition',
          'outcomes': ['Yes', 'No'], 'clobTokenIds': ['yes-token', 'no-token']}
TX = '0x' + 'a' * 64


def row(kind, **extra):
    return {'market_slug': MARKET['slug'], 'timestamp': pd.Timestamp('2026-06-25T14:00:00Z'),
            'local_timestamp': pd.Timestamp('2026-06-25T14:00:00.001Z'), 'event_type': kind, **extra}


class NormalizePortfolioCaptureTest(unittest.TestCase):
    def test_cli_rejects_duplicate_drivers_and_missing_selected_files(self):
        script = Path(__file__).with_name('normalize_portfolio_capture.py')
        common = [sys.executable, str(script), '--official', '/tmp/unused', '--start', '2026-06-25T14:00:00Z',
                  '--end', '2026-06-25T16:00:00Z', '--output', '/tmp/not-created-a',
                  '--output-fills', '/tmp/not-created-b']
        duplicate = subprocess.run([*common, '--drivers', 'norris', 'norris'], capture_output=True, text=True)
        self.assertNotEqual(duplicate.returncode, 0)
        self.assertIn('Drivers must be distinct', duplicate.stderr)
        missing = subprocess.run([*common, '--drivers', 'piastri'], capture_output=True, text=True)
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn('--piastri-l2 is required', missing.stderr)

    def test_book_and_no_trade_keep_source_timestamps(self):
        book = row('book', bid_prices=[0.2], bid_sizes=[3.0], ask_prices=[0.4], ask_sizes=[4.0])
        trade = row('last_trade_price', outcome='no', side='BUY', price=0.6, size=2.0, trade_id=TX)
        t = pd.Timestamp('2026-06-25T14:00:00Z').value // 1000
        events = normalize_market(pd.DataFrame([book]), pd.DataFrame([trade]), MARKET, t, t + 2000)
        self.assertEqual([x['type'] for x in events], ['book', 'last_trade_price'])
        self.assertEqual(events[0]['bids'], '[[0.2,3.0]]')
        self.assertEqual(events[1]['asset'], 'no-token')
        self.assertEqual(events[1]['transactionHash'], TX)
        self.assertEqual(events[1]['receivedUs'] - t, 1000)

    def test_inactive_market_discards_prices_and_trades_without_inventing_depth(self):
        l2 = pd.DataFrame([row('price_change', pc_price=.2, pc_size=100., pc_side='BUY')])
        trades = pd.DataFrame([row('last_trade_price', outcome='yes', side='BUY', price=.2, size=5., trade_id=TX)])
        t = pd.Timestamp('2026-06-25T14:00:00Z').value // 1000
        marker, note = inactive_market(MARKET, t, t + 2000, l2, trades, 'No initial book')
        self.assertTrue(marker['syntheticInactive'])
        self.assertEqual((marker['bids'], marker['asks']), ('[]', '[]'))
        self.assertEqual((note['discardedL2Rows'], note['discardedTradeRows']), (1, 1))

    def test_rejects_ambiguous_identity_and_dynamic_tick(self):
        book = row('book', bid_prices=[0.2], bid_sizes=[3.0], ask_prices=[0.4], ask_sizes=[4.0])
        trade = row('last_trade_price', outcome='yes', side='BUY', price=0.3, size=2.0, trade_id=TX)
        t = pd.Timestamp('2026-06-25T14:00:00Z').value // 1000
        with self.assertRaisesRegex(ValueError, 'Duplicate market transaction'):
            normalize_market(pd.DataFrame([book]), pd.DataFrame([trade, trade]), MARKET, t, t + 2000)
        with self.assertRaisesRegex(ValueError, 'Dynamic tick'):
            normalize_market(pd.DataFrame([book, row('tick_size_change')]), pd.DataFrame([trade]), MARKET, t, t + 2000)
        with self.assertRaisesRegex(ValueError, 'identifiable transaction'):
            normalize_market(pd.DataFrame([book]), pd.DataFrame([{**trade, 'trade_id': None}]), MARKET, t, t + 2000)
        with self.assertRaisesRegex(ValueError, 'Invalid trade price or size'):
            normalize_market(pd.DataFrame([book]), pd.DataFrame([{**trade, 'size': -1}]), MARKET, t, t + 2000)
        with self.assertRaisesRegex(ValueError, 'identifiable transaction'):
            normalize_market(pd.DataFrame([book]), pd.DataFrame([{**trade, 'trade_id': '0x' + 'z' * 64}]), MARKET, t, t + 2000)

    def test_decoded_maker_legs_and_exchange_summaries(self):
        maker = {'outcome': 'no', 'maker_side': 'BUY', 'taker': '0x' + 'b' * 40,
                 'usd_amount': 31.2, 'token_amount': 40., 'transactionHash': TX, '_log_index': 42}
        summary = {**maker, 'outcome': 'yes', 'taker': '0xe2222d279d744050d28e00520010520000310f59', '_log_index': 43}
        result = normalize_fills(pd.DataFrame([maker, summary]), MARKET)
        self.assertEqual(result[0]['tokenId'], 'no-token')
        self.assertEqual(result[0]['makerAmountFilled'], '31200000')
        self.assertEqual(result[0]['takerAmountFilled'], '40000000')
        self.assertFalse(result[0]['takerIsExchange'])
        self.assertTrue(result[1]['takerIsExchange'])
        with self.assertRaisesRegex(ValueError, 'Duplicate decoded'):
            normalize_fills(pd.DataFrame([maker, maker]), MARKET)


if __name__ == '__main__':
    unittest.main()
