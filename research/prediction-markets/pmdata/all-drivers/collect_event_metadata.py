"""Record official event metadata for the selected pre-practice race days."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[4]
RACES = ("canadian", "monaco", "barcelona", "austrian", "british", "dutch", "italian", "singapore")
OUTPUT = ROOT / "tmp/pmdata-all/gamma"

for race in RACES:
    source = ROOT / f"research/prediction-markets/pmdata/optimization/{race}-official-outcomes.json"
    metadata = json.loads(source.read_text())
    url = metadata["requestUrl"]
    path = OUTPUT / f"{race}.json"
    if path.exists():
        raw = path.read_bytes()
    else:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=30) as response:
            raw = response.read()
        event = json.loads(raw)
        if not isinstance(event, dict) or not isinstance(event.get("markets"), list):
            raise ValueError(f"Unexpected Gamma event response: {race}")
        path.write_bytes(raw)
    event = json.loads(raw)
    record = {"source": url, "retrievedAt": datetime.now(timezone.utc).isoformat(),
              "sha256": hashlib.sha256(raw).hexdigest(), "eventSlug": event["slug"],
              "markets": len(event["markets"])}
    provenance = OUTPUT / f"{race}-provenance.json"
    if not provenance.exists():
        provenance.write_text(json.dumps(record, indent=2) + "\n")
    print(race, json.dumps(json.loads(provenance.read_text())), flush=True)
