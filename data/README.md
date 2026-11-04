# data/

**Licence and credits: see [NOTICE.md](NOTICE.md). The data is non-commercial.**

Race data (the RaceData CSVs) read by the Node scripts and by `tools/build-model.mjs`, which computes the ratings the site downloads (`model-latest.json` and `model.json`, generated, committed), and by `tools/build-race-laps.mjs`, which writes every driver's lap times for each season (`race-laps/`, generated, committed), from which the front page replays the real race. `source/f1-circuits/` holds the circuit outlines (not ours: bacinger/f1-circuits, MIT) that `tools/build-tracks.mjs` turns into `site/assets/tracks.json`. The CSVs are committed so the research is repeatable; the site does not read them.

- `results.csv`, `qualifying.csv`, `races.csv`, `drivers.csv`, `constructors.csv`, `status.csv` (required)
- `lap_times.csv` (required; enables lap pace and last-lap retirement snapshots)
- `circuits.csv` (optional; circuit names and countries)

Fetch a candidate snapshot with `node tools/fetch-data.mjs tmp/gp-fetch`, then validate and append new weekends with `node tools/refresh-gp-data.mjs tmp/gp-fetch`. The fetcher also writes the candidate's `manifest.json`; the refresh tool updates the committed manifest after accepting new records. The manifest records a version hash of the files and the latest race with results; `tests/test-data-manifest.mjs` checks it, and `node tools/make-data-manifest.mjs` regenerates it after a deliberate manual correction.

The scheduled `Refresh Grand Prix data` GitHub Action checks those mirrors daily. It fetches into `tmp/`, accepts a new race only when results, qualifying and lap times are present, and appends its records while preserving published rows. Source corrections to older records are logged and require separate review. It then rebuilds the site data and runs every test. A passing update is committed to `main`, which makes Cloudflare Pages rebuild the site. A failed check leaves the published data unchanged and needs a person to review the workflow log. You can also run the workflow manually from GitHub's Actions tab.

After a refresh, in this order:

1. `npm run build:data` rebuilds `model-latest.json`, `model.json`, and the dated teammate network in `teammate-graph.json` (about 20 seconds). The ratings files record a fingerprint of the data and `packages/core/src`; the graph file carries the same fingerprint and `tests/test-teammate-graph.mjs` compares it with a fresh forward-only build.
2. `npm run build:findings` rewrites `site/js/insights-data.js`, which `tests/test-insights.mjs` checks against the manifest.
3. Run `npm test` and `npm run lint`. Update `tests/golden.json` deliberately with `node tests/golden.mjs --update` when accepting a data or model change; never update it just to silence a refactor regression.
4. Model changes also require reviewing the current evidence in `research/`; `bash research/evaluation/regenerate.sh` regenerates the historical filter comparisons, not a fresh independent validation of the hybrid.
