"""Measure compact lossless/float32 representations of the full refit artifact."""
import gzip
import hashlib
import json
import time
from pathlib import Path

import numpy as np
from retrospective_refit import POINTS

root = Path('tmp/retrospective-refit')
source = root / 'result.json'
start = time.monotonic()
original = source.read_bytes()
result = json.loads(original)
input_path = root / 'input.json'
weekends = json.loads(input_path.read_text())
if len(weekends) != len(result['history']):
    raise ValueError('Input and fitted history lengths differ')
if len(result['history']) != len(result['covariance']) or result['crossCovariance']:
    raise ValueError('Expected the complete within-weekend covariance result without cross-weekend blocks')
compressed_start = time.monotonic()
compressed = gzip.compress(original, compresslevel=6, mtime=0)
plain_gzip_seconds = time.monotonic() - compressed_start
if gzip.decompress(compressed) != original:
    raise ArithmeticError('Gzip round trip failed')
(root / 'artifact-full.json.gz').write_bytes(compressed)
del compressed, original

metadata = {'format': 'retrospective-packed-f32-research-v1',
            'weekends': [{'raceId': weekend['raceId'], 'date': weekend['date']} for weekend in weekends],
            'inputSha256': hashlib.sha256(input_path.read_bytes()).hexdigest(),
            'history': result['history'],
            'modelMetadata': {key: value for key, value in result.items() if key not in ('history', 'covariance', 'crossCovariance')},
            'blocks': []}
segments = []
minimum_eigenvalue = float('inf')
maximum_element_error = maximum_sd_error = maximum_gap_sd_error = 0.0
maximum_gap_relative_error = 0.0
maximum_package_sd_error = 0.0
maximum_package_relative_error = 0.0
start_pack = time.monotonic()
for index in range(len(result['history'])):
    block = result['covariance'][str(index)]
    matrix = np.asarray(block['matrix'], dtype=np.float64)
    n = len(matrix)
    indices = np.triu_indices(n)
    segment = np.asarray(matrix[indices], dtype='<f4')
    restored = np.zeros((n, n), dtype=np.float64)
    restored[indices] = segment
    restored[(indices[1], indices[0])] = segment
    minimum_eigenvalue = min(minimum_eigenvalue, float(np.linalg.eigvalsh(restored)[0]))
    if minimum_eigenvalue <= 0:
        raise ArithmeticError(f'Quantized covariance is not positive definite at {index}')
    maximum_element_error = max(maximum_element_error, float(np.max(np.abs(restored - matrix))))
    old_diag, new_diag = np.diag(matrix), np.diag(restored)
    maximum_sd_error = max(maximum_sd_error, float(np.max(np.abs(np.sqrt(old_diag) - np.sqrt(new_diag))) * POINTS))
    old_gap = np.sqrt(np.maximum(0, old_diag[:, None] + old_diag[None, :] - 2 * matrix)) * POINTS
    new_gap = np.sqrt(np.maximum(0, new_diag[:, None] + new_diag[None, :] - 2 * restored)) * POINTS
    maximum_gap_sd_error = max(maximum_gap_sd_error, float(np.max(np.abs(old_gap - new_gap))))
    eligible = old_gap > 1
    if eligible.any():
        maximum_gap_relative_error = max(maximum_gap_relative_error, float(np.max(np.abs(old_gap[eligible] - new_gap[eligible]) / old_gap[eligible])))
    key_positions = {tuple(key): i * 3 for i, key in enumerate(block['keys'])}
    entries = weekends[index]['entries']
    selections = np.array([[key_positions[('driver', str(a['driver']))], key_positions[('driver', str(b['driver']))],
                            key_positions[('car', str(a['car']))], key_positions[('car', str(b['car']))]]
                           for first, a in enumerate(entries) for b in entries[first + 1:]], dtype=int)
    if len(selections):
        signs = np.array([1, -1, 1, -1])
        for channel in range(3):
            positions = selections + channel
            old_var = np.einsum('i,nij,j->n', signs, matrix[positions[:, :, None], positions[:, None, :]], signs)
            new_var = np.einsum('i,nij,j->n', signs, restored[positions[:, :, None], positions[:, None, :]], signs)
            if np.min(old_var) < -1e-10 or np.min(new_var) < -1e-10:
                raise ArithmeticError('Negative package-gap variance')
            old_sd = np.sqrt(np.maximum(0, old_var)) * POINTS
            new_sd = np.sqrt(np.maximum(0, new_var)) * POINTS
            maximum_package_sd_error = max(maximum_package_sd_error, float(np.max(np.abs(old_sd - new_sd))))
            eligible = old_sd > 1
            if eligible.any():
                maximum_package_relative_error = max(maximum_package_relative_error, float(np.max(np.abs(old_sd[eligible] - new_sd[eligible]) / old_sd[eligible])))
    metadata['blocks'].append({'keys': block['keys'], 'offset': sum(len(value) for value in segments), 'length': len(segment)})
    segments.append(segment)
