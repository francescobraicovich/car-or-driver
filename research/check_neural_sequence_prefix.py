"""Verify that later weekends cannot alter earlier features or rating snapshots."""

import json
import sys


def load(path, key):
    with open(path, encoding="utf-8") as source:
        return json.load(source)[key]


for label, first, extended, key in [
    ("features", sys.argv[1], sys.argv[2], "weekends"),
    ("predictions", sys.argv[3], sys.argv[4], "predictions"),
]:
    prefix = load(first, key)
    full = load(extended, key)
    if len(full) <= len(prefix) or prefix != full[: len(prefix)]:
        raise AssertionError(f"{label} changed after appending later weekends")
    print(f"{label}: {len(prefix)} unchanged records before {len(full) - len(prefix)} later weekends")
