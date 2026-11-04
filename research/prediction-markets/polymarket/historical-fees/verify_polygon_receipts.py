"""Verify saved fee event fields against public Polygon transaction receipts."""
import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen

DIRECTORY = Path(__file__).resolve().parent
TOPIC = '0xd543adfd945773f1a62f74f0ee55a5e3b9b1a28262980ba90b1a89f2ea84d8ee'
NEGATIVE_RISK_EXCHANGE = '0xe2222d279d744050d28e00520010520000310f59'


def verify_receipt(receipt, expected):
    """Match a successful receipt's V2 OrderFilled log to one saved observation."""
    if not isinstance(receipt, dict) or receipt.get('status') != '0x1' or receipt.get('transactionHash', '').lower() != expected['transactionHash'].lower():
        raise ValueError('Invalid or unsuccessful transaction receipt')
    matches = [log for log in receipt.get('logs', []) if int(log.get('logIndex', '-1'), 16) == expected['logIndex']]
    if len(matches) != 1:
        raise ValueError('Expected log index missing or duplicated')
    log = matches[0]
    if log.get('address', '').lower() != NEGATIVE_RISK_EXCHANGE or not log.get('topics') or log['topics'][0].lower() != TOPIC:
        raise ValueError('Unexpected contract or event topic')
    data = log.get('data', '')
    if not data.startswith('0x') or len(data) != 2 + 7 * 64:
        raise ValueError('Invalid V2 OrderFilled payload')
    try:
        words = [int(data[offset:offset + 64], 16) for offset in range(2, len(data), 64)]
    except ValueError as error:
        raise ValueError('Invalid V2 OrderFilled payload') from error
    expected_words = [expected['side'], int(expected['tokenId']), int(expected['makerAmountFilled']),
                      int(expected['takerAmountFilled']), int(expected['fee'])]
    if words[:5] != expected_words:
        raise ValueError('Archive event fields disagree with receipt')
    return True


def fetch_receipt(rpc, transaction_hash):
    payload = json.dumps({'jsonrpc': '2.0', 'method': 'eth_getTransactionReceipt', 'params': [transaction_hash], 'id': 1}).encode()
    request = Request(rpc, data=payload, headers={'Content-Type': 'application/json',
                                                  'Accept': 'application/json',
                                                  'User-Agent': 'car-or-driver-research/1.0'}, method='POST')
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
    if result.get('error') or result.get('result') is None:
        raise ValueError('RPC did not return a receipt')
    return result['result']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rpc', default='https://polygon.drpc.org', help='Public Polygon JSON-RPC endpoint')
    args = parser.parse_args()
    count = 0
    for race in ('austrian', 'hungarian'):
        events = json.loads((DIRECTORY / f'{race}-winner-fee-events.json').read_text())
        for event in events:
            verify_receipt(fetch_receipt(args.rpc, event['transactionHash']), event)
            count += 1
    print(f'{count} public Polygon receipts matched their saved V2 fee event fields')


if __name__ == '__main__':
    main()
