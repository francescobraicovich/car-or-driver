# Research programs

The site is built from the production code in `packages/core/`. These programs provide data loading, regeneration and evaluation support:

- `node/common.mjs` loads the data used by model builds, evaluations and tests.
- `node/export-ratings-table.mjs` and `python/compute-findings.py` regenerate the figures for Insights; `npm run build:findings` runs both.
- `python/heads.py` records the earlier head-fitting methods. The archived form model and its reproduction steps are in [research/current-form](../../research/current-form/protocol.md).
- `node/evaluate.mjs`, `suite.mjs`, `metric-suite.mjs`, `strict-eval.mjs`, `strict-paired.mjs`, `mover-strict.mjs`, and `heads-metrics.mjs` score the historical model. `ablate.mjs`, `loading.mjs`, `diagnose*.mjs`, `diagnostics-library.mjs`, `cross-session.mjs`, and `separation*.mjs` supply diagnostics and ablations. [Research evaluation](../../research/evaluation/README.md) records the results and regeneration command.
- `node/simulation-*.mjs` evaluate calibration and recovery in synthetic worlds; their limitations are in [backtesting](../../docs/backtesting.md).
- `node/state-space-*.mjs` reproduce calibration, fitting and rookie-prior studies. `verify-wet.mjs` checks wet-race records.

The Python findings and fitting programs require the dependencies listed in the root `requirements-research.txt`. Retired experiments are available in Git history.

The current production builder is `packages/core/node/build-unified.mjs`; the shared numerical implementation is in `packages/core/python/`. `npm run evaluate` reproduces the unified study against the archived hybrid reference. Findings consume `data/model.json`, so they cannot silently rebuild a different rating model.
