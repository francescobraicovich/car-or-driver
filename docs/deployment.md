# Deployment and operation

The website is a static Cloudflare Pages deployment. The privacy notice names Cloudflare and the deployment package includes `_headers` for its security policy. Set the operator and contact details in `site/js/site-identity.js` and run `npm run check:publication` before publishing. The [compliance record](compliance.md) describes the privacy and licence requirements.

## Configure publication

Choose one of the following routes; the repository does not establish which route is configured in the Cloudflare account.

- **Cloudflare Git integration:** connect the repository, set production branch `main`, framework preset none, Node version 24, Python version 3.12, output directory `dist`, and build command `python3 -m pip install -r requirements-model.txt && npm ci && npm run lint && npm test && npm run check:publication && node tools/build-pages.mjs https://your-site.example/`. Set the actual site URL in the command. Python is needed for model verification during the build; the deployed site is static.
- **GitHub Actions Direct Upload:** create the Pages project `car-or-driver` for Direct Upload, configure repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and set repository variable `SITE_URL` to the published URL. `.github/workflows/deploy.yml` runs on `main` or manual dispatch; it skips deployment when `SITE_URL` is unset or the repository is a fork. It checks, builds, deploys and checks the live site.

Keep Cloudflare Web Analytics, Logpush, Bot Fight Mode, Waiting Room, Email Address Obfuscation and automatic script injection off unless the privacy record and site are updated to reflect the change. After deploying, run `node tools/check-live-site.mjs https://your-site.example/` and inspect the site in a browser.

## Refresh data

`.github/workflows/refresh-gp.yml` checks source mirrors daily at 10:17 UTC and supports manual dispatch. It validates completed new weekends, preserves published historical records, builds ratings, graph, laps, tracks and Insights, updates data-dependent fingerprints, runs checks and commits the result to `main`. The workflow requires permission to push to the branch. Older corrections are reported and need separate review; missing circuit outlines and failed checks also need attention.

For manual updates and source provenance, see [data/README.md](../data/README.md). For the local build and verification commands, see [architecture.md](architecture.md).
