# Deploying and running the site

The site is static files. It is published on **Cloudflare Pages**; the privacy notice names that host, and only Cloudflare reads the `_headers` file that carries the Content-Security-Policy, so the workflow deploys nowhere else. Prices were read from the vendors' pages on 19 October 2026 and move; check each before relying on it.

## What it costs

| Item | Cost | Source |
| --- | --- | --- |
| Hosting, HTTPS certificate and bandwidth on Cloudflare Pages (free plan) | $0. Static requests are free and unlimited; free-plan limits are 25 MiB per file, 20,000 files and 500 builds a month (this site: the largest file is about 7.5 MB, under 300 files, one build per push) | [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [pricing](https://developers.cloudflare.com/pages/functions/pricing/) |
| A free address ending `.pages.dev` | $0 | Cloudflare Pages |
| A custom domain (optional), for example a `.com` bought at Cloudflare at cost | about $10.46 the first year if bought before 1 November 2026, then about $11.17 (the registry price rises from $10.26 to $10.97 on 1 November 2026, plus a $0.20 ICANN fee) | [Verisign notice](https://domainnamewire.com/2025/11/19/verisign-can-increase-com-prices-in-2026/), [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) |
| GitHub Actions for building and testing | $0 for a public repository | |
| Analytics | None, deliberately (see [compliance.md](compliance.md)) | |

The project is non-commercial because of the licence of its data, so there is no income to set against these costs; see [compliance.md](compliance.md), section 8.

## Load time and traffic

Measured on this build (19 October 2026), compressed the way a CDN serves it:

| Piece | Brotli | Gzip |
| --- | --- | --- |
| `data/model-latest.json` (first screen) | 0.03 MB | about 0.04 MB (estimate) |
| Site code and the model package for the first page (Head to head forecasting, about 0.5 MB, and the Insights and Methodology code are fetched when those pages open) | 0.03 MB | about 0.15 MB (estimate) |
| `data/model.json` (full history, fetched after the first screen is shown) | 0.80 MB | about 1.2 MB (estimate) |
| Fonts, if self-hosted | about 0.1 MB (estimate) | |
| **Before the ratings show** | **about 0.06 MB** | **about 0.1 MB (estimate)** |
| **First visit, everything** | **about 0.75 MB** | **about 1.1 MB** |
| Repeat visit | model revalidated, "not modified" | |

If every visit were a first visit (worst case), at 1.1 MB:

| Visits a month | Data a month | Cloudflare Pages (free) | GitHub Pages (for comparison) |
| --- | --- | --- | --- |
| 1,000 | 1.1 GB | $0 | within the 100 GB soft limit |
| 10,000 | 11 GB | $0 | within |
| 100,000 | 110 GB | $0 (static requests are free and unlimited per Cloudflare's docs; "unlimited bandwidth" comes from secondary sources only) | over the [100 GB soft limit](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) |

So traffic does not drive cost at any scale this project will reach. It would drive the risk of being asked to leave a free host, which is one more reason to use Cloudflare.

**Measured time to a working page** (headless Chrome, 19 October 2026, local server, CPU slowed 4 times to stand in for a mid-range phone; the network speed is applied to the compressed size a CDN would send, 2.6 MB):

| Case | Time until the ratings show |
| --- | --- |
| First visit, slow 4G (1.6 Mbit/s, 150 ms) | **17 s**, almost all of it the download |
| First visit, ordinary 4G (about 9 Mbit/s) | about 4 s (2.6 MB takes 2.3 s; computed, not measured) |
| Repeat visit, network fast, CPU slowed 4 times | **1.2 s** (this is the parse and decode of the file) |
| Repeat visit, slow network | not measured meaningfully: the local test server cannot answer "not modified", so the file was downloaded again. A CDN does; confirm after deploying |

So the 10 seconds of computing is gone, but on a poor mobile connection the first visit is still slow because of the download.

**Lighter first visit** (same method, measured by `node tools/measure-load-time.mjs`: the page reports the moment the ratings show; download time is computed from the brotli size of every file fetched before that moment, plus 150 ms). Changes, in the order tried:

| Step | Downloaded before the ratings show (brotli) | Slow 4G | Ordinary 4G |
| --- | --- | --- | --- |
| Before | 2.53 MB | about 14.2 s | about 3.8 s |
| 1. The per-driver and per-car histories (`dh`, `ch`) left out of the file and rebuilt in the browser from the weekends (`packages/core/src/weekend-histories.js`; identical to the original, checked row by row) | 1.65 MB | about 9.4 s | about 2.7 s |
| 2. The recent-form column computed when the file is built; the forecasting code (0.5 MB with the fitted tables) loads when Head to head opens | 1.08 MB | about 6.5 s | about 2.1 s |
| 3. Weekend ratings kept to 6 significant digits (the pages show whole points; matchups use the extra precision) | | | |
| 4. A first-screen file, `data/model-latest.json` (the latest weekend and each entry's previous row); the full 0.80 MB history is fetched after the ratings are on screen and replaces it. An address that names another page or a weekend waits for the full file | | | |
| 5. `modulepreload` for the 35 modules and a `preload` of the first-screen file, so the browser does not discover imports one level at a time (`tests/test-site-imports.mjs` fails if one is missing) | 0.14 MB | about 1.2 s | about 0.6 s |
| 6. The first-screen file drops what only other pages read (the circuit and wet-weather skills were more than half of it; also the name lists); Insights and Methodology code is fetched when those pages are first opened. `tests/test-site-imports.mjs` also fails if `index.html` announces a module that is not loaded at start | **0.06 MB** | **about 0.8 s** | **about 0.6 s** |

First-visit download down 98% (2.53 MB to about 0.06 MB). The measured 0.4 s of processing is with the CPU slowed 4 times; the same page takes roughly 0.1 s on an unthrottled laptop. The full history is fetched after the first screen and is needed for History, Head to head, Insights, Methodology and the weekend slider. With ratings extended to 1994, `data/model.json` is 7.54 MB uncompressed and about 0.97 MB Brotli compressed (26 October 2026); the timing figures above are older measurements and should be remeasured. Repeat visits still revalidate each file (a round trip each, answered "not modified"); a service worker or a content-hashed file name would remove that and is not done. Six significant digits keep rating-rounding error below about 0.001 point near 1,000; `tests/test-model-file.mjs` checks the what-if forecasts against a fresh build.


## One-time setup

1. **Set the contact details** in `site/js/site-identity.js` (`operatorName`, `contactEmail`). The privacy notice must name a person responsible and a way to reach them; `npm run check:publication` fails until they are set, and both deployment routes below run it.
2. **Create a free Cloudflare account** and connect the repository. There are two routes; the first needs no secrets.

   **Route A: Cloudflare builds from GitHub (simplest).** In the dashboard: *Workers & Pages*, *Create application*, *Pages*, *Connect to Git*, choose this repository (GitHub asks you to authorise Cloudflare for it). Then set:

   - Project name: `car-or-driver` (the site will be at `https://car-or-driver.pages.dev/`)
   - Production branch: `main`; framework preset: none
   - Build command: `npm ci && npm run lint && npm test && npm run check:publication && node tools/build-pages.mjs https://car-or-driver.pages.dev/`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `24`

   Every push to `main` is then tested, checked and published; a failing test or an empty contact address stops the deploy. (This setup has not been run end to end; the first build will show whether the build image needs anything more.)

   **Route B: GitHub Actions and Direct Upload.** `.github/workflows/deploy.yml` does the same with `cloudflare/wrangler-action` ([Cloudflare's CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)). Create the Pages project with *Direct Upload*, add the repository secrets `CLOUDFLARE_API_TOKEN` (an API token with the *Cloudflare Pages: Edit* permission) and `CLOUDFLARE_ACCOUNT_ID`, and the repository variable `SITE_URL` (the address with a trailing slash). The deploy job stays skipped until `SITE_URL` is set. Use one route, not both.

3. **Cloudflare settings that must stay off** (the privacy notice depends on them; the full list is in [compliance.md](compliance.md), section 6): Web Analytics, Logpush, Bot Fight Mode, Waiting Room, Email Address Obfuscation and automatic script injection.
4. **After the first deploy**, run `node tools/check-live-site.mjs https://car-or-driver.pages.dev/` (route B does it automatically). It fails if any response sets a cookie, a policy header is missing, or the page loads anything from another origin. Then open the site once with the browser's developer tools: *Application* should show no cookies and empty local storage, and *Network* only your own domain.
5. **A custom domain** is optional (see the costs above): in the Pages project, *Custom domains*. Then update the address in the build command or `SITE_URL`, and in the README.

## Keeping the ratings current

This costs no money, but it is the real ongoing price: about 24 race weekends a year, and each one changes the ratings.

The `Refresh Grand Prix data` GitHub Action checks the public mirrors daily at 10:17 UTC and can also be run manually. When a new completed race appears, it checks that the new race has enough entries to be complete and appends those records while preserving the published history. It then rebuilds the ratings, teammate graph, racing laps, circuit art and Insights, updates the data-dependent golden fingerprints, runs lint, every test and the publication gate, and commits to `main`. Cloudflare Pages rebuilds from that commit. A failed source or check stops before the push, so the last working site stays live. The workflow needs `contents: write` permission and a branch policy that allows its bot commit.

The source mirrors can publish late or correct old rows. Older-row corrections are logged and ignored by the automatic update; review them separately before changing published history. A new circuit without an outline or a failed model/Insights check also requires investigation. The full manual sequence is in [data/README.md](../data/README.md).

Note the `data/model.json` file is committed, so each refresh adds about 3 MB (compressed) to the repository history: about 70 MB a year. Not a problem for years; the repository is 52 MB today.

