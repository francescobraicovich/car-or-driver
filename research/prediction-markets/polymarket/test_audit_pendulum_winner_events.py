import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from audit_pendulum_winner_events import audit

ROOT = Path('research/prediction-markets/polymarket')


class PendulumWinnerAuditTest(unittest.TestCase):
    def test_sample_audit_preserves_unverified_status(self):
        data = json.loads((ROOT / 'dutch-2026-august-20-winner-v3-events.json').read_text())
        metadata = json.loads((ROOT / 'dutch-2026-official-outcomes.json').read_text())
        result = audit(data, metadata)
        self.assertFalse(result['coverageComplete'])
        self.assertEqual(len(result['markets']), 2)
        self.assertEqual([m['eventCounts']['book'] for m in result['markets']], [6, 6])
        self.assertTrue(all(m['snapshotsDifferingFromReconstruction'] == 4 for m in result['markets']))
        self.assertTrue(all('last_trade_price' not in m['eventCounts'] for m in result['markets']))
        self.assertTrue(all(isinstance(r['sequence'], str) and isinstance(r['receivedUs'], int) for r in data['rows']))

    def test_invalid_source_checksum_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'source.parquet'
            manifest = Path(temp) / 'manifest.json'
            source.write_bytes(b'invalid file')
            manifest.write_text(json.dumps({'sha256': '0' * 64}))
            result = subprocess.run([sys.executable, str(ROOT / 'extract_pendulum_winner_events.py'), str(source),
                                     str(manifest), str(ROOT / 'dutch-2026-official-outcomes.json'),
                                     str(Path(temp) / 'output.json')], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('does not match the archive manifest', result.stderr)


if __name__ == '__main__':
    unittest.main()
