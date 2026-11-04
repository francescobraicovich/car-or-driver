# Driver-winner market-making portfolio

**Stale result artifacts:** The two-race conditional results linked below were
generated before the replay's floating-point queue-depth correction. They have
not been regenerated and are not verified reproducible with the corrected
engine; a rerun is required before relying on their reported numbers.

This research replay can make a market on any supplied set of drivers'
**race-winner** YES contracts, using separate dated winner scores. It is not a head-to-head
contract and does not substitute pairwise finishing probabilities for race-win
probabilities. Each driver has its own binary book and a distinct YES/NO
complete set. A single cash pool funds all initial sets and reserves cash for
all pending and active bids; an ask cannot sell more YES shares than owned.
The default quote joins recorded best prices, constrained by the stated fair value,
minimum edge, inventory limit and skew. Only pre-first-practice events enter
the strategy. Venue-specific order-size increments, cancellation latency,
book priority, minimums and collateral details remain approximations.

For competitive pricing, `quoteImprovementTicks` may be set to a nonnegative
integer; its default is zero. A positive value moves the quote towards the
spread without crossing the external book or an active or pending order on
the other side. An order that would cross the external book on arrival is
rejected. Displayed depth at its price is initially ahead in the queue, and
the order may still fill while cancellation is in flight.

`marketMidpointWeight` optionally blends each market's pre-race model score
with its currently observed two-sided midpoint when setting quotes. Zero uses
only the model and one uses only the midpoint. This is a per-contract quoting
anchor, so the blended values need not sum to one across the race. A stale or
crossed book is not used for a new quote.

The default matches only prints at the order price. With `tradeThroughFills:
true`, a later observed print on the same market at a worse price also implies
an execution at our better quote, capped by both the printed quantity and the
remaining order. This inference assumes price priority and reliable timestamps
and treats the historical taker's demand as available to the hypothetical
order. It is a counterfactual, not a verified execution; neither setting is
guaranteed to be conservative for profit. Neither accounts for the impact of
our orders on future market behavior or actual fill-notification latency.
Liquidation walks the recorded, sufficiently fresh book with specified fees and
slippage and returns null profit if it cannot flatten every position. The
reported peak capital committed includes initial complete sets and all reserved
bids; peak reserved cash is also reported separately.

An optional absolute `liquidationStartTime` stops new quoting and starts order
cancellations before the final exit. Once a market's orders have cleared, the
replay closes its position on the next sufficiently fresh observed book. A
partial close can consume a level again only after a new update refreshes that
level. Other markets' still-reserved bid collateral remains unavailable. Any
remaining inventory at the fixed pre-practice exit still makes profit null.
The historical book cannot reflect the market impact of the hypothetical
liquidation, and a refresh does not guarantee that depth would persist.

The engine does not use Polymarket negative-risk conversion between event
outcomes. In particular, NO on one driver is not equivalent to YES on another:
other drivers and the event's Other outcome exist. YES/NO complete sets are
separately funded at one unit per set, with no cross-market conversion. A
single race resolution determines all payouts: a named winner pays one only in
that driver's selected YES contract, while a winner outside the selected pair
or Other pays zero to both. `void` is not assumed to mean half settlement: it
requires a caller-supplied payout for each market. Those payout inputs are used
only after trading stops.

The `replayRaceSeries` wrapper carries cash into another race only if the caller
supplies a trading start, race start, independently supported race-end bound,
and settlement time for each race, with the next trading window no earlier
than the preceding settlement. The code checks ordering but cannot authenticate
those timestamps. It does not simulate overlapping races. In the example below,
Gamma's current `closedTime` is used as an **assumed immediate redemption
time**. An independent [Polygon resolution check](../polymarket/ctf-resolution-evidence.md)
found the selected contracts' payout denominators changed from zero to one in
the blocks whose timestamps match Gamma's closure times. That verifies protocol
resolution through the queried RPC provider, but not an account's actual
redemption execution, transaction delay, gas or operational costs. The F1
race-report publication time, rounded forward one minute,
is used as a conservative bound by which the race had ended, not as the actual
finish time. Omitting or changing the assumed settlement times changes whether
capital can be carried forward.

