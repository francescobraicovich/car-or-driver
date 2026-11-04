# Forecast-head fitting

`selection.json` records the selected forecast-head designs; `ACCEPTANCE.md` records their acceptance rule, and `selection-report.json` and `frozen-protocol.json` record the state-space input refit and provenance. Reconstruct training rows with `packages/research/node/export-state-space-rows.mjs` and fit with `packages/research/python/finalize-state-space.py`. The shipped coefficients are in `packages/core/src/state-space/forecast-heads.js`.
