# Architecture and maintenance

The website is static HTML, CSS and native JavaScript modules. Node programs prepare observations and invoke the Python numerical model before publication. The browser never rebuilds the rating model.

## Website modules

Interface modules live in `site/js/`. Related modules share a prefix so they stay together in directory listings.

| Area | Entry points and supporting files |
| --- | --- |
| Startup and routing | `app.js`, `boot-probe.js`, `workspace.js`, `address.js` (the path of each page; old `#/` links still open), `page-metadata.js` (titles and descriptions), `state.js`, `dom.js`, `model-loader.js` (the front page fetches the whole history at the visitor's first interaction) |
| Head of every page | `site-head.js`: the tyre at the top left, which lets out the name off the front page and folds it back on the way home, and the links, behind a button of three lines on a phone |
| Front page and overlays | `stage-view.js`, `stage-pages.js`, `stage-geometry.js`, `stage-noise.js`, `slide-deck.js`; `question-feed.js` (the questions scrolling on the front page) and `question-pool.js` (the questions, their pages and how wanted each is: the weights to tune are at its top) |
| Ratings | `ratings-view.js`, `ratings-bars.js`, `metric-text.js`, `info-tip.js` |
| History | `history-view.js` |
| Head to head | The page of two drivers, written by the build for the pairs the front page asks about (`/compare/…`) and every pair of teammates (`/teammates/…`), and drawn in the browser for any other pair (`/head-to-head?a=…&b=…`): `head-to-head-content.js` (the page, from its data), `head-to-head-forecasts.js` (who would finish ahead: at their best, latest, the next race, any dates), `rating-chart.js` (the chart, with a marker for each driver), `pair-page.js` (switching, dragging, the choice of two drivers) |
| Prediction | `prediction-view.js`, `prediction.js` (the expected finishing positions, and the chance of winning from the pairwise forecasts) |
| Teammate graph | `graph-view.js` |
| Race replay | `track-view.js`, `track-geometry.js`, `race-replay.js`, `speed-profile.js` |
| Insights | `insights-cards.js` (the findings), `insight-card.js` (the card of each), `insights-charts.js`, generated `insights-data.js`; the Insights are pages of the built site (`/insights` and one for each finding), not part of the front page |
| Methodology | `methodology-selection-view.js` (the choice); `methodology-simple-view.js`, `methodology-simple-content.js` (simple); `methodology-view.js`, `methodology-content.js` (full); `methodology-figures.js`, `methodology-interactives.js` (figures shared by both) |
| Legal pages and identity | `legal-view.js`, `legal-content.js`, `site-identity.js` |
| Shared charts and helpers | `charts.js`, `chart-renderer.js`, `chart-math.js`, `utils.js` |
| Document pages | `document-page.js` (the head; a press beside the panels goes back to the front page), `search-list.js` (the search field of the drivers and the teams), `insight-page.js` (draws the charts on `/insights` and `/insights/…`), `insight-page-metadata.js` (address, title and introduction of each finding) |
| Addresses of the generated pages | `page-addresses.js`: the address of a driver's, team's, teammates', comparison or season page, shared by the build and the front page's questions |

`site/css/styles.css` defines shared controls, chart and prose styles; `stage.css` defines the front page, panels, slide decks and the head of every page; `document.css` defines the pages of the drivers, teams, two drivers, seasons and findings. The build also writes `front-page-questions.json` and `head-to-head-drivers.json` (`tools/generated-files.mjs`), which the local server computes on request. Active artwork and circuit outlines are in `site/assets/`. Fonts and KaTeX are served locally from `site/vendor/`, with their licences.

## Design and accessibility

The site uses a consistent eight-colour categorical palette for compared entries, paired with labels and other visual cues. Controls are designed for keyboard and touch as well as pointer input; motion should respect reduced-motion preferences. Fonts and mathematical rendering are local, and the site does not use browser storage or third-party requests. Preserve these properties when changing the interface and verify them with the browser and publication checks.

## Model boundaries

- `packages/core/node/` prepares unified evidence and assembles published snapshots; it reuses the observation and hazard collection in `src/state-space/exam.js`.
- `packages/core/python/` is the shared production/research numerical implementation, calibration and selected settings. `src/unified/` projects the saved joint posterior into browser forecasts.
- `src/state-space/`, `src/hybrid/` and the older graph solvers remain archived research references; production does not run their filters, rating blends or forecast heads.
- `packages/core/src/forecast/moments.js` resolves dated driver and car selections. The other modules in `src/forecast/` retain archived forecasts and dispatch unified models to `src/unified/`.
- Shared core modules handle CSV parsing, datasets, backtests, car lineage, retirements and serialization. Production forecasts optionally condition on a known grid through a two-coefficient prediction layer; they have no circuit, weather or recent-form adjustment.
- `packages/eval/src/` evaluates models without interface dependencies. `packages/research/` supplies reproducible analysis and fitting programs; [research/](../research/README.md) contains their evidence.

Core code cannot import interface or research code. Browser-reachable JavaScript lives in `src/`; build-only Node and Python code lives in its separate directories. `test-layering.mjs` enforces the interface boundary.

## Maintenance tasks

| Change | Program and verification |
| --- | --- |
| Model or race tables | `npm run build:data`, then `npm test`; generated ratings must match a fresh core build |
| Insights | `npm run build:findings`; `test-insights.mjs` checks source version and displayed findings |
| Race replay | `tools/build-race-laps.mjs`; `test-race-laps.mjs` checks recorded crossings and generated files |
| Circuit shapes | `tools/build-tracks.mjs`; add the licensed GeoJSON source and its `SOURCE_FILES` entry, then run `test-gp-build.mjs` |
| Artwork | `tools/sample-stage-backgrounds.py` refreshes contrast samples; requires Pillow and NumPy |
| Privacy or licence text | Update legal content and compliance record; run publication and compliance checks |
| Static deployment | `npm run build -- https://carordriver.com/` (the address defaults to `SITE.address`); `dist/` receives the site at its root, browser-reachable core modules and website data, a page for every address, the site map, `robots.txt`, `404.html`, `_headers` and `_redirects` |
| Pages for search engines | `tools/build-pages.mjs` writes them with `app-pages.mjs` (each page of the site, with its own head and text), `insight-pages.mjs`, `driver-and-team-pages.mjs` and `page-template.mjs`; edit titles and descriptions in `site/js/page-metadata.js` and `insight-page-metadata.js`; `test-search-engine-pages.mjs` checks addresses, titles, links and figures |

The Grand Prix workflow fetches into ignored `tmp/`, validates complete new weekends, rebuilds data and findings, updates regression fingerprints and runs checks before committing to `main`. Deployment configuration is in `.github/workflows/` and [deployment.md](deployment.md).

## Verification

`npm test` runs the Node suite and Python numerical tests, including golden output checks, forecast parity, model/data freshness, source imports, documentation links and deployment contents. `npm run lint` checks JavaScript and formatting. `npm run test:browser` checks the interface with headless Chrome; pass a Chrome path after `--` or set `CHROME` if needed.

`npm run check:publication` checks configured identity and publication requirements. `tools/check-live-site.mjs` checks response headers, published resources and that one page of each kind is served at its own address after deployment. To look at the built site locally, run `npm run build` and `node tools/serve.mjs 8000 dist`, which serves it as Cloudflare Pages does. Generated `dist/`, temporary analysis files and dependencies are ignored by Git.

Model format 3 carries the three ratings, dated overall covariance and calibration bundles. The latest file omits covariance and forecast state for a small initial download. Python is required at build and test time; the published site remains static.
