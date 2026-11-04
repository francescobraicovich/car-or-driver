# Car or Driver

How much of a Formula 1 result is the driver, and how much is the car? This static, non-commercial website separates their ratings after every race weekend since 1994. It includes rating histories, head-to-head forecasts, a teammate graph, race replays, twenty findings and the methodology behind them.

It is an independent personal project. It is not affiliated with Formula 1, the FIA or any team or driver.

## What is on the site

| Page | What it shows |
| --- | --- |
| **Front page and ratings** | A drawing of a car and a driver's hands under the title. Point at either (or at its word in the title) and a box opens, the picture turns black and white, the blue version shows inside the box and a panel opens on the left with the ratings of the cars or of the drivers: a ranking after any weekend since 1994, each row with its error and a bar, with scrolling for large historical fields on short screens; a slider to play through the seasons as a bar-chart race (the rows glide to their new places and the bars grow); the rating to show; and a way to select entries and compare them. Press to keep the panel open (the address then is `#/ratings`). Where a circuit outline is available, the real race of the weekend is replayed at the bottom right, at 1 to 50 times the real speed (you choose), from the lap times of every car (overtakes, pit stops, safety cars and red flags included), with a live timing table of places and gaps; pointing at a driver highlights his dot and his row of the table. |
| **History** | Rating lines for the drivers or cars you choose, over any range of seasons. It opens over the ratings, in the panel, with a button to go back (`#/history`). |
| **Head to head** | A pairwise performance forecast from ratings and recent form, with retirement risks shown separately and what-if options (another season, another car, wet weather). It opens over the ratings, in the panel (`#/head-to-head`): the same car for both drivers to begin with, a Prime button for each, and a date to drag along their rating history, which takes the race at the bottom right to that Grand Prix. |
| **Graph** | Every driver in the data, positioned by mean year raced and a teammate-only graph score. Scrub to any weekend, inspect each driver's published rating, age and complete teammate record, and follow favorable and unfavorable links. On wide screens, selecting a driver also lights their dot in the mini GP (`#/graph`). |
| **Insights** | Twenty findings, each with a chart and a note on how it was computed: how much of a race is the car, who the best teammates are, how the order survives a winter, and more. They are a slide show on a card over the front page (`#/insights`): the contents first, then a slide for each finding, reached from the contents, from the list of slides beside the card, with the arrow keys or a swipe. |
| **Methodology** | How the numbers are computed, from first principles, written for readers with university mathematics and no knowledge of Formula 1; with references. |

## How it works, in one paragraph

Each driver and car has a hidden pace that changes over time. Race and qualifying filters estimate their levels; a small online driver/car learner supplies a third portable driver estimate. A shared information fraction of 0.25 makes the learners respond more slowly. The driver estimate combines 95% of the existing filter/online blend (48% race filter, 32% qualifying filter, 20% online ranking) with 5% of a ridge teammate graph whose evidence has a three-year half-life. Comparisons connect driver levels in their shared seasons, with gradual change between seasons. Car ratings combine 75% race filter and 25% qualifying filter. The race filter reads qualifying driver levels; qualifying car levels enter only through the final car blend. The race filter's driver–car fit stays internal. Team changes add no portable-driver variance jump, mean penalty or mover-specific likelihood bonus. Ratings are centred on **1,000** on a 75-point scale: 75 points gives 10:1 odds in the basic pair model. Small ridge-logistic models add recent form and current qualifying evidence to forecasts. The uncertainty bars remain an approximation from the race filter, not the full blend.

It is judged by how well it forecasts each weekend from earlier weekends only (a coin flip scores 0.6931 on this measure; lower is better):

| Chronological block | Coin flip | Previous model | Steadier model |
| --- | --- | --- | --- |
| Ratings alone, 2008–2011 | 0.6931 | 0.3798 | 0.3857 |
| Ratings alone, 2012–2015 | 0.6931 | 0.3601 | 0.3635 |
| Ratings alone, 2016–2020 | 0.6931 | 0.3725 | 0.3758 |
| Ratings alone, 2021–2025 | 0.6931 | 0.4081 | 0.4125 |

Each block's calibration uses earlier seasons only. These periods previously informed development, so they are retrospective validation. Historical combined-rating changes fall by 50% at the median and 49% at the 99th percentile. The primary move-balanced loss rises from 0.674888 to 0.688843 over 51 teammate-covered moves; some qualifying and field subsets deteriorate more. This exceeds the original +0.010 cost budget. The user chose identical driver-learning rules across team changes after seeing that cost. Original strict ratings guards fail; refitted complete forecasts pass their declared pooled and block limits. The [dated-graph report](docs/temporal-graph.md) records costs, uncertainty and rejected candidates. A later [driver and car form revision](docs/current-form.md) leaves those ratings unchanged and improves the frozen-evidence augmented mover forecast from 0.675757 to 0.657250; its retrospective selection followed a failed initial overall-gain threshold. The shipped method is in [docs/hybrid.md](docs/hybrid.md), the [behavioral principles](docs/rating-principles.md) define its contract, and [docs/backtesting.md](docs/backtesting.md) explains chronological validation. Driver transfers and complete blend uncertainty remain open problems.

