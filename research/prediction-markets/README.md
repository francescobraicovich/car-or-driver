# Pre-practice Formula 1 market making

## Race-winner markets

The [four-driver feature and strategy search](pmdata/optimization/README.md)
compares prefix-built form and teammate signals, a rating-only baseline and a
first-book midpoint comparator. It records every training trial and separately
reports later races; the very small, previously inspected sample and unverified
execution data do not establish an edge.

The [PMData portfolio sensitivity](pmdata/portfolio-study.md) uses recorded
books, trades and on-chain fills for seven race weekends. Its initial source-age
rule accepts five races and rejects two; a separately labeled, post-observation
age sensitivity includes all seven. One hypothetical fill is not evidence of
profitability or of how simultaneous driver positions interact.

The [shared-collateral portfolio study](portfolio/README.md) replays Norris
and Hamilton winner contracts across two pre-practice windows, carrying capital
between races and settling positions against a single race outcome. Its strict
mode rejects both feeds because completeness is unverified. The accompanying
conditional sensitivity is not a validated historical performance estimate;
it also compares holding to settlement with a pre-practice liquidation. The
[independent later-race archive audit](polymarket/pendulum-winner-audit.md)
documents Dutch and Italian data that cannot establish complete selected-market
trade coverage.

The [winner-market activity study](polymarket/onchain/winner/README.md) found
substantially more recorded maker-side activity in the 22 named winner
contracts than in the 24 head-to-head contracts in the same four pre-FP1
windows. These are different contracts; five placeholders and the Other
winner contract are excluded, and recorded maker-side collateral is not a
strategy's capacity or profit.

The [winner-score baseline](forecast/README.md) reconstructs an uncalibrated
pace-only distribution from data before each decision date, using the previous
race's roster and team assignments. It is a retrospective research proxy;
current model settings and revised data are not verified historical vintages.
The [four-race sampled-price comparison](forecast/polymarket-price-comparison.md)
compares those scores with official pre-FP1 price samples for the same 88
named-driver contracts. Its small, dependent sample and unverified underlying
price freshness prevent a profitability conclusion.
The reference and Nautilus replays can use a dated score to limit quotes on an
individual winner token. They do not model shared funds, correlations or
conversion across the event's negative-risk markets. No historical return is
established without a sufficiently complete execution feed.
The [Austrian two-driver illustration](polymarket/austrian-winner-single-print.md)
compares the Norris and Hamilton scores with recorded books and evaluates
selected-print queue and settlement scenarios; it is not a replay or estimate
of a strategy's historical profits.

## Finding

There is not yet a defensible historical performance estimate. The public
exchange interfaces expose market information without a paid subscription, but
the available data does not automatically include a complete historical order
book. During the earlier investigation, local requests to the Polymarket and
Kalshi API hosts encountered an Italian gambling-domain block; no attempt was
made to bypass it. In the later environment, Polymarket's public Gamma and CLOB
endpoints were reachable and returned historical prices and resolution data.
API availability, legal access, terms, and redistribution rights are separate
questions and depend on jurisdiction and use.

