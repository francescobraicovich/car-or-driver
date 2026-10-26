# Publishing plan: where we are and what is left

Status on 26 October 2026. The costs, the one-time setup in detail and the measurements are in [deployment.md](deployment.md); the rules that were checked and what only the operator can do are in [compliance.md](compliance.md). This page is the short list of what stands between the repository and a live site.

## Done

- The repository is public and open source (code under MIT; data, ratings, findings and text under CC BY-NC-SA 4.0). Its GitHub URL will become https://github.com/francescobraicovich/car-or-driver when the owner renames the repository.
- Continuous integration passes on GitHub's Linux servers (lint and every Node test). Two checks that depended on the CPU architecture were fixed on the way: the golden-master digests and the accuracy of tied forecasts.
- The privacy and About pages, including the contact address `carordriver@proton.me`, the strict response headers (`tools/deploy-headers.txt`), the licence notices and the compliance record are in place.
- The deployment target is Cloudflare Pages, route A: Cloudflare builds from this repository. The build command runs lint, the tests and the publication check before every deploy. Hosting costs $0; a domain is optional (about $11 a year).
- The project owner confirmed that the front-page drawing was created with ChatGPT. Its provenance and separate reuse terms are recorded in `site/assets/art/NOTICE.txt`.
- The ratings panel now explains its default pace scale in one line and has an optional “How to read this” explanation. The line changes for effective pace and probability metrics.

## Rule while the design is being redone

**Nothing reaches `main` until the new design is approved.** When route A is connected, every push to `main` is deployed. So the overhaul is built on the `redesign` branch, and `main` keeps the current design until you say the new one is ready to be posted.

## What is left, in order

| # | Step | Who | State |
| --- | --- | --- | --- |
| 0 | Rename the GitHub repository to `car-or-driver`; the website source link and deploy workflow now target that name | you | waiting |
| 1 | Provide usable controller contact details for the privacy notice | you | done: `carordriver@proton.me` is set in `site/js/site-identity.js` |
| 2 | Confirm the drawing's origin and publishing terms | you | done: created with ChatGPT; provenance recorded in `site/assets/art/NOTICE.txt` |
| 3 | Approve the redesign (it replaces the front page; the other pages are restyled afterwards). The front page with the red, black-and-white and blue drawing, the box cursor and the ratings of the car and of the drivers is built on the `redesign` branch | you | publication requested; final browser review remains |
| 4 | Sign in to Cloudflare (a free account). I never handle your credentials | you | waiting |
| 5 | Create the Pages project `car-or-driver` and connect the repository (route A in [deployment.md](deployment.md)). GitHub asks you to authorise Cloudflare; I will ask you before that click | me, with you | waiting for 0 and 4 |
| 6 | Check that the Cloudflare features that set cookies stay off (list in [compliance.md](compliance.md), section 6) | you | waiting for 5 |
| 7 | Merge `redesign` into `main` once approved; the push deploys | me | waiting for 3 |
| 8 | Run `node tools/check-live-site.mjs https://car-or-driver.pages.dev/`, then open the site with the browser's developer tools (no cookies, empty local storage, requests only to the site's own address) | me and you | after the first deploy |
| 9 | Optional: a custom domain (about $10.46 the first year, then about $11.17) | you | later |

## What every new design must still satisfy

These are checked by tests, so a redesign cannot quietly break them:

- No request to another origin, no cookie and nothing stored in the browser (`tests/test-compliance.mjs` and the browser smoke test).
- The privacy and About pages stay reachable from the front page.
- Text contrast of at least 4.5 to 1 for ordinary text and 3 to 1 for the large title, measured, not judged by eye.
- It works with a keyboard, on a phone, and with reduced motion switched on.
- The first visit stays light: the first-screen weight is re-measured with `node tools/measure-load-time.mjs` and reported.
- Any new font or other file that is added is served from the site itself, with its licence.
