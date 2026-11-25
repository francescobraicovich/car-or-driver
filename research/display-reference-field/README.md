# Display reference field

**Decision: 1,000 is the median of the 20 highest-rated drivers, or the 10 highest-rated cars, computed from the ratings the pages display.** The 20-weekend lag is unchanged. No variance scale is applied. The model, forecasts and saved model files are unchanged; only the display reference changed: its module, builder, data file and the loader binding.

## The defect

The six display references were computed from the filtered (chronological) model and then applied to the retrospective ratings that Ratings, History and Graph show. The two fits agree at the latest weekend, but not in the early years: the retrospective fit starts from a 1990 warm-up and the filtered one starts cold in 1994. Under the previous reference, the median driver displayed at 1,022–1,027 in 1994–1996, the median car at 1,056–1,070, and 12 of the 15 highest all-time driver peaks came from 1994–1996.

## Why a fixed-size field

A reference computed from the displayed ratings removes the defect, but the field it averages over also matters. Grids held 28 drivers in 1994, 20 from 2017 to 2025 and 22 in 2026, and 27% of 1994–1997 entries were drivers with fewer than 20 previous starts, against 11% in 2022–2025. Those drivers debut about 20–45 points below the reference.

- **Field mean and field median** move when backmarker entries come and go. After Pacific and Simtek folded, the 1996 median driver displays at 1,015 under the field mean and 1,010 under the field median.
- **A median of drivers with at least 20 starts** is a hard threshold, and its effect depends on the era's turnover.
- **The median of the 20 highest-rated drivers** is unaffected by entrants below it and needs no experience threshold: a newcomer counts by rating. The 1996 median driver displays at 1,003; large grids sit below 1,000 (989 in 1994, 991 in 2010) because they had a weaker tail.

The size is fixed at 20 drivers and 10 cars, the modern grid, and never changes, so later grids cannot revise earlier references. Sizes from 16 to 24 give the same conclusions: 5–6 of the top 15 peaks from 1994–1996 and a highest peak of 1,103–1,119 (Michael Schumacher, 1995).

The field mean, field median and highest-20 rules all reduce the 1994–1996 peaks in the all-time top 15 from 12 to 5–6; that count does not distinguish them. The choice rests on the behaviour under grid-size changes and newcomers.

## Why no variance scale

The robust spread of the 20 highest-rated drivers was 20.9, 24.5 and 16.4 in 1994–1996, inside the 14–28 range of later seasons. The apparent 1990s excess comes from the backmarker tail, which a fixed-size field excludes. A spread estimated from about 20 drivers also depends heavily on which drivers are counted: in 1997 it is 18.4, 19.4 or 26.1 under the three definitions in the script. Dividing every rating by it would add that uncertainty to each gap and remove the reading that a 75-point overall gap is 10:1 odds.

## Limitations

The absolute level across eras is not identified: 1,000 is a convention, chosen as the population least affected by grid size and turnover. The 1994–1996 ratings remain sensitive to the warm-up and initial prior. Weakly connected backmarker teammate pairs remain anchored near the field average; Andrea Montermini's 1995–1996 peak is about 1,027–1,029.

## Reproduction

From the repository root, `node research/display-reference-field/compare-reference-rules.mjs` prints every comparison above from `data/model.json`, `data/retrospective.json`, `data/results.csv` and `data/races.csv`. The previous reference is recomputed from the filtered model, so the comparison does not depend on the saved reference file. `tests/test-rating-reference.mjs` checks the published rule, its invariances and that the saved reference matches a rebuild.
