# Site design

The site has five pages, Ratings, History, Head to head, Insights and Methodology, in the navigation, and two more reached from the footer, Privacy and cookies and About, data and licences. They share one system: the same tokens, chart renderer and frame. There is no separate research mode; the model's settings, the retirement-cause table, the Elo variant and the per-weekend audit tables were removed from the page (they are in the repository: `docs/`, `research/`, `npm run research:suite`).

## Principles

- **The chart is the page.** Every chart sits in one frame: a title that says what it shows, one sentence of subtitle, controls in a single row above, the plot, then small print (what the numbers are, data date). Explanations that do not fit there live on How it works.
- **Interaction follows Our World in Data.** Timeline with play and scrub for weekends, removable chips with a search-to-add list for series, a season range, a Chart/Table toggle on every chart, hover/tap/arrow-key crosshair listing every series at that date.
- **Two brand colours, two faces.** The product is the split between driver and car, so the brand is two colours: *ember* (`--accent`, the driver) and *car blue* (`--car`, the car), on warm paper (light) or deep navy (dark). Headings and numbers use Space Grotesk, body text Inter, both served from this site (`site/vendor/fonts`, SIL Open Font Licence) with system fallbacks, so the page is readable before they arrive and no visitor's address is sent to another company.
- **Plain copy.** No marketing lines. The only decoration is the hero on the Ratings page and the icons in the phone tab bar.
- **Phone first for navigation.** Below 900 px the five pages become a tab bar fixed to the bottom of the screen (within thumb reach); above it they are links in the header. The selection bar on Ratings sits above the tab bar.

## Colour

Every colour on the site is a token in the two blocks at the top of `site/css/styles.css`, `:root` (light) and `:root[data-theme='dark']`. There are no raw colours elsewhere, with one exception: `site/assets/favicon.svg` cannot read the stylesheet, so it repeats the night, ember and blue values.

| Role | Light | Dark |
| --- | --- | --- |
| Page / surface | `#f3efe6` / `#fffdf8` | `#080b15` / `#121828` |
| Ink, then secondary and tertiary text | `#121629`, `#454a63`, `#5b6079` | `#f4f6fc`, `#c4c9dc`, `#9aa1bb` |
| Ember (driver, primary button) | `#d93a1c`, text `#b92d11` | same, text `#ff7a5c` |
| Car blue (hero only; charts use slot 1) | `#1f66c1` | same |

Series colours are the eight-slot categorical palette from the dataviz skill, in fixed order, stepped separately for the dark surface. They were checked with its validator against the real surfaces (`#fffdf8` light, `#121828` dark):

| Mode | Lightness band | Chroma | Colour-vision separation | Normal-vision floor | Contrast vs surface |
| --- | --- | --- | --- | --- | --- |
| Light | pass | pass | pass (worst adjacent ΔE 9.1) | pass (19.6) | **warn**: aqua, yellow and pink are under 3:1 |
| Dark | pass | pass | pass (8.4) | pass (19.3) | pass |

The light-mode warning is the documented one. Its required relief is in place: every multi-series chart has direct end labels (or an in-chart legend on narrow screens) and a table view, and text never takes a series colour.

Colour follows the entity: `assignSlots` (`site/js/chart-math.js`) keeps a series in its slot while others are added or removed, and gives a freed slot to the next newcomer. At most eight series are allowed at once.

Not used, deliberately: team colours. They are meaningful to fans but there are more teams than validated slots and they change across 26 seasons, so they would need hand-curated data and break the colour-vision checks.

## Comparing

On Ratings every row has a round marker. Selecting up to eight drivers (or cars) raises a bar with three actions: *Compare in history* (the History page opens with exactly those lines), *Head to head* (enabled for exactly two drivers; they become driver A and B) and *Clear*. The selection is the same list the table view edits with its checkboxes.

## What was measured, not assumed

- Round axis values (`niceTicks`), date ticks that land on years, and label spacing that keeps end labels apart are pure functions with tests (`tests/test-chart-math.mjs`).
- `tests/smoke-browser.mjs` drives the real site in headless Chrome: ranked chart draws, Cars switch, play advances the timeline, History draws a line per chip and its table, Head to head shows a probability, Methodology fills its figures; the navigation has exactly five links and no research page; a weekend chosen on Ratings survives a reload; the addresses of the earlier Home/Research site (`#/simple/…`, `#/geek/…`) still land on a page. `tests/test-dom-ids.mjs` guards the ids the scripts look up.
- Layout was checked at 1200 px and 375 px in light and dark.

## Known limits

- Play steps one weekend at a time (about 90 ms each), so a full run is about a minute. There is no speed control.
- The Ratings chart redraws on each step rather than animating rows between positions.
- Text contrast is checked by `tests/test-contrast.mjs` (WCAG AA, 4.5:1, both themes). Series colours are not text and are covered by the palette validation above.

## Privacy by construction

The site loads nothing from another origin and sets no cookies: fonts and KaTeX are served from `site/vendor/`, and a Content-Security-Policy (`tools/deploy-headers.txt`, published as `_headers`) makes the browser refuse any other origin. The theme is stored only after the visitor presses the button. `tests/test-compliance.mjs` and the browser smoke test hold these properties; the reasoning and the rules checked are in `docs/compliance.md`. Any new feature that loads, stores or collects anything has to start there.
