"""Verify and summarize every block in a complete covariance build."""
import hashlib
import json
import time
import tempfile
from pathlib import Path

import numpy as np

from retrospective_refit import POINTS

source = Path('tmp/retrospective-refit/result.json')
input_path = Path('tmp/retrospective-refit/input.json')
result = json.loads(source.read_text())
weekends = json.loads(input_path.read_text())
if result.get('inputSha256') is not None and result['inputSha256'] != hashlib.sha256(input_path.read_bytes()).hexdigest():
    raise ValueError('Full fit input fingerprint does not match the export')
if result['weekends'] != len(weekends) or len(result['history']) != len(weekends):
    raise ValueError('Full fit does not match exported history')
if set(result['covariance']) != {str(index) for index in range(len(weekends))}:
    raise ValueError('Full covariance output is missing weekends')
start = time.monotonic()
minimum_eigenvalue = float('inf')
maximum_asymmetry = 0.0
maximum_sd_error = 0.0
maximum_dimension = 0
for index, weekend in enumerate(weekends):
    block = result['covariance'][str(index)]
    keys = [tuple(key) for key in block['keys']]
    matrix = np.asarray(block['matrix'])
    if matrix.shape != (3 * len(keys), 3 * len(keys)) or not np.isfinite(matrix).all():
        raise ArithmeticError(f'Invalid covariance dimensions or values at {index}')
    if set(keys) != {(kind, str(entry[kind])) for entry in weekend['entries'] for kind in ('driver', 'car')}:
        raise ArithmeticError(f'Covariance keys do not match entries at {index}')
    maximum_dimension = max(maximum_dimension, len(matrix))
    maximum_asymmetry = max(maximum_asymmetry, float(np.max(np.abs(matrix - matrix.T))))
    minimum_eigenvalue = min(minimum_eigenvalue, float(np.linalg.eigvalsh(matrix)[0]))
    if minimum_eigenvalue <= 0:
        raise ArithmeticError(f'Covariance is not positive definite at {index}')
    for offset, (kind, identity) in enumerate(keys):
        expected = np.sqrt(np.diag(matrix)[3 * offset:3 * offset + 3]) * POINTS
        actual = block['standardDeviation'][kind][identity]
        maximum_sd_error = max(maximum_sd_error, float(np.max(np.abs(expected - actual))))
if maximum_asymmetry > 1e-10 or maximum_sd_error > 1e-9:
    raise ArithmeticError('Covariance symmetry or standard-deviation mismatch')
verification_seconds = time.monotonic() - start
serialization_start = time.monotonic()
text = json.dumps(result, separators=(',', ':'), allow_nan=False)
serialization_seconds = time.monotonic() - serialization_start
with tempfile.TemporaryFile(mode='w+', encoding='utf8') as temporary:
    write_start = time.monotonic()
    temporary.write(text)
    temporary.flush()
    write_seconds = time.monotonic() - write_start
del text
summary = {'serializationSeconds': serialization_seconds, 'temporaryWriteSeconds': write_seconds,
           'inputSha256': hashlib.sha256(input_path.read_bytes()).hexdigest(),
           'resultSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
           'weekends': len(weekends), 'states': result['states'], 'observations': result['observations'],
           'iterations': result['iterations'], 'maximumGradient': result['maximumGradient'],
           'fitAndExtractionSeconds': result['elapsedSeconds'],
           'outputBytes': source.stat().st_size, 'validationSeconds': verification_seconds,
           'maximumBlockDimension': maximum_dimension, 'minimumBlockEigenvalue': minimum_eigenvalue,
           'maximumAsymmetry': maximum_asymmetry, 'maximumStandardDeviationError': maximum_sd_error,
           'limitations': 'Fit and extraction elapsed time excludes JSON serialization and writing; separate serialization and temporary-file write timings were measured after the run. The build overlapped other validation workloads. Cross-weekend blocks were not included; positive-definite local Laplace matrices are not evidence of real-world calibration.'}
Path('research/retrospective-refit/validation-covariance.json').write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2), flush=True)
