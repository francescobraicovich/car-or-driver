# Driver or Car

**How much of a Formula 1 result is the driver, and how much is the car?**

Driver or Car is a free, non-commercial website and the research code behind it. It rates every driver and every car at every race weekend since 2000, with an error bar on every number, and shows the ratings, their history, head-to-head forecasts and twenty findings about the split between driver and car.

It is an independent personal project. It is not affiliated with Formula 1, the FIA or any team or driver.

## What is on the site

| Page | What it shows |
| --- | --- |
| **Front page and ratings** | A drawing of a car and a driver's hands under the title. Point at either (or at its word in the title) and a box opens, the picture turns black and white, the blue version shows inside the box and a panel opens on the left with the ratings of the cars or of the drivers: a ranking after any weekend since 2000, all rows at once, each with its error and a bar; a slider to play through the seasons as a bar-chart race (the rows glide to their new places and the bars grow); the rating to show; and a way to select entries and compare them. Press to keep the panel open (the address then is `#/ratings`). The real race of the weekend is replayed at the bottom right on its circuit, at 1 to 50 times the real speed (you choose), from the lap times of every car (overtakes, pit stops, safety cars and red flags included), with a live timing table of places and gaps; pointing at a driver highlights his dot and his row of the table. |
| **History** | Rating lines for the drivers or cars you choose, over any range of seasons. It opens over the ratings, in the panel, with a button to go back (`#/history`). |
| **Head to head** | The chance that one driver finishes ahead of another, from their ratings and recent form, with what-if options (another season, another car, wet weather). It opens over the ratings, in the panel (`#/head-to-head`): the same car for both drivers to begin with, a Prime button for each, and a date to drag along their rating history, which takes the race at the bottom right to that Grand Prix. |
| **Insights** | Twenty findings, each with a chart and a note on how it was computed: how much of a race is the car, who the best teammates are, how the order survives a winter, and more. They are a slide show on a card over the front page (`#/insights`): the contents first, then a slide for each finding, reached from the contents, from the list of slides beside the card, with the arrow keys or a swipe. |
| **Methodology** | How the numbers are computed, from first principles, written for readers with university mathematics and no knowledge of Formula 1; with references. |

## How it works, in one paragraph

Each driver and each car has a hidden pace that changes slowly over time. We never see it; we see results: which of two drivers finished ahead of the other. The model says how the odds of that depend on the hidden paces (a logistic curve), keeps a probabilistic belief about every pace, and updates all the beliefs together with Bayes' rule after every weekend. This is a joint state-space model, run on qualifying and on the race, and the race model reads the qualifying model. Ratings are centred on **1,000** on a 75-point scale: a lead of 75 points means 10:1 odds. The published rating of a driver is the level that travels between cars, not the fit with a particular car.

It is judged by how well it forecasts each weekend from earlier weekends only (a coin flip scores 0.6931 on this measure; lower is better):

| Window | Coin flip | A conventional Elo-style system (kept as a benchmark) | These ratings |
| --- | --- | --- | --- |
| Ratings alone, 2008–2011 | 0.6931 | 0.4018 | **0.3846** |
| Ratings alone, 2012–2015 | 0.6931 | 0.3731 | **0.3639** |
| Ratings alone, 2016 onward (a second look, not an untouched test; data through 2026 round 17) | 0.6931 | 0.4085 | **0.3977** |

The hardest test is a driver in a new car, forecast from the rating before the move and nothing else: that is still forecast worse than a driver who stayed (see [OPEN_PROBLEMS.md](OPEN_PROBLEMS.md)). The reasoning behind the design is in [docs/detach.md](docs/detach.md) and [docs/state-space.md](docs/state-space.md); every metric is defined in [docs/metrics.md](docs/metrics.md).

## Run it

You need Node.js 24 or newer. Chrome or Chromium is needed only for the browser test.

```bash
npm install        # development tools only (ESLint, Prettier); the site has no dependencies
npm run serve      # http://localhost:8000/  (redirects to /site/)
```

```bash
npm test               # every Node test, including the golden-master hashes
npm run lint           # ESLint and Prettier
npm run test:browser   # drives the real site in headless Chrome
```

The server serves the repository root, so the page can import `packages/core/` and fetch `data/`. ES modules need `http`, not `file://`.

## How the site gets its numbers

The ratings are **computed once, when the site is published**, not in every visitor's browser. `node tools/build-model.mjs` builds the model from the CSV tables in `data/` and writes `data/model-latest.json` (the first screen), `data/model.json` (every weekend) and `data/export-rows.json` (the rows of every weekend, for anyone who wants them as a table; the site itself does not load it). The site downloads the other two. Each records a fingerprint of the data and of `packages/core/src`; `tests/test-model-file.mjs` fails if they are out of date, and it also checks that what a visitor sees equals a fresh build. After changing the data or the model, run `npm run build:data` and commit the result: it runs `tools/build-model.mjs` and also `tools/build-race-laps.mjs` (every driver's lap times for each season, `data/race-laps/`, behind the replay of the race) and `tools/build-tracks.mjs` (the circuit outlines, `site/assets/tracks.json`). A circuit that has not raced before needs an outline: add its file from `data/source/f1-circuits/` and a line in `SOURCE_FILES` in `tools/build-tracks.mjs` (the test fails until you do, or until you add the circuit to the few it lists as having none).