packed = np.concatenate(segments)
packing_seconds = time.monotonic() - start_pack
compress_start = time.monotonic()
packed_bytes = packed.tobytes()
packed_gzip = gzip.compress(packed_bytes, compresslevel=6, mtime=0)
meta_bytes = json.dumps(metadata, separators=(',', ':'), allow_nan=False).encode()
meta_gzip = gzip.compress(meta_bytes, compresslevel=6, mtime=0)
compact_compression_seconds = time.monotonic() - compress_start
if gzip.decompress(packed_gzip) != packed_bytes or json.loads(gzip.decompress(meta_gzip)) != metadata:
    raise ArithmeticError('Packed representation round trip failed')
(root / 'artifact-covariance-f32.bin.gz').write_bytes(packed_gzip)
(root / 'artifact-metadata.json.gz').write_bytes(meta_gzip)
summary = {'inputSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'weekends': len(metadata['blocks']),
           'originalJsonBytes': source.stat().st_size, 'gzipJsonBytes': (root / 'artifact-full.json.gz').stat().st_size,
           'gzipJsonSeconds': plain_gzip_seconds, 'packedF32Bytes': len(packed_bytes), 'packedF32GzipBytes': len(packed_gzip),
           'metadataJsonBytes': len(meta_bytes), 'metadataGzipBytes': len(meta_gzip),
           'compactGzipTotalBytes': len(meta_gzip) + len(packed_gzip), 'packingAndVerificationSeconds': packing_seconds,
           'compactCompressionSeconds': compact_compression_seconds, 'minimumQuantizedEigenvalue': minimum_eigenvalue,
           'maximumCovarianceErrorLatentSquared': maximum_element_error, 'maximumMarginalSdErrorPoints': maximum_sd_error,
           'maximumGapSdErrorPoints': maximum_gap_sd_error, 'maximumRelativeGapSdErrorAboveOnePoint': maximum_gap_relative_error,
           'maximumPackageGapSdErrorPoints': maximum_package_sd_error, 'maximumRelativePackageGapSdErrorAboveOnePoint': maximum_package_relative_error,
           'totalSeconds': time.monotonic() - start,
           'limitations': 'Research encoding: float32 upper triangles omit symmetric duplicates and marginal SDs are derived. No cross-weekend covariance was in the source; the encoding includes race IDs and dates but lacks the published site model’s names, hazards and other metadata. All full-history covariance blocks were checked for positive definiteness and within-weekend scalar-gap and driver-plus-car package-gap errors. This is not a production format; browser decoding, delivery, compatibility, model changes and out-of-sample error bounds are not yet tested. Baseline is raw local JSON, not actual network transfer size.'}
Path('research/retrospective-refit/benchmark-artifact.json').write_text(json.dumps(summary, indent=2, allow_nan=False))
print(json.dumps(summary, indent=2), flush=True)
