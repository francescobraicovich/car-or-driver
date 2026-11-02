# Car or Driver

How much of a Formula 1 result is the driver, and how much is the car? This static, non-commercial website separates their ratings after every race weekend since 1994. It includes rating histories, head-to-head forecasts, a teammate graph, race replays, twenty findings and the methodology behind them.

## Run and verify

Use Node.js 24 or newer. The website has no runtime dependencies; npm installs development tools.

```bash
npm ci
npm run serve          # http://localhost:8000/ redirects to /site/
npm test               # model, data, website and deployment regression tests
npm run lint           # ESLint and Prettier
npm run test:browser    # complete website checks; requires Chrome/Chromium
npm run build          # assemble the deployable static website in dist/
```

ES modules require HTTP. Serve the repository root so the website can load `packages/core/` and `data/` at their deployed paths.

## Find your way around

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

The published driver rating blends the race filter (48%), qualifying filter (32%) and online ranking learner (20%). Car ratings blend race (75%) and qualifying (25%). Ratings are centred on 1,000; displayed uncertainty is an approximation from the race filter, not a calibrated interval for the complete blend.

[The hybrid methodology](docs/hybrid.md) records the exact calculation, measured comparisons, selection caveats and reproduction commands. [Known limitations](docs/limitations.md) records unresolved model problems. The website's Methodology page gives the reader-facing explanation.

## Licences and privacy

- Program code: [MIT](LICENSE).
- Race data, derived ratings, findings and published text: **non-commercial**, attribution and share-alike; see [data/NOTICE.md](data/NOTICE.md) for provenance and licence details.
- Vendor fonts, KaTeX and circuit outlines retain their included licences. Artwork has [separate terms](site/assets/art/NOTICE.txt).
- The website uses no cookies, analytics, third-party requests or browser storage. [The compliance record](docs/compliance.md) and automated checks document these properties.

Read [CLAUDE.md](CLAUDE.md) before contributing. Core modules must remain independent of the website interface; preserve model output during refactors and run the checks above.

This independent project is not affiliated with Formula 1, the FIA, teams or drivers. Ratings are statistical estimates, not facts about individuals or betting advice.
