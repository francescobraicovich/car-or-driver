# Architecture and maintenance

The website is static HTML, CSS and native JavaScript modules. Node programs generate its data before publication. The browser never rebuilds the rating model.

## Website modules

Interface modules live in `site/js/`. Related modules share a prefix so they stay together in directory listings.

| Area | Entry points and supporting files |
| --- | --- |
| Startup and routing | `app.js`, `boot-probe.js`, `workspace.js`, `state.js`, `dom.js`, `model-loader.js` |
| Front page and overlays | `stage-view.js`, `stage-pages.js`, `stage-geometry.js`, `stage-noise.js`, `slide-deck.js` |
| Ratings | `ratings-view.js`, `ratings-bars.js`, `metric-text.js`, `info-tip.js` |
| History and comparisons | `history-view.js`, `head-to-head-view.js`, `head-to-head-forecasting.js` |
| Teammate graph | `graph-view.js` |
| Race replay | `track-view.js`, `track-geometry.js`, `race-replay.js`, `speed-profile.js` |
| Insights | `insights-view.js`, `insights-cards.js`, `insights-charts.js`, generated `insights-data.js` |
| Methodology | `methodology-view.js`, `methodology-content.js`, `methodology-diagram.js`, `methodology-figures.js`, `methodology-interactives.js`, `backtest-figures.js` |
| Legal pages and identity | `legal-view.js`, `legal-content.js`, `site-identity.js` |
| Shared charts and helpers | `charts.js`, `chart-renderer.js`, `chart-math.js`, `utils.js` |

`site/css/styles.css` defines shared controls, chart and prose styles; `stage.css` defines the front page, panels and slide decks. Active artwork and circuit outlines are in `site/assets/`. Fonts and KaTeX are served locally from `site/vendor/`, with their licences.

## Model boundaries

- `packages/core/src/state-space/` builds observations and filters race and qualifying evidence.
- `packages/core/src/hybrid/` applies the published ranking learner and fixed blend; `presets/` holds the settings.
- `packages/core/src/forecast/` prepares matchups, recent form and what-if forecasts.
- Shared core modules handle CSV parsing, datasets, backtests, car lineage, retirements and serialization. The Elo benchmark remains necessary for its circuit and wet-weather tracks and for measured comparisons.
- `packages/eval/src/` evaluates models without interface dependencies. `packages/research/` supplies reproducible analysis and fitting programs; [research/](../research/README.md) contains their evidence.

Core code must run in Node and the browser and cannot import interface or research code. `test-layering.mjs` enforces that boundary.

## Maintenance tasks

| Change | Program and verification |
| --- | --- |
| Model or race tables | `npm run build:data`, then `npm test`; generated ratings must match a fresh core build |
| Insights | `npm run build:findings`; `test-insights.mjs` checks source version and displayed findings |
| Race replay | `tools/build-race-laps.mjs`; `test-race-laps.mjs` checks recorded crossings and generated files |
| Circuit shapes | `tools/build-tracks.mjs`; add the licensed GeoJSON source and its `SOURCE_FILES` entry, then run `test-gp-build.mjs` |
| Artwork | `tools/sample-stage-backgrounds.py` refreshes contrast samples; requires Pillow and NumPy |
| Privacy or licence text | Update legal content and compliance record; run publication and compliance checks |
| Static deployment | `npm run build -- https://your-site.example/`; `dist/` receives browser-reachable core modules and website data |

The Grand Prix workflow fetches into ignored `tmp/`, validates complete new weekends, rebuilds data and findings, updates regression fingerprints and runs checks before committing to `main`. Deployment configuration is in `.github/workflows/` and [deployment.md](deployment.md).

## Verification

`npm test` runs the Node suite, including golden output checks, forecast parity, model/data freshness, source imports, documentation links and deployment contents. `npm run lint` checks JavaScript and formatting. `npm run test:browser` checks the interface with headless Chrome; pass a Chrome path after `--` or set `CHROME` if needed.

`npm run check:publication` checks configured identity and publication requirements. `tools/check-live-site.mjs` checks response headers and published resources after deployment. Generated `dist/`, temporary analysis files and dependencies are ignored by Git.