An independent [PMXT historical archive](https://archive.pendulumflow.com/pmxt/v2/)
is freely accessible and identifies its mirrored data as CC BY 4.0. Its own
audit warns that market coverage is incomplete. We obtained a small real
Polymarket sample for Hamilton versus Verstappen at the 2026 British Grand Prix.
First practice began on 3 July at 11:30 UTC according to the
[official timetable](https://www.formula1.com/en/latest/article/formula-1-pirelli-british-grand-prix-2026.6doq6E52hg1t1YuKl8xtFR).
The extracted Hamilton-token feed starts at 09:18:01 UTC and ends before
11:29 UTC: four book snapshots, 74 price-level updates, and no recorded trades.
In all four snapshots the displayed Hamilton-token best bid was $0.24 for 100
shares and the best ask was $0.70 for 30 shares: a $0.46 displayed spread. This
is a narrow observation of the recorded snapshots, not proof those orders were
continuously available or executable.
Two snapshots differ from the book reconstructed from the preceding updates.
This can reflect capture or sequencing problems; we cannot establish continuous
coverage or infer that no trades occurred. The sample therefore fails the
backtest's data eligibility check. See [the extraction notes](polymarket/README.md)
for identifiers, source files, hashes, and reproduction.
The same three source hours contain no reported trade-print events for any of
the 24 identified British Grand Prix driver-matchup markets. This is a statement
about the archive, not proof of zero trading on the exchange.
An independent [on-chain scan](polymarket/onchain/README.md) identified four
distinct matching transactions across those markets between 1 July and FP1;
the publisher's archive coverage and the distinction between block time and
exchange match time are important limitations.
The same scan across 24 matchups at each of three additional races, from
Wednesday 00:00 UTC to FP1, found 1 maker event at Austria, 21 at Belgium and
11 at Hungary. These are recorded maker events, not hypothetical fills, and
one Hungarian transaction contains two maker events.
An exploratory [snapshot liquidity study](polymarket/snapshot-liquidity.md)
reports a median recorded spread of $0.485 per share across these 24 markets.
Snapshots were recorded at different times, and the observed spread is not a
guarantee of executable liquidity or market-making profit.
The [four-print queue sensitivity](polymarket/trade-fill-sensitivity.md)
matches those on-chain transactions to recorded books. Under the assumption
that all displayed orders remain ahead of a new quote, the observed print alone
would fill none of the four hypothetical quotes. Alternative queue assumptions
produce hypothetical fills and different results; the samples were selected
after observing trades and do not establish a strategy's performance.
Selected [Austrian and Belgian queue scenarios](polymarket/belgian-austrian-sensitivity.md)
extend the calculation to two more races. The Belgian example explicitly
varies the uncertain pre-activation queue and the order of cancellation and
the final trade; these remain scenarios rather than observed fills.

[Kalshi's historical API](https://docs.kalshi.com/historical-data) includes
markets, trades, and candles; these alone do not give historical L2 depth or
queue positions. [Polymarket's public market-data documentation](https://docs.polymarket.com/market-data/overview)
describes its market and outcome data. An API that returns today's book or
historical prices should not be treated as a historical order-book feed.

## Research implementation

- [NautilusTrader replay](nautilus/README.md): a pinned, established L2
  backtesting engine, with a narrow normalized-data adapter and synthetic
  verification. Its fill and queue assumptions are not ground truth.
- [Reference replay](backtest/README.md): an independently implemented,
  conservative sensitivity model of passive quotes, queue position, inventory,
  funding, latency, fees, slippage, depth-limited exit, and settlement. It
  requires a documented, complete event window strictly before FP1. The example
  is synthetic and does not show historical returns.
- [Polymarket sample and extractor](polymarket/README.md): actual data, retained
  with unverified coverage so it cannot silently become a backtest result.
- [Kalshi collector](kalshi/README.md): retrieves public market, trade, and
  candle endpoints when legally accessible; it does not invent historical books.

The strategy makes a two-sided market in one binary driver-matchup contract,
limits inventory and shifts its quotes against accumulated inventory. It may
close before practice or retain inventory to the contract's eventual settlement;
the two approaches have different race exposure. This is a research prototype,
not a production trading system. Each market's rules, historical fees, tick
size, capital requirements, and the assumptions of the selected engine must
be supplied and checked before making claims about execution.

The repository's existing pairwise pre-weekend driver forecast is not connected:
the current serving function reads the latest model state, and its pace/finishing
benchmark is not the same as every exchange's payout, especially with
withdrawals, retirements, and half settlements. A proper historical integration
needs model and training snapshots that were available before each quote and a
calibration against the exact contract rules. The racing data used by existing
forecasts is subject to the noncommercial terms in [data/NOTICE.md](../../data/NOTICE.md).

## Next empirical test

Obtain a legally accessible feed with independently verifiable pre-FP1 L2
snapshots, ordered updates and trades for multiple driver matchups, and retain
the original market rules, timestamps, tick sizes, fee schedules, and data
coverage evidence. Exclude incomplete feeds and events with uncertain first
session times. Freeze strategy parameters before a later, untouched set of races;
compare passive fills, costs, inventory and returns under multiple queue and
latency assumptions. A single matchup or a synthetic demonstration is not
evidence of profitability.
