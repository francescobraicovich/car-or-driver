"""Compare pre-FP1 CLOB sampled prices with prefix-built winner proxies, not executions."""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import math
import re
import subprocess
import unicodedata
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[3]
BASELINE = ROOT / 'research/prediction-markets/forecast/season-2026-baseline.json'
IDENTIFIERS = ROOT / 'research/prediction-markets/polymarket/onchain/winner/outcome-identifiers.json'
RACES = {'austrian': ('1176', '2026-06-28'), 'british': ('1177', '2026-07-05'),
         'belgian': ('1178', '2026-07-19'), 'hungarian': ('1179', '2026-07-26')}
MAX_SAMPLE_AGE = 180
WINDOW = 1800


def canonical_surname(name):
    name = re.sub(r'\s+(?:Jr\.?|Sr\.?)$', '', name.strip(), flags=re.I)
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    return name.lower().split()[-1]


def retrieve(url):
    result = subprocess.run(['curl', '-fsSL', '--retry', '2', '--max-time', '30', url], capture_output=True, check=True)
    return {'url': url, 'sha256': hashlib.sha256(result.stdout).hexdigest(), 'response': json.loads(result.stdout)}


def select_sample(history, cutoff, window=WINDOW, max_age=MAX_SAMPLE_AGE):
    """Latest sample in predeclared window; sampled timestamp is not proof of quote freshness."""
    if not isinstance(history, list):
        raise ValueError('history is not a list')
    records = []
    for row in history:
        timestamp = row.get('t')
        price = row.get('p')
        if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp):
            raise ValueError('invalid sample timestamp')
        if isinstance(price, bool) or not isinstance(price, (int, float)) or not math.isfinite(price) or not 0 < price < 1:
            raise ValueError('invalid or boundary sampled price')
        if cutoff - window <= timestamp <= cutoff:
            records.append((timestamp, price))
    if not records:
        raise ValueError('no sample in predeclared window')
    timestamp, price = max(records, key=lambda item: item[0])
    if cutoff - timestamp > max_age:
        raise ValueError('latest sample is older than the maximum sample age')
    constant_half = all(abs(p - 0.5) < 1e-12 for _, p in records)
    return {'timestamp': timestamp, 'price': price, 'sampleAgeSeconds': cutoff - timestamp,
            'sampleCount': len(records), 'constantSeries': len({p for _, p in records}) == 1,
            'constantHalfSeries': constant_half}


def losses(probability, outcome):
    if not math.isfinite(probability) or not 0 < probability < 1 or outcome not in (0, 1):
        raise ValueError('binary probability/outcome invalid')
    return {'brier': (probability - outcome) ** 2,
            'logLoss': -(outcome * math.log(probability) + (1 - outcome) * math.log1p(-probability))}


def summarize(rows):
    if not rows:
        return None
    return {'contracts': len(rows), 'positiveOutcomes': sum(row['outcome'] for row in rows),
            'modelBrier': sum(losses(row['modelProbability'], row['outcome'])['brier'] for row in rows) / len(rows),
            'sampledPriceBrier': sum(losses(row['sampledPrice'], row['outcome'])['brier'] for row in rows) / len(rows),
            'modelLogLoss': sum(losses(row['modelProbability'], row['outcome'])['logLoss'] for row in rows) / len(rows),
            'sampledPriceLogLoss': sum(losses(row['sampledPrice'], row['outcome'])['logLoss'] for row in rows) / len(rows)}


