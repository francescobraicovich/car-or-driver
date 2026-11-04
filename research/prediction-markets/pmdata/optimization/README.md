# Retrospective pre-practice strategy search

**Stale results:** This study and its wider-window sensitivity were generated
before the replay's floating-point queue-depth correction. Their reported
numbers have not been regenerated and are not verified reproducible with the
corrected engine; a rerun is required before relying on them.

This is a **conditional research simulation**, not a verified backtest or an
estimate of deployable profitability. All ten races and their past results had
been inspected earlier. The model architecture, trained head, revised input
data, lineups and market rules are not verified historical vintages. Source
coverage, exchange ordering, actual queue position and executable fills remain
unverified. The validation and pseudo-holdout races below were not used to rank
the candidate weights in this search, but are **not untouched**.

A separate [wider-window sensitivity](wider-holdout.md) applies the frozen
Sharpe-selected weights to the two later races over 00:00–16:00 UTC. This
post-observation change is not an independent validation.

## Inputs and strategy

For each Thursday 14:00–16:00 UTC, the portfolio makes a market in the winner
YES contracts for Norris, Piastri, Hamilton and Leclerc, with one $100 pool and
one race winner. Each contract begins with five separately funded YES/NO
complete sets; order size is five shares, inventory limit ten, submission and
cancellation latency one second, and the quote grid is $0.01. The latter is a
coarse **strategy quote grid**, not a claim that every market's actual minimum
historical tick was $0.01. Market impact, trade-through fills, fill-acknowledgment
latency, rebates, builder fees and gas are not modeled. The strategy assumes
maker fee zero and carries collateral after immediate redemption at the latest
Gamma `closedTime`; historical source and settlement assumptions are unverified.

The [feature records](../strategy-features.md) use the previous-race roster and
prefix-built state-space/hybrid ratings. They contain an uncalibrated baseline
winner share, current-form shift, the difference between a driver's form and
their team mean, and a projected full pairwise-head strength. For candidate
weights the full-field score is normalized across the previous roster:

```text
log score = (1 - headWeight) * log(baseline share)
            + headWeight * fullHeadStrength
            + formWeight * formShift + teammateWeight * teammateFormShift
```

The separate [probability diagnostic](../probability-diagnostic.md) compares
the selected and baseline model scores with the first available book midpoint,
aggregating binary Brier score and log loss at the race level.

No Other or cancellation probability is included. The pairwise head is not
a validated winner-probability model, and the terms are not independent.

A separate [post-observation wider-window feasibility check](wider-holdout.md)
applies the frozen Sharpe-selected weights to Italy and Singapore from 00:00 to
16:00 UTC. Italy fails the existing age guard, so it does not replace or
validate the primary pseudo-holdout result.

The candidate grid fixes form and teammate weights at −1, 0 or +1, full-head
blend at 0, 0.5 or 1, minimum edge at 0, 1 or 2 strategy ticks, and inventory
skew at 0, 0.1 or 0.5 ticks per position unit. Four starting points feed
separate deterministic coordinate climbs for Sharpe, Sortino, profit factor
and an unannualized return/settled-drawdown proxy, at most four passes each.
They are local searches, not exhaustive 243-combination global optima. The
Sharpe path evaluated 34 candidates; each other path evaluated 35, for **57
distinct candidates across their union**. All paths, trial metrics and counts
are retained in [results.json](results.json). Looking at four objectives as
well as many parameter settings increases the risk of fitting noise.

All ratios use per-race results with zero risk-free rate, without annualization;
Sharpe uses sample standard deviation, Sortino uses the root mean squared
negative per-race return, and profit factor divides winning by losing race P&L.
The drawdown proxy divides cumulative return by the maximum drawdown measured
only between settlements: it is **not** standard annualized Calmar or an
intrarace risk measure. Each objective requires fills in at least two
distinct training races. A zero denominator makes its ratio undefined and the
candidate ineligible for that particular objective. This is a convention for
this small sample; an all-positive or zero-drawdown candidate is not thereby
shown to be worse than a candidate with losses.

The first seven races, Canada through Hungary, form the training block. Dutch
was designated validation, and Italy and Singapore pseudo-holdout. The 120s
source-age threshold was chosen after earlier data inspection. Dutch fails
that guard for the four-contract portfolio, so **no validation race is
available**. Both pseudo-holdout races are accepted but have zero hypothetical
fills for the selected strategy and the compared baselines. No candidate was
chosen using their results. Earlier race/strategy results were examined before
this study, so these are not independent out-of-sample tests.

The same fixed market eligibility applies to every candidate and baseline.
Canada Hamilton, Monaco Norris and Piastri, and Hungary Piastri have no usable
in-window snapshot. Barcelona Leclerc is disabled because an independent
on-chain fill was not found in the websocket trade tape; block time and exact
match time differ, so the mechanism remains unproven. These five markets have
explicit empty-book sentinels: their pre-funded sets remain reserved, they
cannot quote or fill, and their discarded observed messages are recorded. An
inactive market is **not** evidence of no exchange trading. See the
[teammate audit](teammate-window-audit.md) and
[reverse-chain audit](reverse-chain-audit.json). Source receipt-time ties,
crossed books and discrepancies persist; a source event up to 120 seconds old
can overwrite a newer state in conditional mode.

Two multi-price prints (Barcelona and Austria) do not equal any individual
maker-leg price. They are accepted only under an explicit **unverified rounded
VWAP assumption**: one on-chain taker-summary must match the combined maker
quantities, YES-equivalent value and side exactly in micro-units, and the
reported price must equal the weighted average rounded to 0.001. Maker legs,
not the aggregate price, advance simulated queues. Transaction identifiers are
retained in `dataQuality` in [results.json](results.json).

