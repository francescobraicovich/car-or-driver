import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

MODULE_PATH = Path(__file__).with_name('prepare_captures.py')
SPEC = importlib.util.spec_from_file_location('prepare_captures', MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CaptureTests(unittest.TestCase):
    def test_recorded_day_trade_404_and_no_chain_fills(self):
        driver = {'driverId': '1', 'name': 'Driver', 'market': {'slug': 'test'},
                  'files': {'l2': {'status': 'available', 'path': 'l2'},
                            'trades': {'status': 'not_found'}, 'onchain_fills': {'status': 'not_found'}}}
        rows = [{'type': 'book', 'receivedUs': 1}]
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(MODULE.pd, 'read_parquet', return_value=pd.DataFrame()), \
                patch.object(MODULE, 'normalize_market', return_value=rows):
            output = MODULE.prepare_driver(driver, 0, 3, Path(directory))
        self.assertEqual(output['tradeFileStatus'], 'not_found')
        self.assertEqual(output['prints'], 0)

    def test_trade_404_with_onchain_records_is_excluded(self):
        driver = {'driverId': '1', 'name': 'Driver', 'market': {'slug': 'test'},
                  'files': {'l2': {'status': 'available', 'path': 'l2'},
                            'trades': {'status': 'not_found'},
                            'onchain_fills': {'status': 'available', 'path': 'chain'}}}
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(MODULE.pd, 'read_parquet', return_value=pd.DataFrame()), \
                patch.object(MODULE, 'normalize_market', return_value=[{'type': 'book', 'receivedUs': 1}]), \
                patch.object(MODULE, 'normalize_fills', return_value=[{'transactionHash': '0xabc', 'takerIsExchange': False}]):
            with self.assertRaisesRegex(ValueError, 'on-chain maker transactions lack'):
                MODULE.prepare_driver(driver, 0, 3, Path(directory))

    def test_start_and_end_boundary_books_are_excluded(self):
        driver = {'driverId': '1', 'name': 'Driver', 'market': {'slug': 'test'},
                  'files': {'l2': {'status': 'available', 'path': 'l2'},
                            'trades': {'status': 'not_found'}, 'onchain_fills': {'status': 'not_found'}}}
        rows = [{'type': 'book', 'receivedUs': time} for time in (0, 1, 9)]
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(MODULE.pd, 'read_parquet', return_value=pd.DataFrame()), \
                patch.object(MODULE, 'normalize_market', return_value=rows):
            result = MODULE.prepare_driver(driver, 0, 10, Path(directory))
            capture = json.loads(Path(result['capture']).read_text())
        self.assertEqual([row['receivedUs'] for row in capture['rows']], [1])
        self.assertEqual(result['excludedBoundarySnapshots'], {'start': 1, 'end': 1})

    def test_unknown_trade_status_is_not_zero(self):
        driver = {'market': {}, 'files': {'l2': {'status': 'available', 'path': 'l2'}, 'trades': {'status': 'failed'}}}
        with self.assertRaisesRegex(ValueError, 'Trade file status'):
            MODULE.prepare_driver(driver, 0, 1, Path('/tmp'))


if __name__ == '__main__':
    unittest.main()
