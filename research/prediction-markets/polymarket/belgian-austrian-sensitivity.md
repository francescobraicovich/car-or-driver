# Two further pre-practice queue-sensitivity studies

These are conditional calculations on selected real observations, **not a
validated market-making backtest**. Both markets were selected after their
trades were observed. The PMXT extracts have incomplete, unverified coverage;
queue ordering, hidden activity and the effect of our own hypothetical order
are not observed. A fill in these calculations is not evidence that our order
would actually have filled. The on-chain records and PMXT prints are joined by
transaction hash and are not counted twice. The analysis assumes one
five-share order, one-second submission latency, and no fees or rebates.

## Belgian Grand Prix: Norris against Piastri

On 16 July 2026, the first recorded Norris-token book in the inspected files was
received at **11:11:04.244 UTC** with a $0.40 bid for 63.32 shares and a $0.60
ask. We place a hypothetical bid at $0.40, assumed active at **11:11:05.244**.
The first corresponding Piastri BUY print, 33.333332 shares at $0.60, arrived
at **11:11:04.428**, before activation. It cannot fill our hypothetical order.

There is a material ambiguity: the update and book displaying 63.32 shares
arrived just before that trade-print message. The message may describe the same
match already reflected in the snapshot, or it may represent additional
consumption that the snapshot had not yet reflected. The data cannot establish
the actual queue at activation. We therefore compare two **assumptions**,
without claiming either is correct:

1. The snapshot already reflects the pre-activation print: the assumed queue
   at activation is 63.32 shares.
2. The pre-activation print consumes an additional 33.333332 of the snapshot's
   displayed shares: the assumed queue is 29.986668 shares. This requires any
   unobserved book changes or replenishment needed to reconcile later messages.

Three later complementary-token BUY prints contain 16.666665, 20, and 26.65
shares. The received level updates precede the associated trade-print messages;
subtracting both updates and prints would double-count execution, so this model
reduces the queue only from prints. The recorded $0.40 bid removal arrives just
before the final print message. We evaluate both an immediate feed-time
cancellation and the alternative in which the final trade reached the order
before cancellation. A feed-message order is not proof of exchange matching
or cancellation order. For both alternatives, the illustrative fill outcomes
are identical in this example:

| Assumed activation queue | 100% remains ahead | 50% remains ahead | 0% remains ahead |
| --- | ---: | ---: | ---: |
| 63.32 shares | 0 shares | 5 shares | 5 shares |
| 29.986668 shares | 5 shares | 5 shares | 5 shares |

The 50% and 0% cases are sensitivity assumptions; observed cancellations
are not established. Under an assumed $0 settlement for Norris, a five-share
fill at $0.40 would produce a **hypothetical gross loss of $2**, before fees,
funding and opportunity costs; no fill produces $0. The
[official Belgian result](https://www.formula1.com/en/results/2026/races/1290/belgium/race-result)
places Piastri fifth and Norris seventh, consistent with the assumption, but
actual oracle settlement has not been independently verified. This outcome was
not used to choose the earlier quote.

The program verifies that recorded updates and snapshots do not change the best
bid or make the selected quote cross before the recorded removal. It also
rejects recorded quote-changing events before activation and rejects any
post-activation print whose source timestamp is at or before activation. That check
cannot prove that unseen events did not do so. The last-print-before-cancel
scenario also holds the quote at $0.40 hypothetically even after the recorded
book no longer displays it. Queue order at the venue, order acceptance, cancel
latency, and execution before feed receipt remain unknown. Later recorded book
sizes are rounded; they do not establish a precision-level queue position.

## Austrian Grand Prix: Leclerc against Hamilton

On 24 June, a recorded Leclerc-token book showed a $0.37 bid with 25.23 shares
and a $0.86 ask. A later Hamilton BUY print at $0.63 for 1.5873 shares has the
same transaction hash as an on-chain Leclerc maker buy. We model a five-share
Leclerc bid posted after the earlier snapshot, one second of latency, and no
recorded quote-affecting update before that print. The order would need to stay
active for roughly 62 minutes. Under assumptions that 100%, 50%, or 0% of the
initial displayed queue remains ahead, the single-print hypothetical fills are
0, 0, or 1.5873 shares. The 0% scenario requires unobserved queue churn; the
recorded data does not establish it happened.

The [official Austrian result](https://www.formula1.com/en/results/2026/races/1288/austria/race-result)
places Hamilton ahead of Leclerc. Assuming a $0 Leclerc payout, the 1.5873-share
fill would be a **hypothetical gross loss of $0.587301**, before costs; actual
contract settlement is unverified. The snapshot is old, and its book cannot be
proved continuous through the trade. No fill or loss is asserted as actual.

Both studies use complementary outcome BUY orders, which Polymarket's
[exchange implementation](https://github.com/Polymarket/ctf-exchange-v2/blob/main/README.md)
can match through minting. Neither infers a full strategy return, liquidity
rewards, fees, subsequent hedges, or any performance beyond these selected
prints. A different queue, cancellation or data-coverage assumption can change
the result substantially.

Reproduce from the checked-in, attributed PMXT subsets:

```sh
python3 research/prediction-markets/polymarket/belgian_queue_sensitivity.py
python3 research/prediction-markets/polymarket/austrian_trade_sensitivity.py
python3 -m unittest discover -s research/prediction-markets/polymarket -p 'test_*.py' -v
```

The saved JSON outputs include source hashes, exact timestamps, transaction
hashes and each explicit scenario. The raw subset extraction scripts and
availability limitations are documented in [README.md](README.md).
