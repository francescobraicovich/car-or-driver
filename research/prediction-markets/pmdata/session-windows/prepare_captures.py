"""Prepare pre-qualifying and pre-race captures without events after either cutoff."""

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from normalize_portfolio_capture import EXCHANGES, micros, normalize_fills, normalize_market  # noqa: E402


def schedule(race, rows):
    matches = [row for row in rows if row['year'] == '2026' and row['name'] == race['name']]
    if len(matches) != 1:
        raise ValueError('Race schedule does not have exactly one matching event')
    row = matches[0]
    qualifying = pd.Timestamp(f"{row['quali_date']}T{row['quali_time']}Z")
    race_start = pd.Timestamp(f"{row['date']}T{row['time']}Z")
    first_practice = pd.Timestamp(f"{row['fp1_date']}T{row['fp1_time']}Z")
    if [row['quali_date'], row['date']] != race['dates'] or not first_practice < qualifying < race_start:
        raise ValueError('Manifest dates and session schedule disagree')
    return qualifying, race_start, first_practice


def prepare_day(driver, day, cutoff, output, window_start=None):
    market = driver.get('market')
    files = driver.get('days', {}).get(day, {})
    if not market or files.get('l2', {}).get('status') != 'available':
        raise ValueError('Identified market and recorded-day L2 file required')
    if files.get('trades', {}).get('status') not in ('available', 'not_found'):
        raise ValueError('Trade data unavailable')
    if files.get('onchain_fills', {}).get('status') not in ('available', 'not_found'):
        raise ValueError('On-chain data unavailable')
    l2 = pd.read_parquet(files['l2']['path'])
    trades = (pd.read_parquet(files['trades']['path']) if files['trades']['status'] == 'available'
              else pd.DataFrame(columns=['market_slug', 'local_timestamp']))
    chain_frame = (pd.read_parquet(files['onchain_fills']['path'])
                   if files['onchain_fills']['status'] == 'available' else None)
    chain = normalize_fills(chain_frame, market) if chain_frame is not None else []
    day_start = pd.Timestamp(day, tz='UTC')
    start = window_start if window_start is not None else day_start
    if not day_start <= start < cutoff <= day_start + pd.Timedelta(days=1):
        raise ValueError('Invalid session window')
    # Compare buffered window chain hashes against prints from the entire UTC
    # day. Block and exchange times differ; a missing hash is uncertainty, not
    # proof that the match occurred inside the decision window.
    chain_ids = set()
    if chain_frame is not None:
        for record in chain_frame.to_dict('records'):
            timestamp = pd.Timestamp(record['timestamp'])
            if timestamp.tzinfo is None:
                timestamp = timestamp.tz_localize('UTC')
            if start - pd.Timedelta(seconds=60) <= timestamp < cutoff + pd.Timedelta(seconds=60) and str(record['taker']).lower() not in EXCHANGES:
                chain_ids.add(record['transactionHash'].lower())
    trade_ids = {str(value).lower() for value in trades.get('trade_id', []) if isinstance(value, str)}
    missing = chain_ids - trade_ids
    if missing:
        raise ValueError(f'{len(missing)} on-chain transactions lack same-day exchange prints')
    start_us, end_us = micros(start), micros(cutoff)
    rows = normalize_market(l2, trades, market, start_us, end_us)
    day_start_us = micros(day_start)
    boundary = sum(row['type'] == 'book' and row['receivedUs'] == day_start_us for row in rows)
    rows = [row for row in rows if not (row['type'] == 'book' and row['receivedUs'] == day_start_us)]
    # Small source-clock leads occur in Monaco. Delay receipt, never backdate
    # execution, and leave larger or unidentified clock discrepancies invalid.
    clock_adjustments = []
    for row in rows:
        source_us = round(row['source'] * 1000)
        lead = source_us - row['receivedUs']
        if lead > 5000:
            raise ValueError('Source timestamp leads receipt by more than 5 ms')
        if lead > 0:
            clock_adjustments.append(lead)
            row['receivedUs'] = source_us
            row['received'] = source_us / 1000
    rows = [row for row in rows if row['receivedUs'] < end_us]
    if not any(row['type'] == 'book' for row in rows):
        raise ValueError('No non-boundary book before the session cutoff')
    if any(row['type'] == 'last_trade_price' for row in rows) and not chain:
        raise ValueError('Trade prints lack independent on-chain records')
    rows.sort(key=lambda row: row['receivedUs'])
    ties = Counter(row['receivedUs'] for row in rows)
    capture = {'sources': [{'file': files[kind]['path'], 'sha256': files[kind]['sha256']}
                           for kind in ('l2', 'trades', 'onchain_fills')
                           if files[kind]['status'] == 'available'],
               'rows': rows, 'historicalCoverageVerified': False,
               'unsequencedSameTimeRows': sum(n for n in ties.values() if n > 1)}
    capture_path = output / f"{driver['driverId']}.capture.json"
    fills_path = output / f"{driver['driverId']}.fills.json"
    capture_path.write_text(json.dumps(capture, separators=(',', ':')) + '\n')
    fills_path.write_text(json.dumps(chain, separators=(',', ':')) + '\n')
    return {'driverId': driver['driverId'], 'name': driver['name'], 'status': 'prepared',
            'capture': str(capture_path), 'fills': str(fills_path), 'events': len(rows),
            'prints': sum(row['type'] == 'last_trade_price' for row in rows),
            'excludedBoundarySnapshots': boundary, 'unsequencedSameTimeRows': capture['unsequencedSameTimeRows'],
            'clockLeadCorrections': len(clock_adjustments), 'maxClockLeadUs': max(clock_adjustments, default=0)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    manifest = json.loads(args.manifest.read_text())
    with Path('data/races.csv').open(newline='') as stream:
        schedules = list(csv.DictReader(stream))
    result = []
    for race in manifest['races']:
        qualifying, race_start, first_practice = schedule(race, schedules)
        days = []
        for day, cutoff in zip(race['dates'], (qualifying, race_start - pd.Timedelta(seconds=59))):
            directory = args.output / race['id'] / day
            directory.mkdir(parents=True)
            drivers = []
            for driver in race['drivers']:
                try:
                    window_start = race_start - pd.Timedelta(hours=3) if day == race['dates'][1] else None
                    drivers.append(prepare_day(driver, day, cutoff, directory, window_start))
                except (ValueError, KeyError, OSError) as error:
                    drivers.append({'driverId': driver['driverId'], 'name': driver['name'],
                                    'status': 'excluded', 'reason': str(error)})
            days.append({'date': day, 'cutoff': cutoff.isoformat(), 'drivers': drivers})
            print(f"{race['id']} {day}: {sum(d['status'] == 'prepared' for d in drivers)} / {len(drivers)} prepared", flush=True)
        result.append({'race': race['id'], 'name': race['name'], 'qualifying': qualifying.isoformat(),
                       'raceStart': race_start.isoformat(), 'firstPractice': first_practice.isoformat(), 'days': days})
    (args.output / 'preparation.json').write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
