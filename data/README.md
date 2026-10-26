# data/

**Licence and credits: see [NOTICE.md](NOTICE.md). The data is non-commercial.**

Race data (the RaceData CSVs) read by the Node scripts and by `tools/build-model.mjs`, which computes the ratings the site downloads (`model.json` and `export-rows.json`, generated, committed), and by `tools/build-race-laps.mjs`, which writes every driver's lap times for each season (`race-laps/`, generated, committed), from which the front page replays the real race. `source/f1-circuits/` holds the circuit outlines (not ours: bacinger/f1-circuits, MIT) that `tools/build-tracks.mjs` turns into `site/assets/tracks.json`. The CSVs are committed so the research is repeatable; the site does not read them.

- `results.csv`, `qualifying.csv`, `races.csv`, `drivers.csv`, `constructors.csv`, `status.csv` (required)
- `lap_times.csv` (required; enables lap pace and last-lap retirement snapshots)
- `circuits.csv` (optional; circuit names and countries)

Refresh from the public mirrors with `node packages/research/node/fetch-data.mjs`; it also writes `manifest.json` (a version hash of the files and the latest race with results; `tests/test-data-manifest.mjs` fails if it does not match the files, and `node tools/make-data-manifest.mjs` regenerates it).

After a refresh, in this order:

1. `npm run build:model` rebuilds `model.json`, `export-rows.json`, and the dated teammate network in `teammate-graph.json` (about 20 seconds). The ratings files record a fingerprint of the data and `packages/core/src`; the graph file carries the same fingerprint and `tests/test-teammate-graph.mjs` compares it with a fresh forward-only build.
2. `npm run research:findings` rewrites `site/js/insights-data.js`, which `tests/test-insights.mjs` checks against the manifest.
3. `npm test`, then update `tests/golden.json` and the terminal window of `research/final-results.json` deliberately (`node tests/golden.mjs --update`), then `bash research/eval/regenerate.sh` for the figures in the docs.
