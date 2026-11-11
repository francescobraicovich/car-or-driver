"""Verify the isolated research implementation against the evaluated replay."""
import json
from pathlib import Path

import numpy as np

from fit import annotated, replay, ROOT, REPORTS, OUTPUT

parameters = json.loads((REPORTS / 'parameters.json').read_text())
data = json.loads((ROOT / 'tmp/unified-form/input.json').read_text())
result = replay(annotated(data['weekends']), {**parameters['parameters'], 'newcomer_offsets': parameters['offsets']})
expected = np.load(OUTPUT / 'candidate.npz')
np.testing.assert_allclose(result['rows'], expected['rows'], rtol=1e-9, atol=1e-9)
print('PASS isolated research implementation reproduces all', len(result['rows']), 'validated predictions')
verification = {
    'researchOnly': True,
    'productionSourceHash': 'dc909062c7273b74',
    'predictionRows': len(result['rows']),
    'maximumPredictionDifference': float(np.max(np.abs(result['rows'] - expected['rows']))),
    'maximumPosteriorGradient': result['maximumGradient'],
}
(REPORTS / 'verification.json').write_text(json.dumps(verification, indent=2) + '\n')
