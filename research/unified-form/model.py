"""Slow/fast and external residual candidates using the production likelihood."""
from datetime import date
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'packages/core/python'))
from unified_model import UnifiedModel, POINTS, correlation


class FormModel(UnifiedModel):
    def __init__(self, parameters, form, embedded):
        super().__init__(parameters)
        self.form = dict(form)
        self.embedded = embedded
        self.width = 6 if embedded else 3
        for key in ('half_life_days', 'driver_sd', 'car_sd', 'slow_multiplier'):
            if not np.isfinite(form[key]) or form[key] <= 0:
                raise ValueError('Form parameters must be positive and finite')

    def ensure(self, kind, identity):
        key = (kind, str(identity))
        if key in self.indices:
            return
        start = len(self.mean)
        self.indices[key] = start
        self.mean = np.pad(self.mean, (0, self.width))
        self.covariance = np.pad(self.covariance, ((0, self.width), (0, self.width)))
        sharing = correlation(self.parameters[f'{kind}_correlation'])
        if self.embedded:
            initial = (20 if kind == 'driver' else 50) / POINTS
            self.covariance[start:start + 3, start:start + 3] = initial ** 2 * sharing
        fast = start + self.width - 3
        self.covariance[fast:fast + 3, fast:fast + 3] = (self.form[f'{kind}_sd'] / POINTS) ** 2 * sharing

    def begin(self, weekend):
        day = date.fromisoformat(weekend['date'])
        if day.isoformat() != weekend['date'] or (self.previous_date and day < self.previous_date):
            raise ValueError('Weekends must have chronological ISO dates')
        elapsed = (day - self.previous_date).days if self.previous_date else 0
        retention = 2 ** (-elapsed / self.form['half_life_days'])
        winter = self.previous_date is not None and day.year != self.previous_date.year
        current_cars = {row['car'] for row in weekend['entries']}
        transition = np.ones(len(self.mean))
        for start in self.indices.values():
            transition[start + self.width - 3:start + self.width] = retention
        self.mean *= transition
        self.covariance *= transition[:, None] * transition[None, :]
        for (kind, identity), start in self.indices.items():
            sharing = correlation(self.parameters[f'{kind}_correlation'])
            if self.embedded:
                variance = ((4 * self.parameters['driver_multiplier'] / POINTS) ** 2 * elapsed / 365.25
                            if kind == 'driver' else
                            (9 * (identity in current_cars) + 225 * winter) * (self.parameters['car_multiplier'] / POINTS) ** 2)
                self.covariance[start:start + 3, start:start + 3] += variance * self.form['slow_multiplier'] ** 2 * sharing
            fast = start + self.width - 3
            self.covariance[fast:fast + 3, fast:fast + 3] += (1 - retention ** 2) * (self.form[f'{kind}_sd'] / POINTS) ** 2 * sharing
        for row in weekend['entries']:
            self.ensure('driver', row['driver'])
            self.ensure('car', row['car'])
        self.previous_date = day

    def design(self, rows):
        matrix = super().design(rows)
        if self.embedded:
            for start in self.indices.values():
                matrix[:, start + 3:start + 6] = matrix[:, start:start + 3]
        return matrix


def entity_components(model, kind, identity):
    start = model.indices[(kind, str(identity))]
    if isinstance(model, FormModel) and model.embedded:
        return model.mean[start:start + 3], model.mean[start + 3:start + 6]
    return model.mean[start:start + 3], np.zeros(3)


def state_components(model, entries, external=None):
    result = {}
    for kind in ('driver', 'car'):
        ids = list(dict.fromkeys(row[kind] for row in entries))
        values = []
        for identity in ids:
            slow, fast = entity_components(model, kind, identity)
            if external is not None:
                start = external.indices[(kind, identity)]
                fast = external.mean[start:start + 3]
            values.append(np.r_[slow, fast])
        values = np.array(values)
        values -= values.mean(axis=0)
        result[kind] = {identity: (row * POINTS).tolist() for identity, row in zip(ids, values)}
    return result
