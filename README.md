# Car or Driver

How much of a Formula 1 result is the driver, and how much is the car? This static, non-commercial website separates their ratings after every race weekend since 1994. It includes rating histories, head-to-head forecasts, a teammate graph, race replays, twenty findings and the methodology behind them.

It is an independent personal project. It is not affiliated with Formula 1, the FIA or any team or driver.

## What is on the site

| Page | What it shows |
| --- | --- |
| **Front page and ratings** | A drawing of a car and a driver's hands under the title. Point at either (or at its word in the title) and a box opens, the picture turns black and white, the blue version shows inside the box and a panel opens on the left with the ratings of the cars or of the drivers: a ranking after any weekend since 1994, each row with its error and a bar, with scrolling for large historical fields on short screens; a slider to play through the seasons as a bar-chart race (the rows glide to their new places and the bars grow); the rating to show; and a way to select entries and compare them. Press to keep the panel open (the address then is `#/ratings`). Where a circuit outline is available, the real race of the weekend is replayed at the bottom right, at 1 to 50 times the real speed (you choose), from the lap times of every car (overtakes, pit stops, safety cars and red flags included), with a live timing table of places and gaps; pointing at a driver highlights his dot and his row of the table. |
| **History** | Rating lines for the drivers or cars you choose, over any range of seasons. It opens over the ratings, in the panel, with a button to go back (`#/history`). |
| **Head to head** | A pre-weekend race-result forecast from unified overall ratings, joint uncertainty and retirement risk, with historical and same-car what-if comparisons. It opens over the ratings, in the panel (`#/head-to-head`): the same car for both drivers to begin with, a Prime button for each, and a date to drag along their rating history, which takes the race at the bottom right to that Grand Prix. |
| **Graph** | Every driver in the data, positioned by mean year raced and their published overall rating at their latest appearance. Scrub to any weekend, inspect each driver's published rating, age and complete teammate record, and follow favorable and unfavorable links. On wide screens, selecting a driver also lights their dot in the mini GP (`#/graph`). |
| **Insights** | Twenty findings, each with a chart and a note on how it was computed: how much of a race is the car, who the best teammates are, how the order survives a winter, and more. They are a slide show on a card over the front page (`#/insights`): the contents first, then a slide for each finding, reached from the contents, from the list of slides beside the card, with the arrow keys or a swipe. |
| **Methodology** | How the numbers are computed, from first principles, as a guided explanation from observations through driver–car separation to forecasts and limitations. |

## How it works, in one paragraph

A joint probabilistic model tracks **qualifying pace, race pace and overall strength** for every driver and car. Historical ratings use a retrospective joint refit with evidence from 1990 onward; current ratings and forecasts use the chronological filter. Early historical ratings are sensitive to the starting assumptions. Timing observations retain actual margins. Normal finishing-order comparisons teach overall competitiveness, which is its own target rather than a fixed blend. Teammates cancel the shared car contribution; the resulting graph connections enter the joint model directly. Correlated outputs share information while retaining separate meanings. Updates preserve joint uncertainty, use robust timing errors and allow strengths to evolve. No online learner, final rating blend or additional recent-form layer is used.

Overall strength is the default ranking and drives pre-weekend forecasts, with joint uncertainty, past-only calibration and explicit retirement risk. In Ratings, History and Graph, **1,000** is a recent-era reference: earlier field means are averaged with a **20-weekend half-life**, separately for each driver/car output. Current lineup changes cannot immediately re-centre the field. The underlying model and forecasts retain their original coordinates; the current field average is free to differ from 1,000. A 75-point gap gives 10:1 raw odds for **overall strength only**; timing ratings represent fractional time differences.

When both starting positions are supplied under Head to head → Conditions, a small fitted layer combines the overall gap and grid difference. Missing either position restores the pre-weekend forecast exactly. The [recent-form and prediction-layer study](research/unified-form/README.md) retained the existing strength ratings and this compact grid head; it did not retain recent form, circuit/weather corrections or a nonlinear head.

The 2008–2025 replay gives actual-result log loss **0.53012**, against **0.53172** for the previous ratings under the same calibration and risk treatment. Qualifying and race-margin errors fell 20.8% and 15.3%. Frozen team-change loss rose slightly, from 0.67799 to 0.67926, and ratings move more. The decision prioritises a coherent model alongside competitive prediction. These are retrospective results; 2026 is separate monitoring. See [methodology](docs/unified-model.md), [validation](docs/backtesting.md) and the [original study](research/unified-ratings/README.md). Older hybrid and graph experiments remain reproducible research references; they do not produce website ratings.

## Run it

You need Node.js 24 or newer. Building ratings and running the complete tests also require Python 3.12 with `python3 -m pip install -r requirements-model.txt`. Static hosting needs no Python runtime. Chrome or Chromium is needed only for the browser test.

```bash
npm ci
npm run serve          # http://localhost:8000/ redirects to /site/
npm test               # model, data, website and deployment regression tests
npm run lint           # ESLint and Prettier
npm run test:browser   # drives the real site in headless Chrome
npm run evaluate       # chronological production-model scorecard
npm run build          # assemble the deployable static website in dist/
```

ES modules require HTTP. Serve the repository root so the website can load `packages/core/` and `data/` at their deployed paths.

