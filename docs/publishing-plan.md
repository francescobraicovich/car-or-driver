# Publishing plan: where we are and what is left

Status on 20 October 2026. The costs, the one-time setup in detail and the measurements are in [deployment.md](deployment.md); the rules that were checked and what only the operator can do are in [compliance.md](compliance.md). This page is the short list of what stands between the repository and a live site.

## Done

- The repository is public and open source: https://github.com/francescobraicovich/driver-or-car (code under MIT; data, ratings, findings and text under CC BY-NC-SA 4.0; one commit, no earlier history).
- Continuous integration passes on GitHub's Linux servers (lint and every Node test). Two checks that depended on the CPU architecture were fixed on the way: the golden-master digests and the accuracy of tied forecasts.
- The privacy and About pages, the strict response headers (`tools/deploy-headers.txt`), the licence notices and the compliance record are in place.
- The deployment target is Cloudflare Pages, route A: Cloudflare builds from this repository. The build command runs lint, the tests and the publication check before every deploy. Hosting costs $0; a domain is optional (about $11 a year).

## Rule while the design is being redone

**Nothing reaches `main` until the new design is approved.** When route A is connected, every push to `main` is deployed. So the overhaul is built on the `redesign` branch, and `main` keeps the current design until you say the new one is ready to be posted. Work on the branch is committed locally and is not pushed until the artwork question below is answered.

## What is left, in order

| # | Step | Who | State |
| --- | --- | --- | --- |
| 1 | Give the contact email for the privacy notice (`contactEmail` in `site/js/site-identity.js`); the deploy refuses to run without it | you | waiting |
| 2 | Say where the drawing (red, blue and black-and-white versions) comes from and on what terms it may be published. Until then it is marked all rights reserved and kept out of both open licences | you | waiting |
| 3 | Approve the redesign (it replaces the front page; the other pages are restyled afterwards). The front page with the red, black-and-white and blue drawing, the box cursor and the ratings of the car and of the drivers is built on the `redesign` branch | you | first version ready for review |
| 4 | Sign in to Cloudflare (a free account). I never handle your credentials | you | waiting |
| 5 | Create the Pages project `driver-or-car` and connect the repository (route A in [deployment.md](deployment.md)). GitHub asks you to authorise Cloudflare; I will ask you before that click | me, with you | waiting for 1 and 4 |
| 6 | Check that the Cloudflare features that set cookies stay off (list in [compliance.md](compliance.md), section 6) | you | waiting for 5 |
| 7 | Merge `redesign` into `main` once approved; the push deploys | me | waiting for 2 and 3 |
| 8 | Run `node tools/check-live-site.mjs https://driver-or-car.pages.dev/`, then open the site with the browser's developer tools (no cookies, empty local storage, requests only to the site's own address) | me and you | after the first deploy |
| 9 | Optional: a custom domain (about $10.46 the first year, then about $11.17) | you | later |

## What every new design must still satisfy

These are checked by tests, so a redesign cannot quietly break them:

- No request to another origin, no cookie, nothing stored in the browser before the visitor presses the theme button (`tests/test-compliance.mjs` and the browser smoke test).
- The privacy and About pages stay reachable from the front page.
- Text contrast of at least 4.5 to 1 wherever text sits, measured, not judged by eye.
- It works with a keyboard, on a phone, and with reduced motion switched on.
- The first visit stays light: the first-screen weight is re-measured with `node tools/measure-load-time.mjs` and reported.
- Any new font or other file that is added is served from the site itself, with its licence.
