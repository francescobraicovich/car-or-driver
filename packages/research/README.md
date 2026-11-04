# Research programs

The site is built from the production code in `packages/core/`. These programs provide data loading, regeneration and evaluation support:

- `node/common.mjs` loads the data used by model builds, evaluations and tests.
- `node/export-ratings-table.mjs` and `python/compute-findings.py` regenerate the figures for Insights; `npm run build:findings` runs both.
- `node/export-state-space-rows.mjs`, `python/finalize-state-space.py`, and `python/heads.py` reconstruct and fit the published forecast heads. The design and acceptance evidence are in [research/forecast](../../research/forecast/README.md).
- `node/evaluate.mjs`, `suite.mjs`, `metric-suite.mjs`, `strict-eval.mjs`, `strict-paired.mjs`, `mover-strict.mjs`, and `heads-metrics.mjs` score the historical model. `ablate.mjs`, `loading.mjs`, `diagnose*.mjs`, `diagnostics-library.mjs`, `cross-session.mjs`, and `separation*.mjs` supply diagnostics and ablations. [Research evaluation](../../research/evaluation/README.md) records the results and regeneration command.
- `node/simulation-*.mjs` evaluate calibration and recovery in synthetic worlds; their limitations are in [evaluation](../../docs/evaluation.md).
- `node/state-space-*.mjs` reproduce calibration, fitting and rookie-prior studies. `verify-exam-invariance.mjs` and `verify-wet.mjs` check evaluation assumptions and wet-race records.
- `node/search-backbone.mjs`, `tune-backbone.mjs`, and `gate-backbone.mjs` reproduce the historical Elo benchmark selection rather than the published hybrid's fitting procedure.

The Python findings and fitting programs require the dependencies listed in the root `requirements-research.txt`. Retired experiments are available in Git history.