The first screen needs about 0.06 MB; see [docs/deployment.md](docs/deployment.md) for the measurements.

## Repository layout

```
site/                  The website: static files, no build step
  index.html, css/, assets/
  js/                  The pages (ratings, history, head-to-head, insights, methodology, legal), routing, charts, the model loader
  vendor/              Third-party fonts and KaTeX, served from the site itself, with their licences
packages/
  core/src/            The model: pure JavaScript with no DOM, runs in Node or the browser
    state-space/         The joint state-space model: observations, filter, race-reads-qualifying link, build
    forecast/            Form trackers, head-to-head forecasts, what-if matchups
    elo-*.js             A conventional Elo-style system, kept as a benchmark and for two small per-driver tracks
    json-serialization.js  How the built model is written to and read from JSON
  eval/src/            The evaluation harness: forecast scores, mover and teammate tests, synthetic worlds
  research/            The scripts that produced the model: metric suite, calibration, simulations (Node); head fitting and the Insights numbers (Python)
data/                  The race tables (CSV), their licence notice, and the built model files
docs/                  Model notes (state-space, detach, diagnosis, metrics, evaluation, elo), design, compliance, deployment
research/              Committed research results and the pre-registered acceptance rules
tools/                 Local server, model and site builders, publication and live-site checks
tests/                 Golden-master, regression, structure, compliance and browser tests
```

`packages/core` must never import from `site/` or touch browser globals; `tests/test-layering.mjs` enforces it.

## Data and licences

- **Code:** [MIT](LICENSE).
- **Race data:** the tables in `data/` come from [TracingInsights/RaceData](https://github.com/TracingInsights/RaceData), which labels them CC0 but also credits [Jolpica-F1](https://github.com/jolpica/jolpica-f1) (CC BY-NC-SA 4.0) and Kaggle datasets that are reported to derive from the Ergast database. It does not say which table comes from which source, so this project follows the strictest licence involved.
- **Ratings, findings, charts, text and the published data files:** [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): credit, **non-commercial**, share-alike. The credit line and the full reasoning are in [data/NOTICE.md](data/NOTICE.md).
- **Third-party files** in `site/vendor/` (Inter, Space Grotesk, Lexend Giga, KaTeX) keep their own licences, which are included.
- **The circuit outlines** in `site/assets/tracks.json` come from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT); their licence is in `site/assets/tracks-licence.txt` and the source files are in `data/source/f1-circuits/`.
- **The drawing** in `site/assets/art/` is not covered by any of the licences above: all rights reserved unless its owner says otherwise (see the notice in that folder).

Because the data is non-commercial, so is this project: **no advertising, no affiliate links, no paid access.** [docs/compliance.md](docs/compliance.md), section 8, explains why and what would change it. Please do not use the ratings commercially.

## Privacy

The site sets no cookies, has no analytics, and loads nothing from any other origin (fonts and formulas are served from the site itself, and a Content-Security-Policy makes the browser refuse anything else). The only thing it can store on a visitor's device is the light or dark theme, and only after they press the button. These are properties that tests check, not only promises: `tests/test-compliance.mjs` checks the files, the browser test checks the running site, and `tools/check-live-site.mjs` checks the deployed one. [docs/compliance.md](docs/compliance.md) records the rules that were checked (GDPR, UK GDPR, ePrivacy and others), what was done, and what only the operator can do. It is a careful record, not legal advice.

## Deploying

The site is published on Cloudflare Pages. [docs/deployment.md](docs/deployment.md) has the costs (hosting is free; a domain is optional), the one-time setup, and how to keep the ratings current after each race.

## Contributing

Issues and pull requests are welcome, within the non-commercial licence above.

- Read [CLAUDE.md](CLAUDE.md): the working guidelines, including how names are chosen (precise, professional, spelled out: `state-space`, not `ss`).
- Run `npm run lint` and `npm test` before opening a pull request. If you change `packages/core/src` or the data, run `npm run build:data` too.
- A change to the model's outputs changes the golden-master hashes in `tests/golden.json`; update them deliberately (`node tests/golden.mjs --update`) and say why.
- If a change adds anything that loads, stores or collects data (a script, a font, an analytics call, a form), it needs to update the privacy notice and `docs/compliance.md` first.

## Disclaimer

The ratings are statistical estimates from past results, shown with their uncertainty. They are not facts about any person, not betting tips and not advice. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trademarks of Formula One Licensing B.V.
