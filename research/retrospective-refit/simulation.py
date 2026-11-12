"""Exploratory driver-gap recovery in the existing simulated worlds."""
import json
import sys
from pathlib import Path

import numpy as np

from retrospective_refit import POINTS, UnifiedModel, fit_history
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'unified-ratings'))
from simulation import world

settings = json.loads(Path('packages/core/python/unified-settings.json').read_text())['parameters']
results = []
for kind in ('shared', 'specialization', 'persistent_fit', 'heavy_noise'):
    for seed in (41, 42, 43):
        weekends, truth = world(seed, kind, length=35)
        retrospective = fit_history(weekends, settings)['history']
        filtered = UnifiedModel(settings)
        errors = {'filtered': [], 'retrospective': []}
        for index, (weekend, (drivers, _, _)) in enumerate(zip(weekends, truth)):
            filtered.begin(weekend)
            filtered.update(weekend['observations'])
            if index < 5:
                continue
            for a in range(len(drivers)):
                for b in range(a + 1, len(drivers)):
                    expected = drivers[a] - drivers[b]
                    ia, ib = filtered.indices[('driver', str(a))], filtered.indices[('driver', str(b))]
                    estimates = {'filtered': filtered.mean[ia:ia + 3] - filtered.mean[ib:ib + 3],
                                 'retrospective': (np.array(retrospective[index]['driver'][str(a)])
                                                   - retrospective[index]['driver'][str(b)]) / POINTS}
                    for name, estimate in estimates.items():
                        errors[name].append((estimate - expected) ** 2)
        results.append({'world': kind, 'seed': seed, **{name: (np.sqrt(np.mean(value, axis=0)) * POINTS).tolist()
                                                        for name, value in errors.items()}})
    print(f'Completed {kind}', flush=True)
Path('tmp/retrospective-refit/simulation.json').write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
