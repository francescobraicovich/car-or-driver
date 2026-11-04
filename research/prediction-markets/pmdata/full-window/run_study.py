"""Reproduce the post-selected 00:00–16:00 UTC portfolio sensitivities."""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PMDATA = ROOT / 'research/prediction-markets/pmdata'
STUDY = PMDATA / 'full-window'
RACES = [('austrian', '2026-06-25'), ('british', '2026-07-02'),
         ('belgian', '2026-07-16'), ('hungarian', '2026-07-23'),
         ('dutch', '2026-08-20'), ('italian', '2026-09-03'), ('singapore', '2026-10-08')]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-retrospective-sensitivity', action='store_true', required=True,
                        help='Acknowledge post-selected windows and unverified inputs')
    parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='pmdata-full-window-', dir=ROOT / 'tmp') as directory:
        rejections = {}
        for race, date in RACES:
            prefix = ROOT / f'tmp/pmdata/{race}-{date}'
            command = [sys.executable, str(PMDATA / 'normalize_portfolio_capture.py'), '--official',
                       str(ROOT / f'research/prediction-markets/polymarket/{race}-2026-official-outcomes.json')]
            for driver in ('norris', 'hamilton'):
                for kind in ('l2', 'trades', 'fills'):
                    source = 'onchain_fills' if kind == 'fills' else kind
                    command.extend((f'--{driver}-{kind}', f'{prefix}-{driver}-{source}.parquet'))
            command.extend(('--start', f'{date}T00:00:00Z', '--end', f'{date}T16:00:00Z',
                            '--output', f'{directory}/{race}-capture.json', '--output-fills', f'{directory}/{race}-fills.json'))
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            if result.returncode:
                if 'Dynamic tick size is not supported by the replay' not in result.stderr:
                    raise RuntimeError(f'{race} normalization failed: {result.stderr}')
                rejections[race] = 'Dynamic tick size is not supported by the replay'
                print(f'{race}: excluded; unsupported recorded tick-size change')
            else:
                print(f'{race}: {result.stdout.strip()}')
        (Path(directory) / 'rejections.json').write_text(json.dumps(rejections) + '\n')
        env = {**os.environ, 'PMDATA_NORMALIZED_DIRECTORY': directory}
        command = ['node', str(STUDY / 'run_portfolio.mjs'), '--allow-unverified-feed',
                   '--assume-retrospective-vintage', '--assume-closed-time-redemption']
        results = {}
        for seconds in (60, 240):
            extra = ['--allow-240-second-source-age'] if seconds == 240 else []
            results[seconds] = subprocess.run(command + extra, cwd=ROOT, env=env, check=True,
                                               capture_output=True, text=True).stdout
        for seconds, result in results.items():
            (STUDY / f'results-{seconds}s.json').write_text(result)
        print('Wrote the 60-second and post-observation 240-second sensitivities.')


if __name__ == '__main__':
    main()
