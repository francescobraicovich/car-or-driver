"""Prepare fixed four-driver captures from local PMData files, without network access."""

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
RACES = [('canadian', '2026-05-21'), ('monaco', '2026-06-04'), ('barcelona', '2026-06-11'),
         ('austrian', '2026-06-25'), ('british', '2026-07-02'),
         ('belgian', '2026-07-16'), ('hungarian', '2026-07-23'),
         ('dutch', '2026-08-20'), ('italian', '2026-09-03'), ('singapore', '2026-10-08')]
DRIVERS = ('norris', 'piastri', 'hamilton', 'leclerc')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New directory for normalized captures')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    results = []
    for race, day in RACES:
        capture = args.output / f'{race}-capture.json'
        fills = args.output / f'{race}-fills.json'
        official = ROOT / f'research/prediction-markets/pmdata/optimization/{race}-official-outcomes.json'
        command = [sys.executable, str(ROOT / 'research/prediction-markets/pmdata/normalize_portfolio_capture.py'),
                   '--official', str(official), '--drivers', *DRIVERS, '--allow-inactive-markets']
        if race == 'barcelona':
            # The window audit found a relevant chain transaction absent from
            # this driver's PMData trade file; never quote this market here.
            command.extend(['--inactive-driver', 'leclerc'])
        for driver in DRIVERS:
            for kind in ('l2', 'trades', 'fills'):
                suffix = 'onchain_fills' if kind == 'fills' else kind
                path = ROOT / f'tmp/pmdata/{race}-{day}-{driver}-{suffix}.parquet'
                command.extend([f'--{driver}-{kind}', str(path)])
        command.extend(['--start', f'{day}T14:00:00Z', '--end', f'{day}T16:00:00Z',
                        '--output', str(capture), '--output-fills', str(fills)])
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(f'{race}: normalization failed: {result.stderr.strip()}')
        inactive = json.loads(capture.read_text()).get('inactiveMarkets', [])
        results.append({'race': race, 'status': 'prepared', 'note': result.stdout.strip(),
                        'inactiveMarkets': inactive})
        print(f'{race}: {results[-1]["status"]}', flush=True)
    (args.output / 'preparation.json').write_text(json.dumps(results, indent=2) + '\n')


if __name__ == '__main__':
    main()
