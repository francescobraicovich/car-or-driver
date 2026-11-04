import unittest

from scan_onchain import normalize


class NormalizeTest(unittest.TestCase):
    def test_flags_exchange_summary_and_preserves_integer_amounts(self):
        row = {
            'timestamp': 1782896948, 'block_number': 89461302,
            'transaction_hash': '0xabc', 'log_index': 1,
            'contract': 'CTF_EXCHANGE_V2', 'taker': '0xE111180000d2663C0091e4f400237545B87B996B',
            'side': 0, 'token_id': '123', 'maker_amount_filled': '5000000',
            'taker_amount_filled': '10000000',
        }
        result = normalize(row)
        self.assertTrue(result['takerIsExchange'])
        self.assertEqual(result['makerAmountFilled'], '5000000')
        row['taker'] = '0x123'
        self.assertFalse(normalize(row)['takerIsExchange'])


class RaceWindowTest(unittest.TestCase):
    def test_exclusive_official_fp1_cutoffs(self):
        from datetime import datetime, timezone
        from scan_additional_races import race_windows
        markets = {name: [{'outcomes': [{'tokenId': name}]}] for name in ('austrian', 'belgian', 'hungarian')}
        windows = race_windows(markets)
        self.assertEqual(datetime.fromtimestamp(windows['austrian'][2], timezone.utc).isoformat(), '2026-06-26T11:30:00+00:00')
        self.assertEqual(datetime.fromtimestamp(windows['belgian'][2], timezone.utc).isoformat(), '2026-07-17T11:30:00+00:00')
        self.assertEqual(datetime.fromtimestamp(windows['hungarian'][2], timezone.utc).isoformat(), '2026-07-24T11:30:00+00:00')
        self.assertEqual(windows['austrian'][3], {'austrian'})


if __name__ == '__main__':
    unittest.main()
