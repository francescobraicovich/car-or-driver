"""Research compatibility import for the production numerical implementation."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages/core/python"))
from unified_model import *  # noqa: F403