The 3D design experiment is retained in [the reference archive](research/interface-design/three-dimensional-stage/README.md), including the editable Blender project, optimized models, implementation snapshot, previews and model credits. The original source assets remain in `site/assets/f1-mercedes-car` and `site/assets/f1-driver`; the optimized GLBs remain in `site/assets/models`. Rebuild them with `node tools/build-stage-models.mjs /absolute/path/to/blender`. These reference files are not loaded by the restored landing page or included in production builds.

## Find your way around

The local data runs through the 2026 Brazilian Grand Prix on 8 November (round 20). The ratings are **computed once, when the site is published**, not in every visitor's browser. `node tools/build-model.mjs` builds the model from the CSV tables in `data/` and writes `data/model-latest.json` (the first screen), `data/model.json` (every weekend). The retrospective build also writes `data/retrospective-latest.json` and `data/retrospective.json` for historical views. Each records a fingerprint of the inputs and model code. `tests/test-model-file.mjs` compares the filtered files with a fresh build; `tests/test-retrospective-publication.mjs` checks the retrospective fingerprint and published views. After changing the data or the model, run `npm run build:data` and commit the result: it runs `tools/build-model.mjs`, `tools/build-retrospective.mjs`, `tools/build-teammate-graph.mjs` (the dated graph at `data/teammate-graph.json`), `tools/build-race-laps.mjs` (every driver's lap times for each season, `data/race-laps/`, behind the replay of the race), and `tools/build-tracks.mjs` (the circuit outlines, `site/assets/tracks.json`). A circuit that has not raced before needs an outline: add its file from `data/source/f1-circuits/` and a line in `SOURCE_FILES` in `tools/build-tracks.mjs` (the test fails until you do, or until you add the circuit to the few it lists as having none).

| Directory | Responsibility | Start here |
| --- | --- | --- |
| `site/` | Browser interface, styles, artwork and locally served vendor assets | [Interface and module map](docs/architecture.md) |
| `packages/core/src/` | Published rating model, observations, forecasts and serialization | [Current model](docs/unified-model.md) |
| `packages/eval/src/` | Evaluation library: dated scores, transfers and synthetic worlds | [Evaluation methods](docs/backtesting.md) |
| `packages/research/` | Node and Python programs that reproduce the model, forecasts and findings | [Analysis programs](packages/research/README.md) |
| `data/` | Source race tables, provenance, circuit sources and generated website data | [Data pipeline](data/README.md) |
| `research/` | Supporting evidence and reproducible comparisons, grouped by purpose | [Evidence index](research/README.md) |
| `tools/` | Data builders, local server, deployment assembly and publication checks | [Maintenance tasks](docs/architecture.md#maintenance-tasks) |
| `tests/` | Model regressions, source integrity, browser behavior and publication checks | [Verification](docs/architecture.md#verification) |
| `docs/` | Current technical and operational documentation | [Architecture and maintenance](docs/architecture.md) |

The checkout contains the website and the code, data and evidence needed to maintain or explain it. Retired model candidates and superseded experiment logs belong in Git history. The requested 3D design reference is retained in `research/interface-design/three-dimensional-stage/`.

## Update the website data

The browser downloads precomputed ratings. After changing model code or accepting new race data:

```bash
npm run build:data       # ratings, teammate graph, race laps and circuit outlines
npm run build:findings   # Insights; requires the Python requirements below
npm test
npm run lint
```

Install findings and research dependencies with `python3 -m pip install -r requirements-research.txt`. Interface development against the saved ratings needs no Python; rebuilding ratings and running the complete test suite require the model dependencies.

`model-latest.json` supplies the first screen; `model.json` supplies complete history and forecast state. `teammate-graph.json`, seasonal race-lap files and `site/assets/tracks.json` supply the graph and replay. Source fingerprints and regression tests prevent publication of stale generated files. Keep generated files committed. Update `tests/golden.json` deliberately only when the underlying data or model behavior changes.

The daily Grand Prix workflow validates complete new weekends, preserves published historical records, rebuilds website data and runs checks before committing an update. See [data/README.md](data/README.md). Deployment uses Cloudflare Pages; configuration and publication checks are in [docs/deployment.md](docs/deployment.md).

## Read the methodology

The current [unified methodology](docs/unified-model.md) records the calculation, assumptions and source responsibilities. [Backtesting](docs/backtesting.md) distinguishes the selected model from archived experiments. The website’s Methodology page presents the complete explanation for readers.

## Licences and privacy

- Program code: [MIT](LICENSE).
- Race data, derived ratings, findings and published text: **non-commercial**, attribution and share-alike; see [data/NOTICE.md](data/NOTICE.md) for provenance and licence details.
- Vendor fonts, KaTeX and circuit outlines retain their included licences. Original artwork has [separate terms](site/assets/art/NOTICE.txt); the [3D car and driver retain their original licences and credits](site/assets/models/NOTICE.txt), while the authoring and rendering code uses MIT.
- The website uses no cookies, analytics, third-party requests or browser storage. [The compliance record](docs/compliance.md) and automated checks document these properties.

Read [CLAUDE.md](CLAUDE.md) before contributing. Core modules must remain independent of the website interface; preserve model output during refactors and run the checks above.

This independent project is not affiliated with Formula 1, the FIA, teams or drivers. Ratings are statistical estimates, not facts about individuals or betting advice.