## Training result and comparisons

| Strategy, hold through settlement | Training races | Traded races | Fills | $100 ending balance | Sharpe/race |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sharpe-climbed form/team weights | 7 | 2 | 4 | $107.05 | 0.501 |
| Unadjusted rating-only baseline | 7 | 3 | 5 | $106.70 | 0.468 |
| Static first-book midpoint | 7 | 3 | 3 | $102.15 | 0.435 |
| No trading | 7 | 0 | 0 | $100.00 | undefined |

The market comparator freezes each driver's first recorded two-sided book
midpoint only when that driver's snapshot is received. It is not a dynamic
competitive market maker. It shares the same cash, date, fill, timing and
settlement assumptions; inactive markets stay inactive. Its independent
per-market midpoints are not calibrated full-field probabilities.

The **Sharpe-selected** weights were `formWeight=1`, `teammateWeight=-1`, `headWeight=0`,
one minimum-edge tick and `inventorySkewTicks=0.1`. Because teammateFormShift
equals driver form minus team mean, **formShift − teammateFormShift is team mean
form**: the selected fit cancels the within-team contrast. It is not evidence
that teammate-differential alpha has been found. The +$0.35 difference over
the unadjusted model comes entirely from avoiding one hypothetical Barcelona
Norris buy that lost $0.35. The selected strategy's larger difference versus
the static market comparator is concentrated in Britain: a hypothetical
five-share Leclerc YES purchase at $0.06 won $4.70, offset by a five-share
Piastri YES purchase at $0.03 that lost $0.15. Both strategies also sold five
Hamilton YES at $0.16. These are simulated fills, not account transactions.

With the Sharpe-selected parameters frozen and **no retuning**, increasing both
submission and cancellation latency from one to three seconds changes the
training result from four fills and +$7.05 to three fills and **+$2.35**. The
simulated Leclerc purchase at $0.06 disappears. The two pseudo-holdout races
still have no fills. The unannualized training Sharpe happens to rise from
0.501 to 0.516 because the smaller profits are less concentrated; that does
not mean slower execution improved the strategy. This stress retains every
common eligible race and all other assumptions, but it does not model queue
uncertainty, trade-through fills or real fill-notification latency.

The training Sharpe is based on seven dependent retrospective race outcomes,
with trading in only two races. Sortino, profit factor and return-to-drawdown
are **undefined** for the Sharpe-selected hold-to-settlement run because there are no
negative settled returns or drawdown; zero settled drawdown does not mean zero
risk. If Hamilton had won Britain, the observed simulated British position's
single-winner payout would have produced **−$4.65** for that race instead of
+$5.35; if Leclerc had won Monaco, that race's position would have produced
**−$3.30** instead of +$1.70. These are settlement scenarios, not intrarace
mark-to-market risk.

The separate **Sortino, profit-factor and return-to-settled-drawdown climbs**
each selected the unadjusted baseline: `formWeight=0`, `teammateWeight=0`,
`headWeight=0`, minimum edge one tick, and skew 0.1. Its training Sortino is
7.286, profit factor 20.143 and return/settled-drawdown 19.468; these large
values depend on just one $0.35 losing race and are not stable estimates. They
are finite under the convention above, while the Sharpe-selected candidate's
three ratios are undefined. Each objective's parameters were frozen on
training before its pseudo-holdout evaluation. The four results share the same
previously inspected races and are **not four independent validations**.

The selected strategy's separate forced pre-practice liquidation sensitivities
reset $100 independently for each race. Monaco is **−$0.13456** and Britain
**−$0.28330785**, a sum of **−$0.41786785** over the seven independent
training scenarios, including the assumed one-cent adverse slippage and taker
fees. The price-dependent sports fee coefficient is assumed 0.03 before
10 July 2026 and 0.05 afterward, not verified contract-specific; no builder fees
or gas are included. This independent-reset sum and its hypothetical drawdown
are not a compounded shared-cash portfolio.

The two pseudo-holdout races contain **no fills** for any objective-selected
strategy, the unadjusted model or market-only comparator. Their trading Sharpe,
Sortino and profit factor are undefined; this does not validate or invalidate alpha. The
JSON additionally reports multiclass winner Brier and log loss for selected
versus baseline scores, but two dependent retrospective outcomes cannot
establish predictive skill. See the model-vs-market comparison separately for
the limitations of comparing forecasts to snapshot midpoints.

## Reproduction

The raw PMData files and API key remain in ignored `tmp/`; the optimizer does
not access the key or network. The source hashes are embedded in the output.
After installing pandas and PyArrow and downloading the manifest's market-day
files to `tmp/pmdata`, prepare a **new** directory and run:

```sh
python3 research/prediction-markets/pmdata/optimization/prepare_optimization.py --output tmp/pmdata-optimization-reproduction
PMDATA_NORMALIZED_DIRECTORY=tmp/pmdata-optimization-reproduction node research/prediction-markets/pmdata/optimization/run_optimization.mjs \
  --allow-unverified-feed --assume-retrospective-vintage --assume-closed-time-redemption > /private/tmp/pmdata-optimization-results.json
cmp /private/tmp/pmdata-optimization-results.json research/prediction-markets/pmdata/optimization/results.json
node tests/test-pmdata-optimization-metrics.mjs
node tests/test-pmdata-optimization-search.mjs
node tests/test-portfolio-adapter.mjs
```

See [PMData's download documentation](../README.md) for the authenticated
download process and [the winner model's original limitations](../../forecast/README.md)
for its historical-vintage and calibration constraints.
