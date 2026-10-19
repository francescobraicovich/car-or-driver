# data/

**Licence and credits: see [NOTICE.md](NOTICE.md). The data is non-commercial.**

Race data (the RaceData CSVs) read by the Node scripts and by `tools/build-model.mjs`, which computes the ratings the site downloads (`model.json` and `export-rows.json`, generated, committed). The CSVs are committed so the research is repeatable; the site does not read them.

- `results.csv`, `qualifying.csv`, `races.csv`, `drivers.csv`, `constructors.csv`, `status.csv` (required)
- `lap_times.csv` (required; enables lap pace and last-lap retirement snapshots)
- `circuits.csv` (optional; circuit names and countries)

Refresh from the public mirrors with `node packages/research/node/fetch-data.mjs`; it also writes `manifest.json` (a version hash of the files and the latest race with results; `tests/test-data-manifest.mjs` fails if it does not match the files, and `node tools/make-data-manifest.mjs` regenerates it).

After a refresh, in this order:

1. `node tools/build-model.mjs` rebuilds `model.json` and `export-rows.json` (about 20 seconds). Each records a fingerprint of the data and of `packages/core/src`; `tests/test-model-file.mjs` fails until they are rebuilt, so ratings computed before the refresh cannot be published.
2. `npm run research:findings` rewrites `site/js/insights-data.js`, which `tests/test-insights.mjs` checks against the manifest.
3. `npm test`, then update `tests/golden.json` and the terminal window of `research/final-results.json` deliberately (`node tests/golden.mjs --update`), then `bash research/eval/regenerate.sh` for the figures in the docs.
