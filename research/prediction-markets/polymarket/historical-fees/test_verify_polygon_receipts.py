import unittest
from verify_polygon_receipts import NEGATIVE_RISK_EXCHANGE, TOPIC, verify_receipt


class ReceiptVerificationTest(unittest.TestCase):
    def test_rejects_incorrect_fee_and_accepts_exact_payload(self):
        event = {'transactionHash': '0xabc', 'logIndex': 2, 'side': 0, 'tokenId': '123',
                 'makerAmountFilled': '8140000', 'takerAmountFilled': '37000000', 'fee': '190470'}
        words = [0, 123, 8140000, 37000000, 190470, 0, 0]
        receipt = {'transactionHash': '0xabc', 'status': '0x1', 'logs': [
            {'logIndex': '0x2', 'address': NEGATIVE_RISK_EXCHANGE, 'topics': [TOPIC],
             'data': '0x' + ''.join(f'{word:064x}' for word in words)}]}
        self.assertTrue(verify_receipt(receipt, event))
        wrong_fee = {**event, 'fee': '190471'}
        with self.assertRaisesRegex(ValueError, 'disagree'):
            verify_receipt(receipt, wrong_fee)
        receipt['status'] = '0x0'
        with self.assertRaisesRegex(ValueError, 'unsuccessful'):
            verify_receipt(receipt, event)


if __name__ == '__main__':
    unittest.main()
