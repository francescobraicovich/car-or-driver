"""Export selected runtime heads and fixed Python/JavaScript parity fixtures."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def value(name, row):
    if name == 'base':
        return row['baseline_pre']
    if name.startswith('tanh('):
        return np.tanh(value(name[5:-1], row))
    return row[name]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results', default='research/current-form/results.json')
    parser.add_argument('--rows', default='tmp/current-form/features.csv')
    parser.add_argument('--output', default='tmp/current-form')
    args = parser.parse_args()
    result = json.loads((ROOT / args.results).read_text())
    selected = result['selected']
    if not selected:
        raise ValueError('No eligible form family: no new heads to export')
    row_path = ROOT / args.rows
    if digest(row_path) != result['rowsSha256']:
        raise ValueError('Feature rows differ from evaluated rows')
    family, heads = selected['family'], selected['heads']
    needed = {'baseline_pre'}
    for bundle in heads.values():
        for head in bundle.values():
            for name in head['names']:
                name = name[5:-1] if name.startswith('tanh(') else name
                needed.add('baseline_pre' if name == 'base' else name)
    with row_path.open(newline='') as source:
        header = next(csv.reader(source))
    columns = ['year', 'session'] + [f'{family}__{name}' for name in sorted(needed)]
    missing = set(columns) - set(header)
    if missing:
        raise ValueError(f'Fixture features missing: {sorted(missing)}')
    frame = pd.read_csv(row_path, usecols=columns, float_precision='round_trip')
    frame = frame.rename(columns={f'{family}__{name}': name for name in needed})
    fixtures = []
    years = [2008, 2012, 2016, 2021, 2026]
    for i, first in enumerate(years):
        last = years[i+1] - 1 if i+1 < len(years) else 2026
        for mode in ('pre', 'post', 'qual', 'grid'):
            subset = frame[frame.year.between(first, last) & frame.session.eq('qual' if mode == 'qual' else 'race')]
            if len(subset) < 24:
                raise ValueError(f'Insufficient fixtures for {first}/{mode}')
            sample = subset.sample(n=24, random_state=1972+first)
            head = heads[str(first)][mode]
            for _, row in sample.iterrows():
                features = {name: float(row[name]) for name in needed}
                x = np.asarray([value(name, features) for name in head['names']], dtype=float)
                x[np.abs(x) < 1e-7] = 0
                z = x.astype(np.float32).astype(float) @ np.asarray(head['coefficients'])
                fixtures.append({'year': first, 'mode': mode, 'features': features,
                                 'expected': float(1 / (1 + np.exp(-np.clip(z, -700, 700))))})
    if len(fixtures) != 480 or digest(row_path) != result['rowsSha256']:
        raise ValueError('Fixture count or feature provenance changed')
    output = ROOT / args.output
    output.mkdir(parents=True, exist_ok=True)
    (output / 'selected-forecast-heads.json').write_text(json.dumps(heads, separators=(',', ':')) + '\n')
    (output / 'selected-inference-fixtures.json').write_text(json.dumps(fixtures, separators=(',', ':')) + '\n')
    print(f'Exported {len(fixtures)} parity fixtures and selected heads')


if __name__ == '__main__':
    main()
