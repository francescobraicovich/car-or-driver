"""Reproduce the post-observation wider-window feasibility check offline."""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'research/prediction-markets/pmdata'
DESTINATION = BASE / 'optimization/wider-holdout-results.json'
DRIVERS = ('norris', 'piastri', 'hamilton', 'leclerc')


def main():
    with tempfile.TemporaryDirectory(prefix='pmdata-wider-holdout-', dir=ROOT / 'tmp') as directory:
        for race, day in (('italian', '2026-09-03'), ('singapore', '2026-10-08')):
            command = [sys.executable, str(BASE / 'normalize_portfolio_capture.py'), '--official',
                       str(BASE / f'optimization/{race}-official-outcomes.json'), '--drivers', *DRIVERS,
                       '--allow-inactive-markets']
            for driver in DRIVERS:
                for kind in ('l2', 'trades', 'fills'):
                    suffix = 'onchain_fills' if kind == 'fills' else kind
                    path = ROOT / f'tmp/pmdata/{race}-{day}-{driver}-{suffix}.parquet'
                    command.extend((f'--{driver}-{kind}', str(path)))
            command.extend(('--start', f'{day}T00:00:00Z', '--end', f'{day}T16:00:00Z',
                            '--output', f'{directory}/{race}-capture.json', '--output-fills', f'{directory}/{race}-fills.json'))
            subprocess.run(command, cwd=ROOT, check=True)
        env = {**os.environ, 'PMDATA_NORMALIZED_DIRECTORY': directory}
        command = ['node', str(BASE / 'optimization/wider_holdout.mjs'), '--allow-unverified-feed',
                   '--assume-retrospective-vintage', '--assume-closed-time-redemption']
        result = subprocess.run(command, cwd=ROOT, env=env, check=True, capture_output=True, text=True)
        DESTINATION.write_text(result.stdout)
    print('Wrote the post-observation wider-window feasibility results.')


if __name__ == '__main__':
    main()
