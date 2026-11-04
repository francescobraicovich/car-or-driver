"""Verify selected resolved winner conditions through public Polygon CTF logs.

Only read-only JSON-RPC methods are used. Block searches are deliberately narrow
around independently obtained Gamma timestamps; absence from those windows is
not proof that a condition never resolved.
"""

import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

RPC = 'https://polygon.drpc.org'
CTF = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045'
NEG_RISK_ADAPTER = '0xd91e80cf2e7be2e162c6513ced06f1dd0da35296'
# keccak256(ConditionResolution(bytes32,address,bytes32,uint256,uint256[]))
RESOLUTION_TOPIC = '0xb44d84d3289691f71497564b85d4233648d9dbae8cbdbb4329f301c3a0185894'
# First four bytes of keccak256(payoutDenominator(bytes32)).
DENOMINATOR_SELECTOR = '0xdd34de67'
BLOCK_ESTIMATES = {
    'austrian': {'norris': 89312052, 'hamilton': 89312052},
    'british': {'norris': 89721933, 'hamilton': 89721933},
    'dutch': {'norris': 92553382, 'hamilton': 92553245},
    'italian': {'norris': 93350232, 'hamilton': 93350232},
}


def decode_payout(data):
    if not data.startswith('0x') or len(data[2:]) != 64 * 5:
        raise ValueError('Unexpected CTF payout event data length')
    words = [int(data[i:i + 64], 16) for i in range(2, len(data), 64)]
    if words[:3] != [2, 64, 2] or sum(words[3:]) <= 0:
        raise ValueError('Expected two nonzero-denominator payout slots')
    return words[3:]


def validate_log(log, condition, reported_prices):
    topics = log.get('topics', [])
    if (log.get('address', '').lower() != CTF or log.get('removed') or len(topics) != 4
            or topics[0].lower() != RESOLUTION_TOPIC or topics[1].lower() != condition.lower()
            or '0x' + topics[2][-40:].lower() != NEG_RISK_ADAPTER):
        raise ValueError('Unexpected CTF resolution log or negative-risk oracle')
    numerators = decode_payout(log['data'])
    denominator = sum(numerators)
    if [str(n // denominator) if n % denominator == 0 else str(n / denominator) for n in numerators] != reported_prices:
        raise ValueError('On-chain payout differs from exchange-reported outcome prices')
    return numerators


def request_rpc(endpoint, method, params):
    payload = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode()
    request = urllib.request.Request(endpoint, data=payload, headers={
        'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'car-or-driver-research/1.0',
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)
    if 'error' in result or 'result' not in result:
        raise ValueError(f'{method} failed: {result}')
    return result['result']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rpc', default=RPC, help='Public Polygon JSON-RPC HTTPS endpoint')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    rpc = lambda method, params: request_rpc(args.rpc, method, params)
    if int(rpc('eth_chainId', []), 16) != 137:
        raise ValueError('Expected Polygon chain ID 137')
    directory = Path(__file__).parent
    records = []
    headers, receipts = {}, {}
    for race, estimates in BLOCK_ESTIMATES.items():
        metadata = json.loads((directory / f'{race}-2026-official-outcomes.json').read_text())
        for driver, estimate in estimates.items():
            market = next(m for m in metadata['markets'] if f'-{driver}-' in m['slug'])
            if market['outcomes'] != ['Yes', 'No'] or not market['closed'] or market['umaResolutionStatus'] != 'resolved':
                raise ValueError('Expected a closed resolved YES/NO Gamma market')
            condition = market['conditionId']
            query = {'address': CTF, 'fromBlock': hex(estimate - 10), 'toBlock': hex(estimate + 10),
                     'topics': [RESOLUTION_TOPIC, condition]}
            logs = rpc('eth_getLogs', [query])
            if len(logs) != 1:
                raise ValueError(f'Expected one resolution log in narrow window for {race} {driver}, got {len(logs)}')
            log = logs[0]
            numerators = validate_log(log, condition, market['outcomePrices'])
            block_number = int(log['blockNumber'], 16)
            if block_number not in headers:
                headers[block_number] = rpc('eth_getBlockByNumber', [hex(block_number), False])
            header = headers[block_number]
            if header is None or header['hash'].lower() != log['blockHash'].lower():
                raise ValueError('Resolution log does not match the returned canonical block')
            transaction = log['transactionHash']
            if transaction not in receipts:
                receipts[transaction] = rpc('eth_getTransactionReceipt', [transaction])
            receipt = receipts[transaction]
            if (receipt is None or int(receipt['status'], 16) != 1 or receipt['blockHash'].lower() != log['blockHash'].lower()
                    or not any(item['logIndex'] == log['logIndex'] and item['topics'] == log['topics'] for item in receipt['logs'])):
                raise ValueError('Resolution log not found in a successful transaction receipt')
            call = {'to': CTF, 'data': DENOMINATOR_SELECTOR + condition[2:]}
            before = int(rpc('eth_call', [call, hex(block_number - 1)]), 16)
            after = int(rpc('eth_call', [call, hex(block_number)]), 16)
            if before != 0 or after != sum(numerators):
                raise ValueError('Unexpected payout denominator around the resolution block')
            timestamp = int(header['timestamp'], 16)
            records.append({
                'race': race, 'driver': driver, 'conditionId': condition,
                'blockNumber': block_number, 'blockHash': log['blockHash'],
                'blockTime': datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace('+00:00', 'Z'),
                'transactionHash': transaction, 'logIndex': int(log['logIndex'], 16),
                'oracle': NEG_RISK_ADAPTER, 'payoutNumerators': numerators,
                'payoutDenominatorBeforeBlock': before, 'payoutDenominatorAtBlock': after,
                'gammaClosedTime': market['closedTime'], 'gammaReportedPrices': market['outcomePrices'],
                'searchWindow': [estimate - 10, estimate + 10],
            })
    result = {
        'verifiedAt': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'chainId': 137, 'rpc': args.rpc, 'conditionalTokens': CTF, 'resolutionEventTopic': RESOLUTION_TOPIC,
        'interpretation': 'CTF payout was recorded in this successful block. This is not evidence of a particular holder redemption, claim latency, gas cost or operational ability to reuse funds.',
        'records': records,
    }
    Path(args.output).write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
