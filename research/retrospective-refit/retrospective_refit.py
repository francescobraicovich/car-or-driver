"""Joint maximum-posterior fit of the existing model's complete history.

Research prototype: joint modes and selected local Laplace covariance blocks.
It does not produce a forecast state. Latent states are retained only when an entity appears;
Gaussian increments between appearances are integrated analytically.
"""
from datetime import date
import sys
import time
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix, diags
from scipy.sparse.linalg import splu, spsolve

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'packages/core/python'))
from unified_model import DEFAULTS, POINTS, TIME_UNIT, correlation, measurement_terms, UnifiedModel


def fit_history(weekends, parameters=None, maxiter=40, covariance_weekends=(), covariance_pairs=(), initial_sd=None, progress=None, rhs_batch_size=8, permutation='COLAMD'):
    if not isinstance(rhs_batch_size, int) or isinstance(rhs_batch_size, bool) or rhs_batch_size <= 0:
        raise ValueError('Right-hand-side batch size must be a positive integer')
    if permutation not in ('COLAMD', 'MMD_AT_PLUS_A', 'MMD_ATA', 'NATURAL'):
        raise ValueError('Unsupported sparse permutation')
    covariance_weekends = list(covariance_weekends)
    covariance_pairs = list(covariance_pairs)
    if any(not isinstance(pair, (tuple, list)) or len(pair) != 2 or
           any(not isinstance(index, int) or index < 0 or index >= len(weekends) for index in pair) or
           pair[0] >= pair[1] for pair in covariance_pairs):
        raise ValueError('Covariance pairs must be distinct increasing weekend indices in range')
    covariance_pairs = [tuple(pair) for pair in covariance_pairs]
    if len(set(covariance_pairs)) != len(covariance_pairs):
        raise ValueError('Covariance pairs must be unique')
    if any(not isinstance(index, int) or index < 0 or index >= len(weekends) for index in covariance_weekends):
        raise ValueError('Covariance weekend indices must be in range')
    if len(set(covariance_weekends)) != len(covariance_weekends):
        raise ValueError('Covariance weekend indices must be unique')
    if initial_sd is None:
        initial_sd = {'driver': 20, 'car': 50}
    if set(initial_sd) != {'driver', 'car'} or any(not np.isfinite(value) or value <= 0 for value in initial_sd.values()):
        raise ValueError('Initial standard deviations must be positive for driver and car')
    parameters = {**DEFAULTS, **(parameters or {})}
    # Reuse the production parameter validation.
    UnifiedModel(parameters)
    if not weekends:
        raise ValueError('At least one weekend is required')
    coordinates, transitions, snapshots = {}, [], []
    previous_date = None
    pending = {}
    for weekend in weekends:
        day = date.fromisoformat(weekend['date'])
        if day.isoformat() != weekend['date'] or (previous_date and day < previous_date):
            raise ValueError('Weekends must have chronological ISO dates')
        elapsed = (day - previous_date).days / 365.25 if previous_date else 0
        winter = previous_date is not None and day.year != previous_date.year
        current_cars = {str(row['car']) for row in weekend['entries']}
        for (kind, identity) in coordinates:
            if kind == 'driver':
                increment = (4 * parameters['driver_multiplier'] / POINTS) ** 2 * elapsed
            else:
                increment = ((9 if identity in current_cars else 0) + (225 if winter else 0)) * (parameters['car_multiplier'] / POINTS) ** 2
            pending[(kind, identity)] += increment
        current = {}
        for row in weekend['entries']:
            for kind in ('driver', 'car'):
                key = (kind, str(row[kind]))
                if key in current:
                    continue
                old = coordinates.get(key)
                variance = pending.get(key, 0)
                if old is None or variance > 0:
                    index = len(transitions)
                    initial = (initial_sd[kind] / POINTS) ** 2
                    transitions.append((kind, old, initial if old is None else variance))
                    coordinates[key] = index
                    pending[key] = 0
                current[key] = coordinates[key]
        snapshots.append(current)
        previous_date = day

    dimension = 3 * len(transitions)
    prior_rows, prior_cols, prior_values = [], [], []
    for index, (kind, previous, variance) in enumerate(transitions):
        precision = np.linalg.inv(correlation(parameters[kind + '_correlation'])) / variance
        for a in range(3):
            for b in range(3):
                for left, right, sign in ((index, index, 1), (previous, previous, 1),
                                          (index, previous, -1), (previous, index, -1)):
                    if left is not None and right is not None:
                        prior_rows.append(3 * left + a)
                        prior_cols.append(3 * right + b)
                        prior_values.append(sign * precision[a, b])
    precision = coo_matrix((prior_values, (prior_rows, prior_cols)), shape=(dimension, dimension)).tocsr()
    design_rows, design_cols, design_values = [], [], []
    targets, channels, weights, scales = [], [], [], []
    for weekend, snapshot in zip(weekends, snapshots):
        seen = set()
        for row in weekend['observations']:
            channel = row['channel']
            identity = (min(str(row['a']), str(row['b'])), max(str(row['a']), str(row['b'])), channel)
            if channel not in (0, 1, 2) or row['a'] == row['b'] or identity in seen:
                raise ValueError('Invalid or duplicate comparison')
            seen.add(identity)
            if not np.isfinite(row['target']) or not np.isfinite(row['weight']) or row['weight'] <= 0:
                raise ValueError('Invalid observation value or weight')
            if channel == 2 and row['target'] not in (0, 1):
                raise ValueError('Order must be binary')
            for kind, entity, sign in (('driver', row['a'], 1), ('driver', row['b'], -1),
                                       ('car', row['ca'], 1), ('car', row['cb'], -1)):
                design_rows.append(len(targets))
                design_cols.append(3 * snapshot[(kind, str(entity))] + channel)
                design_values.append(sign)
            targets.append(row['target'] / TIME_UNIT if channel < 2 else row['target'])
            channels.append(channel)
            weights.append(row['weight'])
            scales.append(parameters['noise'][channel] if channel < 2 else 1)
    design = coo_matrix((design_values, (design_rows, design_cols)), shape=(len(targets), dimension)).tocsr()
    targets, channels, weights, scales = map(np.asarray, (targets, channels, weights, scales))

    def objective(values):
        prior = precision @ values
        loss, gradient, _ = measurement_terms(design @ values, targets, channels, scales)
        return float(values @ prior / 2 + weights @ loss), prior + design.T @ (weights * gradient)

    values = np.zeros(dimension)
    for iteration in range(maxiter):
        loss, gradient = objective(values)
        if np.max(np.abs(gradient)) < 1e-6:
            break
        _, _, curvature = measurement_terms(design @ values, targets, channels, scales)
        hessian = precision + design.T @ diags(weights * curvature) @ design
        step = spsolve(hessian.tocsc(), gradient, permc_spec=permutation)
        if not np.isfinite(step).all():
            raise ArithmeticError('Invalid joint-fit Newton step')
        scale = 1.0
        while scale > 2 ** -25 and objective(values - scale * step)[0] > loss + 1e-12:
            scale /= 2
        values -= scale * step
    else:
        raise ArithmeticError(f'Joint fit did not converge; gradient {np.max(np.abs(gradient)):.6g}')
    history = []
    for snapshot in snapshots:
        history.append({kind: {identity: (values[3 * index:3 * index + 3] * POINTS).tolist()
                               for (entity_kind, identity), index in snapshot.items() if entity_kind == kind}
                        for kind in ('driver', 'car')})
    covariance, cross_covariance = {}, {}
    solver_diagnostics = {}
    if covariance_weekends or covariance_pairs:
        # Conditional local Laplace covariance: inverse Hessian at the joint mode.
        # Extract only requested blocks, avoiding a dense full-history inverse.
        _, _, curvature = measurement_terms(design @ values, targets, channels, scales)
        hessian = (precision + design.T @ diags(weights * curvature) @ design).tocsc()
        factor_start = time.monotonic()
        factor = splu(hessian, permc_spec=permutation)
        solver_diagnostics = {'permutation': permutation, 'rhsBatchSize': rhs_batch_size,
                              'factorizationSeconds': time.monotonic() - factor_start,
                              'factorNonzeros': factor.L.nnz + factor.U.nnz}
        extraction_start = time.monotonic()

        def indices_for(weekend_index):
            snapshot = snapshots[weekend_index]
            keys = list(snapshot)
            positions = np.array([3 * snapshot[key] + channel for key in keys for channel in range(3)])
            return keys, positions

        def extract(rows, columns):
            block = np.empty((len(rows), len(columns)))
            for start in range(0, len(columns), rhs_batch_size):
                positions = columns[start:start + rhs_batch_size]
                rhs = np.zeros((dimension, len(positions)))
                rhs[positions, np.arange(len(positions))] = 1
                block[:, start:start + len(positions)] = factor.solve(rhs)[rows, :]
            if not np.isfinite(block).all():
                raise ArithmeticError('Invalid joint-fit covariance')
            return block

        for completed, weekend_index in enumerate(covariance_weekends, 1):
            keys, indices = indices_for(weekend_index)
            block = extract(indices, indices)
            block = (block + block.T) / 2
            if len(indices) and np.min(np.diag(block)) <= 0:
                raise ArithmeticError('Invalid joint-fit covariance')
            deviations = np.sqrt(np.diag(block)).reshape(-1, 3) * POINTS
            standard_deviation = {kind: {identity: deviations[i].tolist()
                                         for i, (entity_kind, identity) in enumerate(keys) if entity_kind == kind}
                                  for kind in ('driver', 'car')}
            covariance[weekend_index] = {'keys': [list(key) for key in keys], 'matrix': block.tolist(),
                                         'standardDeviation': standard_deviation}
            if progress is not None:
                progress(completed, len(covariance_weekends))
        for first, second in covariance_pairs:
            first_keys, first_indices = indices_for(first)
            second_keys, second_indices = indices_for(second)
            cross_covariance[f'{first}:{second}'] = {
                'firstKeys': [list(key) for key in first_keys], 'secondKeys': [list(key) for key in second_keys],
                'matrix': extract(first_indices, second_indices).tolist()}
        solver_diagnostics['extractionSeconds'] = time.monotonic() - extraction_start
    return {'history': history, 'solverDiagnostics': solver_diagnostics, 'covariance': covariance, 'crossCovariance': cross_covariance, 'objective': float(loss),
            'maximumGradient': float(np.max(np.abs(gradient))), 'iterations': iteration,
            'states': dimension, 'observations': len(targets)}
