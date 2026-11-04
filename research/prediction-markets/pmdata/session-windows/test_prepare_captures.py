import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

SPEC = importlib.util.spec_from_file_location('session_capture', Path(__file__).with_name('prepare_captures.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SessionCaptureTests(unittest.TestCase):
    def test_cutoff_excludes_later_tick_change_and_midnight_book(self):
        day = '2026-06-06'
        start = pd.Timestamp(day, tz='UTC')
        cutoff = start + pd.Timedelta(hours=14)
        book = {'market_slug': 'market', 'event_type': 'book', 'bid_prices': [0.2],
                'bid_sizes': [10], 'ask_prices': [0.3], 'ask_sizes': [10]}
        l2 = pd.DataFrame([
            {**book, 'timestamp': start, 'local_timestamp': start},
            {**book, 'timestamp': start + pd.Timedelta(hours=1, milliseconds=4), 'local_timestamp': start + pd.Timedelta(hours=1)},
            {'market_slug': 'market', 'event_type': 'tick_size_change',
             'timestamp': cutoff, 'local_timestamp': cutoff},
        ])
        driver = {'driverId': '1', 'name': 'Driver',
                  'market': {'slug': 'market', 'conditionId': 'condition', 'outcomes': ['Yes', 'No'],
                             'clobTokenIds': ['yes', 'no']},
                  'days': {day: {'l2': {'status': 'available', 'path': 'l2', 'sha256': 'hash'},
                                 'trades': {'status': 'not_found'}, 'onchain_fills': {'status': 'not_found'}}}}
        with tempfile.TemporaryDirectory() as directory, patch.object(MODULE.pd, 'read_parquet', return_value=l2):
            result = MODULE.prepare_day(driver, day, cutoff, Path(directory))
            capture = json.loads(Path(result['capture']).read_text())
        self.assertEqual(result['excludedBoundarySnapshots'], 1)
        self.assertEqual(result['clockLeadCorrections'], 1)
        self.assertEqual(result['maxClockLeadUs'], 4000)
        self.assertEqual(len(capture['rows']), 1)
        self.assertEqual(capture['rows'][0]['received'], capture['rows'][0]['source'])
        self.assertLess(capture['rows'][0]['receivedUs'], MODULE.micros(cutoff))

    def test_missing_trade_status_is_not_no_trades(self):
        driver = {'market': {}, 'days': {}}
        with self.assertRaisesRegex(ValueError, 'Identified market'):
            MODULE.prepare_day(driver, '2026-06-06', pd.Timestamp('2026-06-06T14:00Z'), Path('/tmp'))

    def test_clock_lead_over_limit_is_rejected(self):
        day = '2026-06-06'
        start = pd.Timestamp(day, tz='UTC')
        receipt = MODULE.micros(start + pd.Timedelta(hours=1))
        driver = {'driverId': '1', 'name': 'Driver', 'market': {'slug': 'market'},
                  'days': {day: {'l2': {'status': 'available', 'path': 'l2'},
                                 'trades': {'status': 'not_found'}, 'onchain_fills': {'status': 'not_found'}}}}
        row = {'type': 'book', 'receivedUs': receipt, 'received': receipt / 1000, 'source': (receipt + 6000) / 1000}
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(MODULE.pd, 'read_parquet', return_value=pd.DataFrame()), \
                patch.object(MODULE, 'normalize_market', return_value=[row]):
            with self.assertRaisesRegex(ValueError, 'more than 5 ms'):
                MODULE.prepare_day(driver, day, start + pd.Timedelta(hours=14), Path(directory))

    def test_schedule_requires_matching_session_dates(self):
        row = {'year': '2026', 'name': 'Example', 'quali_date': '2026-06-06', 'quali_time': '14:00:00',
               'date': '2026-06-07', 'time': '13:00:00', 'fp1_date': '2026-06-05', 'fp1_time': '12:00:00'}
        with self.assertRaisesRegex(ValueError, 'schedule disagree'):
            MODULE.schedule({'name': 'Example', 'dates': ['2026-06-05', '2026-06-07']}, [row])


if __name__ == '__main__':
    unittest.main()
