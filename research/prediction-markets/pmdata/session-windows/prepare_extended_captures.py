"""Prepare distinct pre-qualifying, post-qualifying, and pre-race captures offline."""

import argparse
import csv
import importlib.util
import json
from collections import Counter
from pathlib import Path

import pandas as pd

SOURCE = Path(__file__).with_name('prepare_captures.py')
SPEC = importlib.util.spec_from_file_location('session_capture', SOURCE)
SESSION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SESSION)


def prepare_window(driver, day, start, cutoff, output):
    """Reuse the session normalizer and reject exact end-of-day boundary books."""
    result = SESSION.prepare_day(driver, day, cutoff, output, window_start=start)
    path = Path(result['capture'])
    capture = json.loads(path.read_text())
    boundary_us = SESSION.micros(pd.Timestamp(day, tz='UTC') + pd.Timedelta(days=1)) - 1
    boundary = sum(row['type'] == 'book' and row['receivedUs'] == boundary_us for row in capture['rows'])
    capture['rows'] = [row for row in capture['rows']
                       if not (row['type'] == 'book' and row['receivedUs'] == boundary_us)]
    if not any(row['type'] == 'book' for row in capture['rows']):
        path.unlink()
        Path(result['fills']).unlink()
        raise ValueError('No non-boundary book before the session cutoff')
    counts = Counter(row['receivedUs'] for row in capture['rows'])
    capture['unsequencedSameTimeRows'] = sum(count for count in counts.values() if count > 1)
    path.write_text(json.dumps(capture, separators=(',', ':')) + '\n')
    result['events'] = len(capture['rows'])
    result['unsequencedSameTimeRows'] = capture['unsequencedSameTimeRows']
    result['excludedEndBoundarySnapshots'] = boundary
    return result


def prepare_session(race, day, start, cutoff, output):
    output.mkdir(parents=True)
    drivers = []
    for driver in race['drivers']:
        try:
            drivers.append(prepare_window(driver, day, start, cutoff, output))
        except (ValueError, KeyError, OSError) as error:
            drivers.append({'driverId': driver['driverId'], 'name': driver['name'],
                            'status': 'excluded', 'reason': str(error)})
    print(f"{race['id']} {start.isoformat()}–{cutoff.isoformat()}: "
          f"{sum(driver['status'] == 'prepared' for driver in drivers)} / {len(drivers)} prepared", flush=True)
    return {'date': day, 'windowStart': start.isoformat(), 'cutoff': cutoff.isoformat(), 'drivers': drivers}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='New output directory')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    manifest = json.loads(args.manifest.read_text())
    with Path('data/races.csv').open(newline='') as stream:
        schedules = list(csv.DictReader(stream))
    result = []
    for race in manifest['races']:
        qualifying, race_start, first_practice = SESSION.schedule(race, schedules)
        qualifying_day, race_day = race['dates']
        midnight = pd.Timestamp(qualifying_day, tz='UTC')
        day_end = midnight + pd.Timedelta(days=1)
        resume = qualifying + pd.Timedelta(hours=3)
        race_window = race_start - pd.Timedelta(hours=3)
        race_cutoff = race_start - pd.Timedelta(seconds=59)
        if not qualifying < resume < day_end <= race_window < race_cutoff:
            raise ValueError('Qualifying, publication buffer and race windows do not form distinct intervals')
        directory = args.output / race['id']
        early = prepare_session(race, qualifying_day, midnight, qualifying, directory / 'pre-qualifying')
        later = prepare_session(race, qualifying_day, resume, day_end, directory / 'post-qualifying')
        final = prepare_session(race, race_day, race_window, race_cutoff, directory / 'pre-race')
        result.append({'race': race['id'], 'name': race['name'], 'qualifying': qualifying.isoformat(),
                       'postQualifying': resume.isoformat(), 'raceStart': race_start.isoformat(),
                       'firstPractice': first_practice.isoformat(), 'days': [early, final],
                       'qualifyingPost': later})
    (args.output / 'preparation.json').write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
