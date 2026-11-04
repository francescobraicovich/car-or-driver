"""Reproduce the explicitly conditional PMData race portfolio sensitivities."""

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STUDY = ROOT / 'research/prediction-markets/pmdata'
RACES = [('austrian', '2026-06-25'), ('british', '2026-07-02'),
         ('belgian', '2026-07-16'), ('hungarian', '2026-07-23'),
         ('dutch', '2026-08-20'), ('italian', '2026-09-03'), ('singapore', '2026-10-08')]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-retrospective-sensitivity', action='store_true', required=True,
                        help='Acknowledge unverified feeds, retrospective model and settlement assumptions')
    parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='pmdata-normalized-', dir=ROOT / 'tmp') as directory:
        for race, date in RACES:
            prefix = ROOT / f'tmp/pmdata/{race}-{date}'
            command = [sys.executable, str(STUDY / 'normalize_portfolio_capture.py'), '--official',
                       str(ROOT / f'research/prediction-markets/polymarket/{race}-2026-official-outcomes.json')]
            for driver in ('norris', 'hamilton'):
                for kind in ('l2', 'trades', 'fills'):
                    source = 'onchain_fills' if kind == 'fills' else kind
                    command.extend((f'--{driver}-{kind}', f'{prefix}-{driver}-{source}.parquet'))
            command.extend(('--start', f'{date}T14:00:00Z', '--end', f'{date}T16:00:00Z',
                            '--output', f'{directory}/{race}-capture.json', '--output-fills', f'{directory}/{race}-fills.json'))
            subprocess.run(command, cwd=ROOT, check=True)
        env = {**os.environ, 'PMDATA_NORMALIZED_DIRECTORY': directory}
        common = ['node', str(STUDY / 'run_conditional_portfolio.mjs'), '--allow-unverified-feed',
                  '--assume-retrospective-vintage', '--assume-closed-time-redemption']
        outputs = {}
        for age in (60, 120):
            extra = ['--allow-120-second-source-age'] if age == 120 else []
            outputs[age] = subprocess.run(common + extra, cwd=ROOT, env=env, check=True,
                                          capture_output=True, text=True).stdout
        for age, result in outputs.items():
            (STUDY / f'portfolio-sensitivity-{age}s.json').write_text(result)
        print('Wrote 60-second and post-observation 120-second conditional sensitivity results.')


if __name__ == '__main__':
    main()
