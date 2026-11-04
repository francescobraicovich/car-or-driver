# Two-hour pre-practice sensitivity

This exploratory two-race calculation extends the previously inspected Austria
and Britain samples to 14:00–16:00 UTC on the Thursday before first practice.
The two-hour window was chosen after inspecting the available records. It is
not an untouched test, and neither feed is verified complete. Strict mode
rejects both feeds. The results below are hypothetical outputs, not actual
account performance or evidence that a strategy would have made money.

The strategy and parameters are the same as in the [one-hour scenario](README.md):
a $100 shared portfolio, five funded YES/NO complete sets for each of Norris
and Hamilton, five-share orders, one-second submission latency, an assumed
one-cent tick and five-share minimum, and a retrospectively reconstructed
model score with a one-tick minimum edge. The program does not implement
negative-risk conversion. It assumes zero maker fees and zero rebates.

| Conditional result | Austria | Britain |
| --- | ---: | ---: |
| Recorded transactions included in normalized two-hour tape | 37 | 8 |
| Hypothetical maker fills | Sell 5 Hamilton YES at $0.22 | Sell 5 Hamilton YES at $0.16 |
| Holding positions through outcome settlement | +$1.10 | +$0.80 |
| Close at 16:00 UTC; separate $100 initial portfolio per race | −$0.076565 | −$0.020160 |

With the runner's assumed immediate redemption at Gamma `closedTime`,
settlement accounting carries $100 to $101.10 after Austria, then $101.90
after Britain. In the separate liquidation scenarios, the Austrian position
is bought back at $0.23 and the British at $0.16; each closing price includes
one cent of assumed adverse slippage. The Austrian and British taker fees are
$0.026565 and $0.020160, respectively, using the published sports category
coefficient 0.03 in the price-dependent fee formula. Historical fee eligibility
for each contract is not established. Liquidation results are independent
per-race sensitivities; they are not a compounded series.

The Austrian capture has one crossed or locked book interval lasting 112.314
seconds. It has 787 source-time reversals, at worst 424 milliseconds; Britain
has 377, at worst 1,187 milliseconds. The conditional engine uses receipt order
and assumes immediate cancellations; its simulated actions cannot repair missing
messages, identify actual queue position or account for all trade-through adverse
fills. The current replay can therefore overstate or understate profits. Other
limitations, including selected-print reconciliation, model and race timing
provenance and settlement assumptions, are detailed in the [portfolio report](README.md).

Run from the repository root:

```sh
node research/prediction-markets/portfolio/run-conditional.mjs \
  --assume-retrospective-vintage --assume-closed-time-redemption \
  --allow-unverified-feed --two-hour-window
```

The full reproducible output, including source hashes, execution assumptions,
fill transaction identifiers, event diagnostics and strict rejection reasons,
is [two-race-two-hour-conditional-results.json](two-race-two-hour-conditional-results.json).
