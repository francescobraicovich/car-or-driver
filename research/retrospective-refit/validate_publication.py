"""Validate every covariance and state in the retrospective publication fit."""
import hashlib
import json
from pathlib import Path

import numpy as np
from retrospective_refit import POINTS

root = Path('tmp/retrospective-refit')
source = (root / 'boundary-warmup-input.json').read_bytes()
inputs = json.loads(source)
result = json.loads((root / 'publication-refit.json').read_text())
if result['inputSha256'] != hashlib.sha256(source).hexdigest() or len(inputs) != len(result['history']):
    raise ValueError('Retrospective fit does not match its evidence')
years = {}
for index in range(result['offset'], len(inputs) - 1):
    years.setdefault(inputs[index]['date'][:4], []).append(index)
required = {index for indices in years.values() for index in (indices[0], indices[len(indices) // 2], indices[-1])}
if not required.issubset({int(index) for index in result['covariance']}):
    raise ValueError('Retrospective fit is missing an annual uncertainty sample')
minimum = float('inf')
for index in sorted(required):
    block = result['covariance'][str(index)]
    keys = [tuple(key) for key in block['keys']]
    expected = {(kind, str(row[kind])) for row in inputs[index]['entries'] for kind in ('driver', 'car')}
    matrix = np.asarray(block['matrix'])
    if len(keys) != len(expected) or set(keys) != expected or matrix.shape != (3 * len(keys), 3 * len(keys)):
        raise ValueError(f'Invalid covariance keys or shape at weekend {index}')
    if not np.isfinite(matrix).all() or not np.allclose(matrix, matrix.T, atol=1e-10):
        raise ValueError(f'Invalid covariance values at weekend {index}')
    minimum = min(minimum, float(np.linalg.eigvalsh(matrix)[0]))
    if minimum <= 0:
        raise ValueError(f'Covariance is not positive definite at weekend {index}')
    for position, (kind, identity) in enumerate(keys):
        values = result['history'][index][kind][identity]
        sd = block['standardDeviation'][kind][identity]
        expected_sd = np.sqrt(np.diag(matrix)[3 * position:3 * position + 3]) * POINTS
        if not np.isfinite(values).all() or not np.allclose(sd, expected_sd, atol=1e-8):
            raise ValueError(f'Invalid retrospective state at weekend {index}')
print(f"Validated {len(required)} yearly uncertainty samples; minimum covariance eigenvalue {minimum:.6g}")
