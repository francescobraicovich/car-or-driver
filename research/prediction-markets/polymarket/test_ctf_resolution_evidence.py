import json
import unittest
from datetime import datetime
from pathlib import Path

from verify_ctf_resolutions import CTF, NEG_RISK_ADAPTER, RESOLUTION_TOPIC, decode_payout, validate_log

ROOT = Path('research/prediction-markets/polymarket')


def encode_words(values):
    return '0x' + ''.join(f'{value:064x}' for value in values)


class ConditionResolutionEvidenceTest(unittest.TestCase):
    def test_decode_and_validate_ctf_event(self):
        condition = '0x' + '11' * 32
        event = {
            'address': CTF, 'removed': False,
            'topics': [RESOLUTION_TOPIC, condition, '0x' + '0' * 24 + NEG_RISK_ADAPTER[2:], '0x' + '22' * 32],
            'data': encode_words([2, 64, 2, 0, 1]),
        }
        self.assertEqual(decode_payout(event['data']), [0, 1])
        self.assertEqual(validate_log(event, condition, ['0', '1']), [0, 1])
        with self.assertRaisesRegex(ValueError, 'differs'):
            validate_log(event, condition, ['1', '0'])
        with self.assertRaisesRegex(ValueError, 'unexpected|Unexpected'):
            validate_log({**event, 'removed': True}, condition, ['0', '1'])
        with self.assertRaises(ValueError):
            decode_payout(encode_words([2, 64, 2, 0, 0]))

    def test_saved_resolution_evidence_matches_gamma(self):
        evidence = json.loads((ROOT / 'ctf-resolution-evidence.json').read_text())
        self.assertEqual(evidence['chainId'], 137)
        self.assertEqual(evidence['conditionalTokens'], CTF)
        self.assertEqual(len(evidence['records']), 8)
        for record in evidence['records']:
            metadata = json.loads((ROOT / f"{record['race']}-2026-official-outcomes.json").read_text())
            market = next(m for m in metadata['markets'] if m['conditionId'] == record['conditionId'])
            self.assertEqual(record['payoutDenominatorBeforeBlock'], 0)
            self.assertEqual(record['payoutDenominatorAtBlock'], 1)
            self.assertEqual([str(x) for x in record['payoutNumerators']], market['outcomePrices'])
            self.assertEqual(datetime.fromisoformat(record['blockTime'].replace('Z', '+00:00')),
                             datetime.fromisoformat(market['closedTime']))


if __name__ == '__main__':
    unittest.main()
