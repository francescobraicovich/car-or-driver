import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

SPEC = importlib.util.spec_from_file_location('extended_capture', Path(__file__).with_name('prepare_extended_captures.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ExtendedCaptureTests(unittest.TestCase):
    def setUp(self):
        self.day = '2026-06-06'
        self.midnight = pd.Timestamp(self.day, tz='UTC')
        self.resume = self.midnight + pd.Timedelta(hours=17)
        self.day_end = self.midnight + pd.Timedelta(days=1)
        self.driver = {'driverId': '1', 'name': 'Driver',
                       'market': {'slug': 'market', 'conditionId': 'condition', 'outcomes': ['Yes', 'No'],
                                  'clobTokenIds': ['yes', 'no']},
                       'days': {self.day: {'l2': {'status': 'available', 'path': 'l2', 'sha256': 'hash'},
                                          'trades': {'status': 'not_found'}, 'onchain_fills': {'status': 'not_found'}}}}

    @staticmethod
    def book(timestamp, source=None):
        return {'market_slug': 'market', 'event_type': 'book', 'bid_prices': [0.2],
                'bid_sizes': [10], 'ask_prices': [0.3], 'ask_sizes': [10],
                'timestamp': source if source is not None else timestamp, 'local_timestamp': timestamp}

    def test_post_qualifying_window_excludes_outside_and_day_end_boundary(self):
        book_time = self.resume + pd.Timedelta(seconds=1)
        l2 = pd.DataFrame([self.book(self.resume - pd.Timedelta(microseconds=1)),
                           self.book(book_time, book_time + pd.Timedelta(milliseconds=4)),
                           self.book(self.day_end - pd.Timedelta(microseconds=1)),
                           self.book(self.day_end)])
        with tempfile.TemporaryDirectory() as directory, patch.object(MODULE.SESSION.pd, 'read_parquet', return_value=l2):
            result = MODULE.prepare_window(self.driver, self.day, self.resume, self.day_end, Path(directory))
            capture = json.loads(Path(result['capture']).read_text())
        self.assertEqual(result['excludedEndBoundarySnapshots'], 1)
        self.assertEqual(result['clockLeadCorrections'], 1)
        self.assertEqual(len(capture['rows']), 1)
        self.assertEqual(capture['rows'][0]['received'], capture['rows'][0]['source'])
        self.assertGreaterEqual(capture['rows'][0]['receivedUs'], MODULE.SESSION.micros(self.resume))
        self.assertLess(capture['rows'][0]['receivedUs'], MODULE.SESSION.micros(self.day_end) - 1)

    def test_boundary_snapshot_alone_is_not_a_usable_book(self):
        l2 = pd.DataFrame([self.book(self.day_end - pd.Timedelta(microseconds=1))])
        with tempfile.TemporaryDirectory() as directory, patch.object(MODULE.SESSION.pd, 'read_parquet', return_value=l2):
            with self.assertRaisesRegex(ValueError, 'No non-boundary book'):
                MODULE.prepare_window(self.driver, self.day, self.resume, self.day_end, Path(directory))
            self.assertEqual(list(Path(directory).iterdir()), [])


if __name__ == '__main__':
    unittest.main()