## Conditional two-race experiment

The checked-in [results](two-race-conditional-results.json) reproduce a
**conditional retrospective sensitivity**, not a verified backtest. Austria
and Britain use the same 14:00–15:00 UTC windows on the day before first
practice, a $100 initial portfolio, five YES/NO complete sets per selected
market, five-share maker orders, one-second submission latency, assumed $0.01
tick, assumed five-share minimum order, one-tick minimum model edge and
60-second recorded-book age. The initial sets consume $10 of the shared $100.
A single pool and reservation mechanism is used within each race. Initial
capital in the second race comes from the first only under the redemption-time
assumption above.

| Forecast or result | Austrian GP | British GP |
| --- | ---: | ---: |
| Reconstructed Norris win score | 9.60% | 8.10% |
| Reconstructed Hamilton win score | 6.25% | 6.32% |
| First recorded Norris YES book, UTC | 14:05:06.967 | 14:07:45.405 |
| First recorded Hamilton YES book, UTC | 14:05:59.482 | 14:04:16.772 |
| Normalized trade transactions included | 5 | 1 |
| Simulated maker fills | 1 | 0 |
| Hypothetical gross profit held to stated settlement | +$1.10 | $0 |

In Austria the model hypothetically sells five previously funded Hamilton YES
shares at $0.22; current Gamma metadata reports Russell as the resolved winner.
The British simulation has no fills in its selected hour; that does not prove
there were no trades. Under the stated redemption-time assumption, the
conditional settlement calculation moves $100 to $101.10 after Austria and
leaves it at $101.10 after Britain. This is neither observed account performance
nor evidence of profitability. The two races and windows have been inspected,
so they are not an untouched evaluation set.

As a separate, independent-$100-per-race sensitivity, liquidating at each
one-hour window's end gives an Austrian gross-after-assumed-fee result of
−$0.076565 and British $0. For Austria, the hypothetical sell at $0.22 is
closed by buying five shares at $0.23 after one cent of additional slippage;
the assumed 0.03 Polymarket sports taker coefficient charges $0.026565. The
category-level published fee is a scenario, not proof of historical fee
eligibility for every contract; maker fees and rebates are zero in this model.
This liquidation sensitivity assumes orders can be canceled immediately and
that the sampled depth remains executable. It does not reinvest gains between
races. If depth, cash or a fresh book cannot support complete liquidation,
profit is null rather than marked optimistically.

## Why the result is conditional

- The model scores are retrospective, uncalibrated pace-based race-win proxies,
  normalized over the previous roster without an Other probability. `asOf` and
  `dataThrough` are scenario assertions; no point-in-time publication or model
  vintage has been established. They do not prove the scores existed then.
- Both PMXT captures report `coverageComplete: false`. Strict mode rejects them.
  Running requires separate explicit opt-ins for incomplete coverage and
  source-time disorder, without changing those coverage flags. Austria has 328
  backwards source-time steps, worst 424 ms; Britain has 133, worst 1,187 ms.
  Receipt-time order is only an assumption. The program counts these steps and
  crossed/locked-book intervals; an ambiguous initial-snapshot timestamp
  causes related records to be excluded, including one Austrian trade print.
  A source timestamp can be old in a quiet book and is not by itself proof of
  staleness; it is nevertheless subject to the chosen age filter.
- PMXT taker prints are joined by transaction hash to independent on-chain
  maker records, split by actual maker price, and reconciled to the print side,
  size and one of its prices. Exchange summary records are excluded and unique
  per-market trade-leg IDs are required. The PMXT print timestamp is applied
  to the maker levels as a scenario; chain block timestamps establish inclusion,
  not match time. Duplicate transaction prints are rejected rather than guessed
  apart, which can exclude legitimate feed layouts. Any known gap, unhandled
  quote event, or tick change rejects the adapter. Current Gamma tick/minimum
  settings do not verify historical settings.
