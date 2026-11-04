"""Summarize observed maker-side collateral amounts in the recorded event extracts."""
from collections import defaultdict
import json
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parent


def summarize(events):
    """Exclude exchange summary rows; sum collateral transferred by each maker event."""
    results = defaultdict(lambda: {'makerEvents': 0, 'transactions': set(), 'collateralMicroUnits': 0})
    for event in events:
        if event['takerIsExchange']:
            continue
        if event['side'] not in (0, 1):
            raise ValueError('Unknown maker side')
        collateral = int(event['makerAmountFilled'] if event['side'] == 0 else event['takerAmountFilled'])
        if collateral < 0:
            raise ValueError('Invalid collateral amount')
        result = results[event['race']]
        result['makerEvents'] += 1
        result['transactions'].add(event['transactionHash'])
        result['collateralMicroUnits'] += collateral
    return {race: {'makerEvents': result['makerEvents'], 'transactions': len(result['transactions']),
                   'collateralMicroUnits': result['collateralMicroUnits']}
            for race, result in sorted(results.items())}


def main():
    british = json.loads((DIRECTORY / 'british-2026-onchain-events.json').read_text())
    for event in british:
        event['race'] = 'british'
    additional = json.loads((DIRECTORY / 'additional-onchain-events.json').read_text())
    print(json.dumps(summarize(british + additional), indent=2))


if __name__ == '__main__':
    main()
