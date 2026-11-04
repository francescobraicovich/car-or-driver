"""Assert when cell-balanced and equal-move frozen scores are equivalent."""
import argparse
import hashlib
import json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--frozen', default='tmp/current-form/frozen.csv')
parser.add_argument('--metadata', default='tmp/current-form/metadata.json')
args = parser.parse_args()
path = ROOT / args.frozen
metadata = json.loads((ROOT / args.metadata).read_text())
expected = metadata['files']['frozen']
if path.resolve() != (ROOT / expected['path']).resolve() or hashlib.sha256(path.read_bytes()).hexdigest() != expected['sha256']:
    raise ValueError('Frozen mover export provenance differs')
frame = pd.read_csv(path, usecols=['move_key', 'year', 'session', 'horizon'])
if len(frame) != expected['rows']:
    raise ValueError('Frozen mover export row count differs')
frame = frame[frame.year.between(2008, 2025)]
if frame.move_key.isna().any():
    raise ValueError('Missing move identity')
expected_cells = {('race', 5), ('race', 10), ('qual', 5), ('qual', 10)}
for key, rows in frame.groupby('move_key'):
    cells = set(zip(rows.session, rows.horizon))
    if cells != expected_cells or rows.year.nunique() != 1:
        raise ValueError(f'Move {key} has unequal cell coverage or inconsistent move years')
if frame.move_key.nunique() != 51:
    raise ValueError('Frozen mover cohort differs from the verified 51 moves')
print('All 51 historical moves cover all four cells; equal-cell and equal-move scores and their move/season resamples are equivalent.')