The [Rane benchmark](research/benchmarks/rane-benchmark.md) scores pre-weekend hybrid ratings against the 2014–2024 race rankings using the paper's Kendall tau measure. The [literature comparison](research/benchmarks/literature-benchmark.md) also examines teammate and Bayesian models, with the limits of each comparison documented.

## Run it

You need Node.js 24 or newer. Chrome or Chromium is needed only for the browser test.

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

## Find your way around

The local data runs through the 2026 Mexico City Grand Prix on 1 November (round 19). The ratings are **computed once, when the site is published**, not in every visitor's browser. `node tools/build-model.mjs` builds the model from the CSV tables in `data/` and writes `data/model-latest.json` (the first screen), `data/model.json` (every weekend). The site downloads the other two. Each records a fingerprint of the data and of `packages/core/src`; `tests/test-model-file.mjs` fails if they are out of date, and it also checks that what a visitor sees equals a fresh build. After changing the data or the model, run `npm run build:data` and commit the result: it runs `tools/build-model.mjs`, `tools/build-teammate-graph.mjs` (the dated graph at `data/teammate-graph.json`), `tools/build-race-laps.mjs` (every driver's lap times for each season, `data/race-laps/`, behind the replay of the race), and `tools/build-tracks.mjs` (the circuit outlines, `site/assets/tracks.json`). A circuit that has not raced before needs an outline: add its file from `data/source/f1-circuits/` and a line in `SOURCE_FILES` in `tools/build-tracks.mjs` (the test fails until you do, or until you add the circuit to the few it lists as having none).

| Directory | Responsibility | Start here |
| --- | --- | --- |
| `site/` | Browser interface, styles, artwork and locally served vendor assets | [Interface and module map](docs/architecture.md) |
| `packages/core/src/` | Published rating model, observations, forecasts and serialization | [Current model](docs/hybrid.md) |
| `packages/eval/src/` | Evaluation library: dated scores, transfers and synthetic worlds | [Evaluation methods](docs/evaluation.md) |
| `packages/research/` | Node and Python programs that reproduce the model, forecasts and findings | [Analysis programs](packages/research/README.md) |
| `data/` | Source race tables, provenance, circuit sources and generated website data | [Data pipeline](data/README.md) |
| `research/` | Supporting evidence and reproducible comparisons, grouped by purpose | [Evidence index](research/README.md) |
| `tools/` | Data builders, local server, deployment assembly and publication checks | [Maintenance tasks](docs/architecture.md#maintenance-tasks) |
| `tests/` | Model regressions, source integrity, browser behavior and publication checks | [Verification](docs/architecture.md#verification) |
| `docs/` | Current technical and operational documentation | [Documentation index](docs/README.md) |

The checkout contains the website and the code, data and evidence needed to maintain or explain it. Retired model candidates, superseded experiment logs and earlier designs belong in Git history.

## Update the website data

The browser downloads precomputed ratings. After changing model code or accepting new race data:

```bash
npm run build:data       # ratings, teammate graph, race laps and circuit outlines
npm run build:findings   # Insights; requires the Python requirements below
npm test
npm run lint
```

Install findings and forecast fitting dependencies with `python3 -m pip install -r requirements-research.txt`. Ordinary website development and the Node tests do not need Python.

`model-latest.json` supplies the first screen; `model.json` supplies complete history and forecast state. `teammate-graph.json`, seasonal race-lap files and `site/assets/tracks.json` supply the graph and replay. Source fingerprints and regression tests prevent publication of stale generated files. Keep generated files committed. Update `tests/golden.json` deliberately only when the underlying data or model behavior changes.

The daily Grand Prix workflow validates complete new weekends, preserves published historical records, rebuilds website data and runs checks before committing an update. See [data/README.md](data/README.md). Deployment uses Cloudflare Pages; configuration and publication checks are in [docs/deployment.md](docs/deployment.md).

## Read the methodology

[The project overview](docs/project-overview.md) explains the problem, motivation and approach.

The published race driver rating blends 95% of the race filter (48%), qualifying filter (32%) and online ranking learner (20%) with 5% of the dated teammate graph. The qualifying driver rating also includes the same graph share. Car ratings blend race (75%) and qualifying (25%). Ratings are centred on 1,000; displayed uncertainty is an approximation from the race filter, not a calibrated interval for the complete blend.

[The hybrid methodology](docs/hybrid.md) records the exact calculation, measured comparisons, selection caveats and reproduction commands. [Known limitations](docs/limitations.md) records unresolved model problems. The website's Methodology page gives the reader-facing explanation.

## Licences and privacy

- Program code: [MIT](LICENSE).
- Race data, derived ratings, findings and published text: **non-commercial**, attribution and share-alike; see [data/NOTICE.md](data/NOTICE.md) for provenance and licence details.
- Vendor fonts, KaTeX and circuit outlines retain their included licences. Artwork has [separate terms](site/assets/art/NOTICE.txt).
- The website uses no cookies, analytics, third-party requests or browser storage. [The compliance record](docs/compliance.md) and automated checks document these properties.

Read [CLAUDE.md](CLAUDE.md) before contributing. Core modules must remain independent of the website interface; preserve model output during refactors and run the checks above.

This independent project is not affiliated with Formula 1, the FIA, teams or drivers. Ratings are statistical estimates, not facts about individuals or betting advice.
