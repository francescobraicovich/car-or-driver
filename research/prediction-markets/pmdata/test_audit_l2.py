import unittest
from datetime import datetime, timedelta

from audit_l2 import audit

BASE = datetime(2026, 6, 25, 14)


def row(t, kind, **fields):
    return {'market_slug': 'f1-test', 'timestamp': BASE + timedelta(seconds=t),
            'local_timestamp': BASE + timedelta(seconds=t), 'event_type': kind, **fields}


def book(t, bid_size=10):
    return row(t, 'book', bid_prices=[0.2], bid_sizes=[bid_size], ask_prices=[0.3], ask_sizes=[10])


def trade(t, **fields):
    return row(t, 'last_trade_price', outcome='yes', price=0.2, size=1, side='SELL', **fields)


def run(l2, trades, chain=None):
    return audit(l2, trades, BASE, BASE + timedelta(seconds=60), BASE + timedelta(days=1), chain)


class AuditTest(unittest.TestCase):
    def test_continuity_diagnostics_do_not_certify_coverage(self):
        result = run([book(-1), book(20, 9)], [trade(10)])
        self.assertEqual(result['counts']['initial_snapshot_at_or_before_start'], 1)
        self.assertEqual(result['diagnostics']['snapshot_disagreements_with_observed_trade'], 1)
        self.assertEqual(result['chain_check']['status'], 'not supplied')
        self.assertFalse(result['coverage_complete'])

    def test_missing_hashes_and_unexplained_snapshot_change(self):
        result = run([book(-1), book(20, 9)], [trade(30)], [{'transactionHash': '0x1'}])
        self.assertEqual(result['diagnostics']['snapshot_disagreements_without_observed_trade'], 1)
        self.assertEqual(result['chain_check']['status'], 'not comparable: trade hashes absent')

    def test_receipt_reversals_and_tick_changes_are_counted(self):
        first, second = trade(10), trade(5)
        result = run([book(-1), row(1, 'tick_size_change', new_tick_size='0.01')], [first, second])
        self.assertEqual(result['diagnostics']['trades_receipt_reversals'], 1)
        self.assertEqual(result['diagnostics']['unsupported_tick_size_change'], 1)

    def test_invalid_input_fails_closed(self):
        with self.assertRaises(ValueError):
            run([row(-1, 'book', bid_prices=[0.2], bid_sizes=[], ask_prices=[], ask_sizes=[])], [])
        with self.assertRaises(ValueError):
            run([book(-1), row(1, 'gap')], [])
        with self.assertRaises(ValueError):
            run([book(-1)], [row(10, 'last_trade_price', outcome='yes', price=0.2, size=-1, side='SELL')])
        with self.assertRaises(ValueError):
            audit([book(-1)], [], BASE, BASE + timedelta(days=2), BASE + timedelta(days=1))

    def test_update_and_hash_comparison(self):
        update = row(1, 'price_change', pc_price=0.2, pc_size=8, pc_side='BUY', best_bid=0.2, best_ask=0.3)
        result = run([book(-1), update, book(2, 8)], [trade(1, trade_id='0xA')], [{'transactionHash': '0xa'}])
        self.assertEqual(result['chain_check']['tape_hashes_absent_from_chain_file'], 0)
        self.assertEqual(result['diagnostics'].get('snapshot_disagreements_without_observed_trade', 0), 0)


if __name__ == '__main__':
    unittest.main()
