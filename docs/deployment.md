# Deployment and operation

The website is a static Cloudflare Pages deployment. The privacy notice names Cloudflare and the deployment package includes `_headers` for its security policy. Set the operator and contact details in `site/js/site-identity.js` and run `npm run check:publication` before publishing. The [compliance record](compliance.md) describes the privacy and licence requirements.

## Configure publication

The site is published at https://carordriver.com/ through the first route, Cloudflare's Git integration; the second is an alternative.

- **Cloudflare Git integration:** connect the repository, set production branch `main`, framework preset none, Node version 24, Python version 3.12, output directory `dist`, and build command `python3 -m pip install -r requirements-model.txt && npm ci && npm run lint && npm test && npm run check:publication && node tools/build-pages.mjs https://carordriver.com/`. The address in the command is the site's own; every page names it as its canonical address. Python is needed for model verification during the build; the deployed site is static.
- **GitHub Actions Direct Upload:** create the Pages project `car-or-driver` for Direct Upload, configure repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and set repository variable `SITE_URL` to the published URL. `.github/workflows/deploy.yml` runs on `main` or manual dispatch; it skips deployment when `SITE_URL` is unset or the repository is a fork. It checks, builds, deploys and checks the live site.

Keep Cloudflare Web Analytics, Logpush, Bot Fight Mode, Waiting Room, Email Address Obfuscation and automatic script injection off unless the privacy record and site are updated to reflect the change. Also keep Rocket Loader and other script rewriting off (the security policy blocks injected scripts), and leave robots.txt to the site (Cloudflare's managed robots.txt would add rules to it). After deploying, run `node tools/check-live-site.mjs https://carordriver.com/` and inspect the site in a browser.

## Search engines

The build publishes a page for every address: each page of the site (`/ratings`, `/methodology/full`, …) with its own title, description and text for readers without scripts, a page for each finding (`/insights/best-f1-driver-of-all-time`), driver, team and pair of teammates, a page comparing two drivers the front page asks about (`/compare/lewis-hamilton-vs-max-verstappen`), a page for each season that is over (`/seasons/2021`), a site map (`/sitemap.xml`), `robots.txt` and a `404.html` that Cloudflare Pages serves for addresses with no page. `_redirects` sends the old addresses under `/site/` to the root, and `_headers` asks search engines to leave out the copy at `car-or-driver.pages.dev`. Verify the site in Google Search Console (a Domain property) and Bing Webmaster Tools with DNS records, so that no script is added to the pages, and submit `https://carordriver.com/sitemap.xml` in both.

## Refresh data

`.github/workflows/refresh-gp.yml` checks source mirrors daily at 10:17 UTC and supports manual dispatch. It validates completed new weekends, preserves published historical records, builds ratings, graph, laps, tracks and Insights, updates data-dependent fingerprints, runs checks and commits the result to `main`. The workflow requires permission to push to the branch. Older corrections are reported and need separate review; missing circuit outlines and failed checks also need attention.

For manual updates and source provenance, see [data/README.md](../data/README.md). For the local build and verification commands, see [architecture.md](architecture.md).
