# Car or Driver

**How much of a Formula 1 result is the driver, and how much is the car?**

Car or Driver is a free, non-commercial research project and website that estimates driver and car performance independently. It publishes time-varying ratings for every driver and car after each Formula 1 weekend since 1994, with uncertainty attached to each estimate.

The aim is not to declare a definitive “best driver” or “best car.” It is to make a difficult question explicit, quantify it carefully, and show what the available evidence can—and cannot—support.

## The problem

A race result is produced by a driver and a car together, in particular conditions. Strong results may reflect exceptional driving, an exceptional car, or both. Looking only at finishing positions makes those contributions hard to separate.

That matters whenever drivers change teams, teams develop at different rates, or we compare careers across seasons. A rating that follows results alone will often mistake machinery for driver ability, or driver performance for machinery.

## Why independent ratings are difficult

We never observe a driver without a car, or a car without a driver. The data consists of pairings, not isolated performances.

Several things make the separation especially challenging:

- Drivers and cars are not assigned at random. The strongest drivers and teams often end up together.
- Performance changes over time: cars develop, drivers improve or decline, and teams make operational gains or losses.
- Results also reflect circuit characteristics, weather, strategy, reliability, safety cars, and incidents.
- Teammates give useful comparisons because they share a team context, but they are still not perfect controlled experiments.
- A driver moving to a new car is the most revealing test of portability—and one of the hardest predictions to make.

There is no way to remove all ambiguity from historical race data. A useful model should acknowledge that ambiguity rather than hide it behind a single confident ranking.

## Why this is interesting

Separating driver and car performance makes familiar Formula 1 questions more concrete:

- How much did a driver contribute beyond the machinery available to them?
- How should we interpret a strong season in a weak car, or a quiet season in a dominant one?
- What can a driver’s previous record tell us when they change teams?
- How much of the grid’s order survives from one season to the next?

It is also a useful modelling problem: the answer must be inferred from incomplete, changing, and highly confounded evidence. That makes uncertainty and out-of-sample testing as important as the rankings themselves.

## The approach

Car or Driver models driver and car pace jointly as hidden quantities that change over time. It uses race and qualifying comparisons, state-space filters, and an online pair-ranking learner to estimate dated driver and car levels.

The published ratings combine these estimates and present them on a scale centred on 1,000. A rating is an estimate, not a fact about a person or a machine; the displayed uncertainty reflects how much the model can infer from the available results.

This is a good attempt at the problem because it does not treat drivers or cars as fixed, isolated labels. It models both together, lets their estimates evolve, reports uncertainty, and evaluates forecasts using only information available before the weekend being predicted.

The most demanding evaluation is a driver joining a new car. The model improves on simpler approaches in that setting, but this remains an open problem rather than a solved one. See [OPEN_PROBLEMS.md](OPEN_PROBLEMS.md) for the limitations and next questions.

Further detail is available in:

- [Hybrid model](docs/hybrid.md)
- [State-space model](docs/state-space.md)
- [Evaluation metrics](docs/metrics.md)
- [Open problems](OPEN_PROBLEMS.md)

## Run locally

Node.js 24 or newer is required. Chrome or Chromium is needed only for browser tests.

```bash
npm install
npm run serve
```

The site is available at `http://localhost:8000/` and redirects to `/site/`.

```bash
npm test
npm run lint
npm run test:browser
```

The repository root is served so the site can import `packages/core/` and fetch `data/`. Use HTTP rather than `file://`.

## Updating the published data

The ratings are computed when the site is published, not in each visitor’s browser.

```bash
npm run build:data
```

This rebuilds the rating files, teammate graph, race-lap data, and circuit assets from the source data and model code. After changing the model or data, commit the rebuilt output.

## Repository layout

```text
site/             Static website and interface
packages/core/    Rating models and forecasts
packages/eval/    Evaluation harness
packages/research/ Research scripts
data/             Race data and published model files
docs/             Methodology and operational documentation
research/         Committed research results
tools/            Local server and build tools
tests/            Regression, compliance, and browser tests
```

`packages/core` is independent of the browser and must not import from `site/`.

## Data and licences

- **Code:** [MIT](LICENSE).
- **Race data:** sourced from [TracingInsights/RaceData](https://github.com/TracingInsights/RaceData). See [data/NOTICE.md](data/NOTICE.md) for attribution and licensing context.
- **Ratings, findings, charts, text, and published data files:** [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
- **Third-party files:** retain their own licences.
- **Circuit outlines:** derived from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT).
- **Artwork:** see the notice in `site/assets/art/`.

Because the underlying data is non-commercial, this project is non-commercial: no advertising, affiliate links, or paid access. Please do not use the ratings commercially.

## Privacy

The site sets no cookies, has no analytics, and loads no resources from other origins. It stores nothing on a visitor’s device. See [docs/compliance.md](docs/compliance.md) for the implementation and checks.

## Contributing

Issues and pull requests are welcome.

Before opening a pull request, run:

```bash
npm run lint
npm test
```

If you change `packages/core/src` or `data/`, also run:

```bash
npm run build:data
```

Read [CLAUDE.md](CLAUDE.md) for repository conventions.

## Disclaimer

These ratings are statistical estimates based on historical results. They are not facts about any person, not betting advice, and not professional advice.

F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX, and related marks are trademarks of Formula One Licensing B.V.
