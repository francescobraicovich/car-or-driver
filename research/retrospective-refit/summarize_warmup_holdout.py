"""Compare matched 2012-onward held-out weekends with and without warm-up."""
import json
from pathlib import Path

root = Path('research/retrospective-refit')
base = json.loads((root / 'validation-holdout-weekend-621-predictive.json').read_text())
warm = json.loads((root / 'validation-holdout-weekend-685-predictive-warmup.json').read_text())
inputs = json.loads(Path('tmp/retrospective-refit/input.json').read_text())
ids = [row['raceId'] for i, row in enumerate(inputs) if i >= 310 and i % 10 == 9 and row['observations']]
if ids != warm['heldoutRaceIds'] or base['counts'] != warm['counts']:
    raise ValueError('Held-out evidence differs across the refits')
models = {}
for name in ('filtered', 'retrospective'):
    x = base['averageNegativeLogLikelihood'][name]
    y = warm['averageNegativeLogLikelihood'][name]
    models[name] = {'baselineNll': x, 'warmupNll': y, 'differenceWarmMinusBaseline': [b - a for a, b in zip(x, y)],
                    'baselineCalibration': base['predictiveCalibration'][name], 'warmupCalibration': warm['predictiveCalibration'][name]}
output = {'heldoutRaceIds': ids, 'counts': base['counts'], 'channels': base['channels'], 'models': models,
          'limitations': 'Matched held-out race set and raw comparisons, not a randomized comparison. The 31 weekends are correlated internally, these scores summarize limited predictive proxies, and hyperparameters were tuned without the warm-up. Retrospective models use future training races. Similar scores do not prove historical latent states or intervals are calibrated.'}
(root / 'validation-warmup-holdout-comparison.json').write_text(json.dumps(output, indent=2, allow_nan=False))
print(json.dumps(output, indent=2))
