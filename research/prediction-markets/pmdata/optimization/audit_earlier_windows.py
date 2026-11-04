"""Audit three earlier four-driver race windows with the existing PMData audit."""

import json
from pathlib import Path

import audit_teammate_windows as audit_module

ROOT = Path(__file__).resolve().parents[4]
audit_module.MANIFEST = ROOT / 'tmp/pmdata/earlier-races-download-manifest.json'
audit_module.OUTPUT = Path(__file__).with_name('earlier-window-audit.json')
audit_module.main()
result = json.loads(audit_module.OUTPUT.read_text())
result['description'] = ('Four driver winner contracts in three researcher-selected earlier race windows, '
                         '14:00–16:00 UTC. Coverage and order are not independently certified.')
audit_module.OUTPUT.write_text(json.dumps(result, indent=2) + '\n')
