"""Summarize maker-event collateral by named race-winner market."""
import json
from pathlib import Path
import sys

DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(DIRECTORY.parent))
from summarize_onchain import summarize  # noqa: E402


def summarize_markets(events, markets):
    """Count named token activity, preserving YES/NO and per-race totals."""
    tokens = {}
    for race, race_markets in markets.items():
        for market in race_markets:
            for outcome in market['outcomes']:
                if outcome['tokenId'] in tokens:
                    raise ValueError('Duplicate outcome token')
                if outcome['name'] not in ('Yes', 'No'):
                    raise ValueError('Invalid winner outcome')
                tokens[outcome['tokenId']] = (race, market['marketSlug'], outcome['name'])
    grouped = {}
    for event in events:
        if event['takerIsExchange']:
            continue
        token = tokens.get(event['tokenId'])
        if token is None or token[0] != event['race']:
            raise ValueError('Unknown or mismatched winner token')
        if event['side'] not in (0, 1):
            raise ValueError('Unknown maker side')
        collateral = int(event['makerAmountFilled'] if event['side'] == 0 else event['takerAmountFilled'])
        if collateral < 0:
            raise ValueError('Invalid collateral amount')
        key = (token[0], token[1])
        item = grouped.setdefault(key, {'race': token[0], 'marketSlug': token[1], 'makerEvents': 0,
                                         'transactions': set(), 'collateralMicroUnits': 0,
                                         'yesEvents': 0, 'noEvents': 0})
        item['makerEvents'] += 1
        item['transactions'].add(event['transactionHash'])
        item['collateralMicroUnits'] += collateral
        item['yesEvents' if token[2] == 'Yes' else 'noEvents'] += 1
    rows = []
    for key in sorted(grouped):
        item = grouped[key]
        item['transactions'] = len(item['transactions'])
        rows.append(item)
    return {'races': summarize(events), 'markets': rows}


def main():
    markets = json.loads((DIRECTORY / 'outcome-identifiers.json').read_text())
    events = json.loads((DIRECTORY / 'winner-onchain-events.json').read_text())
    print(json.dumps(summarize_markets(events, markets), indent=2))


if __name__ == '__main__':
    main()
