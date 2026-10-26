"""Samples the front-page drawing for the contrast test (tests/test-stage.mjs).

For each cell of a 24 x 16 grid over the picture (64 pixels square), it records the darkest and the lightest pixel (by relative luminance) of the red
and of the black-and-white version, as sRGB triples. The test then asks, for every place where text sits, whether the text colour has enough contrast
against both extremes under the translucent plate behind it. Node cannot decode WebP without a dependency, so the pixels are read here, once, and
the result is committed:

    python3 tools/sample-stage-backgrounds.py        (needs Pillow and numpy; rerun if the artwork changes)
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

CELL = 64
ROOT = Path(__file__).resolve().parent.parent


def luminance(pixels):
    channel = pixels / 255.0
    linear = np.where(channel <= 0.03928, channel / 12.92, ((channel + 0.055) / 1.055) ** 2.4)
    return 0.2126 * linear[..., 0] + 0.7152 * linear[..., 1] + 0.0722 * linear[..., 2]


def sample(path):
    pixels = np.asarray(Image.open(path).convert("RGB")).astype(float)
    height, width, _ = pixels.shape
    columns, rows = width // CELL, height // CELL
    darkest, lightest = [], []
    for row in range(rows):
        for column in range(columns):
            cell = pixels[row * CELL:(row + 1) * CELL, column * CELL:(column + 1) * CELL].reshape(-1, 3)
            order = luminance(cell)
            darkest.append([int(v) for v in cell[order.argmin()]])
            lightest.append([int(v) for v in cell[order.argmax()]])
    return {"darkest": darkest, "lightest": lightest}


result = {"cell": CELL, "columns": 1536 // CELL, "rows": 1024 // CELL}
for name in ("red", "mono"):
    path = ROOT / "site" / "assets" / "art" / f"{name}.webp"
    result[name] = sample(path)
    result[name]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()  # the test refuses samples taken from other artwork
(ROOT / "tests" / "fixtures" / "stage-backgrounds.json").write_text(json.dumps(result, separators=(",", ":")) + "\n")
print("wrote tests/fixtures/stage-backgrounds.json")
