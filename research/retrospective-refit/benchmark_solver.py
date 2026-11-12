"""Compare sparse ordering and multi-right-hand-side solve widths, with time limits."""
import hashlib
import json
import multiprocessing as mp
import time
from pathlib import Path

import numpy as np
from retrospective_refit import fit_history

SOURCE = Path('tmp/retrospective-refit/input.json')
INDICES = [0, 30, 60, 119]


def worker(connection, permutation, batch):
    try:
        weekends = json.loads(SOURCE.read_text())[:120]
        settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
        start = time.monotonic()
        fit = fit_history(weekends, settings, covariance_weekends=INDICES, rhs_batch_size=batch, permutation=permutation)
        arrays = [np.asarray(fit['covariance'][index]['matrix']) for index in INDICES]
        ratings = np.array([value for index in INDICES for kind in ('driver', 'car')
                            for values in fit['history'][index][kind].values() for value in values])
        connection.send({'elapsedSeconds': time.monotonic() - start, 'iterations': fit['iterations'],
                         'maximumGradient': fit['maximumGradient'], 'solverDiagnostics': fit['solverDiagnostics'],
                         'matrices': arrays, 'ratings': ratings})
    except Exception as error:
        connection.send({'error': str(error)})
    finally:
        connection.close()


def run():
    cases = [('COLAMD', 8), ('COLAMD', 32), ('MMD_AT_PLUS_A', 8)]
    results, reference = [], None
    for permutation, batch in cases:
        parent, child = mp.Pipe(duplex=False)
        process = mp.Process(target=worker, args=(child, permutation, batch))
        start = time.monotonic()
        process.start()
        child.close()
        if not parent.poll(90):
            process.terminate()
            process.join()
            results.append({'permutation': permutation, 'rhsBatchSize': batch, 'timedOutAfterSeconds': 90})
            print(f'Timed out {permutation}, batch {batch} after 90s', flush=True)
            continue
        result = parent.recv()
        process.join()
        if 'error' in result or process.exitcode != 0:
            raise RuntimeError(f'Solver benchmark failed: {result}')
        if reference is None:
            reference = result
        matrix_error = max(float(np.max(np.abs(a - b))) for a, b in zip(result['matrices'], reference['matrices']))
        rating_error = float(np.max(np.abs(result['ratings'] - reference['ratings'])))
        if matrix_error > 1e-7 or rating_error > 1e-3:
            raise ArithmeticError('Solver variant does not match baseline')
        results.append({'permutation': permutation, 'rhsBatchSize': batch, 'elapsedSeconds': result['elapsedSeconds'],
                        'processWallSeconds': time.monotonic() - start, 'iterations': result['iterations'],
                        'maximumGradient': result['maximumGradient'], 'maximumRatingDifferencePoints': rating_error,
                        'maximumCovarianceDifference': matrix_error, **result['solverDiagnostics']})
        print(f'Completed {permutation}, batch {batch}: {result["elapsedSeconds"]:.1f}s', flush=True)
    output = {'inputSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'weekends': 120, 'covarianceIndices': INDICES,
              'results': results, 'limitations': 'Single-run exploratory timings on the first 120 weekends, with a 90-second limit per case. Full-history runtime and peak memory require separate measurement; solver output is checked on four selected blocks.'}
    Path('research/retrospective-refit/benchmark-solver.json').write_text(json.dumps(output, indent=2, allow_nan=False))
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    run()