def prepare_race(race_key, baseline, identifiers, gamma):
    """Match by unique surname and verified Gamma/token identity; reject ambiguity."""
    race_id, _ = RACES[race_key]
    race = next((row for row in baseline['results'] if row['raceId'] == race_id), None)
    if race is None:
        raise ValueError('missing baseline race')
    cutoff = int(dt.datetime.fromisoformat(race['decisionTime'].replace('Z', '+00:00')).timestamp())
    fp1 = int(dt.datetime.fromisoformat(race['firstPractice'].replace('Z', '+00:00')).timestamp())
    if cutoff >= fp1:
        raise ValueError('decision time is not before FP1')
    if len(gamma) != 1:
        raise ValueError('Gamma event was missing or ambiguous')
    event = gamma[0]
    if not event.get('negRisk'):
        raise ValueError('expected a negative-risk winner event')
    markets = event.get('markets', [])
    named = {canonical_surname(row['name']): row for row in race['roster']}
    if len(named) != len(race['roster']):
        raise ValueError('ambiguous driver surnames in model roster')
    observed = {}
    excluded = []
    expected = {row['conditionId']: row for row in identifiers[race_key]}
    for market in markets:
        title = market.get('groupItemTitle', '')
        key = canonical_surname(title) if title else ''
        if key not in named:
            excluded.append({'title': title, 'reason': 'not a named prior-roster driver; placeholder or unmatched market'})
            continue
        if key in observed:
            raise ValueError('ambiguous Gamma driver mapping')
        condition = market['conditionId']
        outcomes = json.loads(market['outcomes'])
        token_ids = json.loads(market['clobTokenIds'])
        prices = json.loads(market['outcomePrices'])
        if outcomes != ['Yes', 'No'] or condition not in expected:
            raise ValueError('Gamma market does not match expected YES identity')
        recorded_yes = [o['tokenId'] for o in expected[condition]['outcomes'] if o['name'] == 'Yes']
        if len(recorded_yes) != 1 or recorded_yes[0] != token_ids[0]:
            raise ValueError('Gamma and archived token identifiers differ')
        start = dt.datetime.fromisoformat(market['startDate'].replace('Z', '+00:00')).timestamp()
        created = dt.datetime.fromisoformat(market['createdAt'].replace('Z', '+00:00')).timestamp()
        if start > cutoff or created > cutoff:
            raise ValueError('market was not yet available at decision time')
        if not market.get('closed') or market.get('umaResolutionStatus') != 'resolved' or prices not in (['0', '1'], ['1', '0']):
            raise ValueError('current Gamma YES outcome is not unambiguously resolved to 0 or 1')
        observed[key] = {'raceId': race_id, 'race': race['race'], 'title': title, 'driverId': named[key]['driverId'],
                         'modelProbability': named[key]['probability'], 'outcome': int(prices[0]),
                         'conditionId': condition, 'yesTokenId': token_ids[0], 'marketSlug': market['slug']}
    if set(observed) != set(named):
        raise ValueError('incomplete Gamma to prior-roster mapping')
    if sum(row['outcome'] for row in observed.values()) != 1:
        raise ValueError('Gamma named driver outcomes do not identify exactly one winner')
    if not any(row['driverId'] == race['winnerId'] and row['outcome'] == 1 for row in observed.values()):
        raise ValueError('Gamma winner does not match race-results winner')
    return {'raceId': race_id, 'race': race['race'], 'cutoff': cutoff, 'firstPractice': fp1,
            'gammaMarketCount': len(markets), 'excludedNonRosterMarkets': excluded,
            'contracts': sorted(observed.values(), key=lambda row: row['driverId'])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--workers', type=int, default=6)
    args = parser.parse_args()
    if not 1 <= args.workers <= 8:
        parser.error('workers must be between 1 and 8')
    baseline = json.loads(BASELINE.read_text())
    identifiers = json.loads(IDENTIFIERS.read_text())
    races, errors = [], []
    for key, (_, date) in RACES.items():
        slug = f'f1-{key}-grand-prix-winner-{date}'
        url = 'https://gamma-api.polymarket.com/events?' + urlencode({'slug': slug})
        try:
            source = retrieve(url)
            race = prepare_race(key, baseline, identifiers, source['response'])
            race['gammaSource'] = source
            races.append(race)
        except (ValueError, KeyError, IndexError, TypeError, subprocess.SubprocessError) as error:
            errors.append({'race': key, 'error': str(error)})
    jobs = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for race in races:
            for contract in race['contracts']:
                query = {'market': contract['yesTokenId'], 'startTs': race['cutoff'] - WINDOW,
                         'endTs': race['cutoff'], 'fidelity': 1}
                url = 'https://clob.polymarket.com/prices-history?' + urlencode(query)
                jobs.append((race, contract, pool.submit(retrieve, url)))
        for race, contract, future in jobs:
            try:
                source = future.result()
                sample = select_sample(source['response']['history'], race['cutoff'])
                contract.update({'sampledPrice': sample['price'], 'sampleTimestamp': sample['timestamp'],
                                 'sampleAgeSeconds': sample['sampleAgeSeconds'], 'sampleCount': sample['sampleCount'],
                                 'constantSeries': sample['constantSeries'], 'constantHalfSeries': sample['constantHalfSeries'], 'priceSource': source})
            except (ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
                contract['error'] = str(error)
                errors.append({'race': race['race'], 'title': contract['title'], 'error': str(error)})
    valid = [row for race in races for row in race['contracts'] if 'error' not in row]
    report = {'description': 'Retrospective binary named-driver scores on raw sampled prices, not executable quotes or calibrated probabilities.',
              'retrievedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'windowSeconds': WINDOW,
              'maximumSampleAgeSeconds': MAX_SAMPLE_AGE,
              'limitations': ['Underlying quote/trade freshness is not established by a sample timestamp.',
                              'No renormalization; placeholders and non-roster outcomes explicitly excluded.',
                              'Current historical revisions/model parameters; no verified point-in-time model vintage.',
                              'Resolved Gamma outcome is used only for post-race evaluation.',
                              'Per-contract binary scores are highly imbalanced and contracts within each race are dependent.'],
              'races': races, 'errors': errors, 'overall': summarize(valid),
              'constantHalfSeriesCount': sum(row['constantHalfSeries'] for row in valid),
              'overallExcludingConstantHalfSeries': summarize([row for row in valid if not row['constantHalfSeries']]),
              'constantSeriesCount': sum(row['constantSeries'] for row in valid),
              'exploratoryOverallExcludingConstantSeries': summarize([row for row in valid if not row['constantSeries']]),
              'completeMatchedSample': len(races) == len(RACES) and not errors}
    for race in races:
        eligible = [row for row in race['contracts'] if 'error' not in row]
        race['summary'] = summarize(eligible)
        race['constantHalfSeriesCount'] = sum(row['constantHalfSeries'] for row in eligible)
        race['summaryExcludingConstantHalfSeries'] = summarize([row for row in eligible if not row['constantHalfSeries']])
        race['constantSeriesCount'] = sum(row['constantSeries'] for row in eligible)
        race['sampledPriceMassNamedContracts'] = sum(row['sampledPrice'] for row in eligible)
        race['allNamedContractsSampled'] = len(eligible) == len(race['contracts'])
    Path(args.output).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'output': args.output, 'completeMatchedSample': report['completeMatchedSample'],
                      'overall': report['overall'], 'errors': errors}, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
