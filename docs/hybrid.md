# Published hybrid ratings

The website publishes a driver and car rating after every Grand Prix weekend. The current race rating is a fixed blend of three dated learners: the linked race state-space filter, an independent qualifying state-space filter, and an online pair-ranking learner. The qualifying rating shown separately remains the qualifying filter's output. The forecast heads use pre-weekend hybrid levels; they were refitted on those inputs.

## Inputs and update order

`buildStateSpace` in `packages/core/src/state-space/build.js` collects race and qualifying comparisons, runs the qualifying filter, runs the race filter with the dated qualifying link, then runs the online learner and blends their pre- and post-weekend outputs (`packages/core/src/hybrid/`). The race filter learns a driver, car and driver–car fit with a joint covariance. The fit is used internally and kept out of the portable driver level. `docs/state-space.md` explains those filters and their original settings.

The online learner has a driver level, car level, driver–car fit and wet-driver term. For a race pair it predicts `sigmoid((ln(10)/75) * (strength_x - strength_y))`, where strength is driver + car + fit + the wet term in a wet race. It takes one weighted gradient step after each weekend from race pairs, normalising by total race-pair weight. Teammates get twice the learning weight. The step size is 180 points; fit coefficients shrink by 15% per active update and other active coefficients by 0.1%. Across a winter, it retains 80% of car, 95% of driver and 40% of fit coefficients. It links car identities across renames. Its car, fit and wet terms help it learn the driver level, but only that driver level is published through the blend. Qualifying observations establish the weekend's active entrants; this learner's gradient uses race pairs.

For the portable driver levels `D_R`, `D_Q`, `D_O` from race, qualifying and online ranking, and car levels `C_R`, `C_Q` from the two filters, the published race levels are:

```text
D_published = 0.48 D_R + 0.32 D_Q + 0.20 D_O
C_published = 0.75 C_R + 0.25 C_Q
```

The driver formula is evaluated as `0.8 * (0.6 D_R + 0.4 D_Q) + 0.2 D_O`. These weights, the learner rule and the winter rule are identical for every entrant. There is no mover flag, arrival bonus, faster learning after a team change or component input in the online learner. The inherited state-space filter still resets its internal fit and widens its driver prior slightly at a team change; its explicit arrival penalty is off. A driver rating is field-centred to 1,000 after the weekend. The same blending rule is applied to pre-weekend levels for walk-forward evaluation and the forecast layer.

The three levels are correlated, because they learn from overlapping race histories. The blend is empirical, not a joint Bayesian posterior. The displayed standard deviation is retained from the race filter covariance and does **not** include qualifying or online-learner uncertainty or their correlations. It is an approximate guide, not a calibrated uncertainty interval for the complete hybrid. The prior race filter's variance multiplier was not re-estimated for the hybrid.

## Why this blend

The race filter is the strongest general driver/car backbone and maintains a full covariance. Qualifying gives a cleaner, partly transferable driver signal. Direct online ranking follows the network of past pair results without the filter's Gaussian approximation and contributes a different portable driver estimate. The separate car blend retains explicit car ratings, with most weight on race pace. The shares were selected by comparing historical all-pair forecast loss and a strict frozen-mover test. They were not learned independently on an untouched test set.

Weighted log-loss is lower when forecasts are better. On the same dated observations and scoring weights, the research scorecards for the previous published system and this blend are:

| Exam | Period | Previous | Hybrid |
| --- | --- | ---: | ---: |
| All race and qualifying pairs | 2008–2011 | 0.38456 | **0.38199** |
| | 2012–2015 | 0.36395 | **0.36011** |
| | 2016–2025 | 0.39888 | **0.39651** |
| Frozen mover, first five new-team weekends | 2002–2011 | 0.64944 | **0.64611** |
| | 2012–2015 | 0.72582 | **0.70836** |
| | 2016–2025 | 0.67284 | **0.65113** |

The frozen test fixes each mover's driver rating before their final weekend at the old team and scores duels with the new teammate. It does not let the rating adapt from results after the move. A paired bootstrap gives a pooled all-pair reduction of 0.00304 (95% interval 0.00191–0.00415, resampling seasons) and a mover reduction of 0.01411 (0.00082–0.02864, resampling 75 moves). The mover exam remains well above 0.5 loss in every period. The 2016–2025 window was inspected repeatedly during candidate selection and is not untouched holdout evidence. Through 17 completed 2026 weekends the hybrid and previous ratings are effectively tied on all pairs (0.38387 and 0.38383); that period was also inspected and its mover sample is only 16 duels.

The forecast-head architecture was kept and refitted on 259,211 dated hybrid-input rows, with data through 2007, 2011 and 2015 used to train heads for 2008–2011, 2012–2015 and 2016 onward. The previously recorded acceptance rule passed in both earlier four-year windows. The combined Thursday/race-day head losses are 0.38113/0.33670 in 2008–2011 and 0.35900/0.32466 in 2012–2015, against the Elo-input reference heads' 0.38391/0.33802 and 0.36153/0.32620. The 2016+ second look is 0.39164/0.33710 against 0.39390/0.33763. These are forecast-head scores, not ratings-only scores.

## Reproduce and audit

- Blend settings: `packages/core/src/presets/hybrid.js`; production learners: `packages/core/src/hybrid/`.
- Candidate scorecards, confidence intervals, and prefix-invariance checks: `research/alternative-ratings.md` and `research/alternative-rating-results/`.
- Refitted forecast report: `research/state-space/selection-report.json`; training rows: `packages/research/node/export-state-space-rows.mjs`.
- Build the site data with `npm run build:data`; `tests/test-model-file.mjs` compares the downloaded files to a fresh core build.

The site does not currently use dated power-unit reports as rating inputs. A replacement report identifies a component change, but without a clean matched estimate of its pace effect it would confound the car and driver split. Raw lap times already contribute to the race filter's pair evidence. Experimental lap-sequence neural models and component reports are documented in `research/alternative-ratings.md`; they were not selected for publication.