- L2 depth cannot reveal queue position or who canceled ahead. The replay
  assumes displayed shares at the price are ahead and subtracts matching trade
  prints from that queue, but **does not fill orders on trades through their
  price**. It can omit adverse fills, so it is not necessarily conservative for
  profit. A print sourced at or before the modeled order activation cannot fill
  that order even when received later; such events are counted separately, and
  their exact effect on the queue at activation remains uncertain. Cancellation
  and requoting are instantaneous; simulated orders do not
  change later historical market activity. Maker-order minimum size is modeled
  on submission, but venue quantity increments and actual fees are not fully
  modeled. The program's coverage check does not establish that a replay or
  strategy is valid.

## Run and verify

```sh
node research/prediction-markets/portfolio/run-conditional.mjs \
  --assume-retrospective-vintage --assume-closed-time-redemption --allow-unverified-feed
node tests/test-portfolio-replay.mjs
node tests/test-portfolio-adapter.mjs
node tests/test-portfolio-series.mjs
```

The three flags are required to make the caveats explicit. The runner first
confirms that strict mode rejects the historical captures; it then runs the
conditional scenario. Output includes forecast/metadata provenance, source
hashes, first-snapshot times, exclusions, source-order and book diagnostics,
fill identifiers, quantities and prices, and the assumed capital carry. The
source and on-chain data attribution are recorded with their respective files.

The [two-hour sensitivity](two-hour-sensitivity.md) extends the same two
samples to 16:00 UTC with a separately opted-in, post-inspection window. It
remains conditional on incomplete data and retrospective assumptions.

## Weekend signals and conditional settlement

The replay accepts an explicit `raceStart` timestamp to permit an `exitTime`
after practice but strictly before the race. Without `raceStart`, the original
pre-practice deadline remains in force. A portfolio forecast is a timestamped
event `{type: 'forecast', timestamp, dataThrough, probabilities}` where
`probabilities` maps every selected market ID to a probability, totaling at
most one. Its inputs must be available by `timestamp`; existing orders are
repriced under the configured cancellation and submission latencies.

An optional `blackouts` array contains `{start, end, observedThrough}` UTC
millisecond intervals. Quotes stop early enough to cancel by `start`, and
orders remain exposed to observed prints while cancellation is in flight.
`observedThrough` is either a timestamp attesting that every market which could
have an order has recorded trade tape through `start`, or a map of market IDs
to such timestamps. Markets first covered after the pre-blackout quote stop
need no fabricated earlier tape. After the blackout, no quotes resume until a
new forecast and a fresh book snapshot are available. Book updates before that
snapshot are ignored, so they cannot manufacture depth or fills. This is a
conditional simulation: the input provider must establish actual tape coverage.

With `exitMode: 'conditionalSettlement'`, a required `liquidationStartTime`
begins the pre-race wind-down. After orders cancel, inventory is held only when
its model probability exceeds the fee- and slippage-adjusted benefit of
closing by more than the explicit `holdingRiskMargin` per share; otherwise the
replay attempts to close against observed depth. It revisits held positions as
books and forecasts change. A missing post-blackout forecast, usable book, or
required close yields incomplete, null P&L. The return includes the settlement
result, individual hold decisions, single-winner scenario profits, an `other`
winner scenario, and a hypothetical equal-half-payout void scenario. These are
not risk estimates or guarantees of fills, calibration, or live profitability.

Alternatively, the explicit `holdingReference: 'entry'` uses the net position's
weighted-average acquisition price for a long or weighted-average sale price
for a short. Reductions remove basis proportionally; crossing zero resets the
basis to the crossing fill's price. A favorable entry-basis hold can be decided
without a fresh book, but an unfavorable position still requires actual closing
depth. Entry price is a sunk cost, not the value obtainable by closing now;
this rule is a separate hypothesis and can retain positions that a current
market-value comparison would close.

The separate opt-in `allowForcedCarry: true` is available only with entry-basis
conditional settlement. If a valid model-directed close cannot be completed
before the race, the remaining position is carried to its actual settlement
and reported in `forcedCarries` with its residual basis and executed closing
costs. This is illiquid exposure, not a successful exit or a deliberate model
hold. A missing forecast or live order at the cutoff is still not accepted.
Winner/other/void scenarios include all deliberately held and forced positions.
