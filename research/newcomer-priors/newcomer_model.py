"""Research-only conditional entry priors; none passed production validation."""
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'packages/core/python'))
from unified_model import UnifiedModel, POINTS, correlation


class NewcomerModel(UnifiedModel):
    def __init__(self, parameters=None):
        super().__init__(parameters)
        offsets = self.parameters.get('newcomer_offsets')
        if offsets is not None:
            if not isinstance(offsets, dict) or set(offsets) != {'driver', 'car'}:
                raise ValueError('Newcomer offsets must specify drivers and cars')
            for values in offsets.values():
                if np.shape(values) != (3,) or not np.isfinite(values).all():
                    raise ValueError('Each newcomer offset must contain three finite point values')
        deviations = self.parameters.get('newcomer_sd')
        if deviations is not None:
            if offsets is None or not isinstance(deviations, dict) or set(deviations) != {'driver', 'car'}:
                raise ValueError('Newcomer deviations require driver and car offsets')
            if any(not np.isfinite(value) or value <= 0 for value in deviations.values()):
                raise ValueError('Newcomer deviations must be positive and finite')

    def begin(self, weekend):
        known = set(self.indices)
        references = {kind: [self.indices[(kind, identity)] for identity in sorted({str(row[kind]) for row in weekend['entries']})
                             if (kind, identity) in known] for kind in ('driver', 'car')}
        super().begin(weekend)
        offsets = self.parameters.get('newcomer_offsets')
        if offsets is None:
            return
        for key, start in self.indices.items():
            kind, _ = key
            if key in known or not references[kind]:
                continue
            positions = np.array(references[kind])[:, None] + np.arange(3)
            self.mean[start:start + 3] = self.mean[positions].mean(axis=0) + np.asarray(offsets[kind]) / POINTS
            cross = self.covariance[positions].mean(axis=0)
            variance = cross[:, positions].mean(axis=1)
            cross[:, start:start + 3] = 0
            self.covariance[start:start + 3, :] = cross
            self.covariance[:, start:start + 3] = cross.T
            sd = self.parameters.get('newcomer_sd', {}).get(kind, 20 if kind == 'driver' else 50) / POINTS
            self.covariance[start:start + 3, start:start + 3] = variance + sd ** 2 * correlation(self.parameters[f'{kind}_correlation'])
