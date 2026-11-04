# NautilusTrader replay

This is a separate, settlement-only implementation using NautilusTrader's `BinaryOption`, L2 order book, trade ticks, order matching, queue-position model, and latency model. It reads the normalized JSON described by the backtest module, with two additional requirements: `timestamp` is the time the observation was received, and every event has `sourceTimestamp` in UTC milliseconds. Each market must declare a known outcome and independently verified uninterrupted coverage through the exit time. Do not set `coverage.complete` based solely on the absence of observed gaps.

It also accepts a single race-winner instrument and a dated `fairValue`, using the same model-value limit as the reference replay. The default minimum edge is one tick, and no quote is submitted before `fairValue.asOf`. The Nautilus strategy uses a signed margin position as an approximation; it does not model the venue's complete-set funding or joint negative-risk positions across drivers. Forecast validity and historical fee terms remain the caller's responsibility.

```sh
python3 -m venv /tmp/prediction-market-research
/tmp/prediction-market-research/bin/pip install -r research/prediction-markets/nautilus/requirements.txt
/tmp/prediction-market-research/bin/python tests/test_nautilus_market_backtest.py
/tmp/prediction-market-research/bin/python research/prediction-markets/nautilus/backtest.py path/to/verified-market.json --tick-size 0.01
```

The test input is synthetic and checks wiring, not historical performance. The program rejects records lacking both timestamp types, observations with a source timestamp more than 60 seconds before receipt, trades whose last book update is more than 60 seconds old, a book more than 60 seconds old at exit, absent trades, unknown coverage, crossed books, unsupported price precision, and missing settlement. An old source timestamp in a quiet market does not itself establish that a snapshot is inaccurate; the age threshold is a conservative eligibility requirement, so this program can exclude valid data.

It starts flat in a simulated margin account, quotes both sides at the best recorded prices, limits signed inventory, uses a one-second submission latency, and holds the residual signed position to settlement. It calculates cash flows from the engine's simulated fills and applies the outcome after trading ends. Fill timestamps are in nanoseconds; input timestamps are in milliseconds. Maker fees and rebates are assumed zero; there is no taker liquidation or slippage cost in this mode. Signed margin accounting is an approximation to a prediction exchange's fully collateralized YES/NO complete sets, not a faithful wallet or capital model. It must not be used to infer a deployable return on capital.

Recorded snapshots are converted to price-level differences because Nautilus 1.231 resets tracked queue positions on full-book clears. However, the engine also clears its queue estimate when a price level is deleted; this can give optimistic fills when cancellations or incomplete updates are mistaken for trades. Market-by-price data cannot show the actual queue; recorded fills and the simulated order's effect on subsequent participants are unobservable. Neither queue model nor final P&L establishes live performance. Unlike the other replay implementation, this runner does not claim that cancellations leave the estimated queue untouched. Simultaneous events follow their order in the input, which may itself be unknown.
