"""Summarize recorded winner books; snapshot consistency is not coverage proof."""

import argparse
import json
from collections import Counter
from pathlib import Path


def audit(data, metadata):
    output = []
    for market in metadata['markets']:
        if not any('-' + driver + '-' in market['slug'] for driver in ('norris', 'hamilton')):
            continue
        yes = market['clobTokenIds'][market['outcomes'].index('Yes')]
        events = [r for r in data['rows'] if r['condition'] == market['conditionId'] and r['asset'] == yes]
        counts = Counter(r['type'] for r in events)
        book = {'BUY': {}, 'SELL': {}}
        initialized = False
        mismatches = 0
        snapshots_compared = 0
        source_decreases = 0
        receipt_ties = 0
        previous = None
        for event in events:
            if previous is not None:
                receipt_ties += event['receivedUs'] == previous['receivedUs']
                source_decreases += event['source'] < previous['source']
            previous = event
            if event['type'] == 'book':
                observed = {'BUY': {float(p): float(q) for p, q in json.loads(event['bids'])},
                            'SELL': {float(p): float(q) for p, q in json.loads(event['asks'])}}
                if initialized:
                    snapshots_compared += 1
                    mismatches += any(abs(book[side].get(p, 0) - observed[side].get(p, 0)) > 0.00001
                                      for side in book for p in book[side].keys() | observed[side].keys())
                book = observed
                initialized = True
            elif event['type'] == 'price_change' and initialized:
                side, price, quantity = event['side'], float(event['price']), float(event['size'])
                if side not in book:
                    raise ValueError('Unexpected price-change side')
                if quantity:
                    book[side][price] = quantity
                else:
                    book[side].pop(price, None)
        output.append({
            'market': market['slug'], 'conditionId': market['conditionId'], 'yesToken': yes,
            'eventCounts': dict(counts), 'subsequentSnapshotsCompared': snapshots_compared,
            'snapshotsDifferingFromReconstruction': mismatches,
            'identicalReceiptTimeTransitions': receipt_ties, 'exchangeTimestampDecreases': source_decreases,
        })
    return {'hour': data['manifestHour'], 'coverageComplete': False,
            'note': 'Receive-time plus collector sequence is an ordering assumption; snapshot mismatch is not proof of a gap.',
            'markets': output}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('events')
    parser.add_argument('metadata')
    parser.add_argument('output')
    args = parser.parse_args()
    data = json.loads(Path(args.events).read_text())
    metadata = json.loads(Path(args.metadata).read_text())
    Path(args.output).write_text(json.dumps(audit(data, metadata), indent=2) + '\n')


if __name__ == '__main__':
    main()
