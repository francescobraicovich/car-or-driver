# Four historical prints: sensitivity to queue assumptions

This is a **conditional, single-print analysis**, not a historical account of
our trades or a complete market-making backtest. We identified four pre-FP1
transactions across the British Grand Prix's 24 driver matchups in the scanned
on-chain archive, matched each to a PMXT trade print by transaction hash, and
examined earlier recorded order books. These four cases were selected because
trades were observed; that selection uses future information and makes them an
unsuitable performance sample. The on-chain scan and its coverage limits are
recorded separately in the [Polymarket research notes](README.md).

For each case, consider a hypothetical five-share order at the selected outcome's
best price in the first available recorded book, active one second after receipt.
The analysis checks that later *recorded* updates before the print do not change
that side's best quote or its displayed size. It excludes changes received at the
same time as the print because their order is unknown. It does **not** infer
missing updates, the strategy's other side, other executions, order expiry,
market impact, or actual queue position. The two July 1 orders would be live for
about two minutes before their observed prints; the July 2 examples for about
43 and 74 minutes. Whether such orders could stay live is not established.

Polymarket's [CTF Exchange V2 documentation](https://github.com/Polymarket/ctf-exchange-v2/blob/main/README.md)
states that complementary-token BUY orders can match through minting. In the
first three rows the recorded complementary-token BUY print is compatible with
our hypothetical selected-token bid. In the fourth row the print is a BUY of
Hamilton itself, compatible with a hypothetical Hamilton ask. The on-chain
records independently contain the corresponding actual maker-side fills; we
must not count the two sides of the same transaction as two separate trades.
A compatible print does not prove that our order would have received it.

The table gives hypothetical fills against that **one print only**, assuming
100%, 50%, or 0% of the displayed shares originally ahead are still ahead when
it arrives. The scenario deliberately treats the observed flow as reaching our
hypothetical order and applies a simple FIFO queue; it does not assert that
cancellations occurred. In particular, the 0% case can require unobserved queue
churn or missing events even though the recorded best level was unchanged. It
is an optimistic sensitivity, not a documented queue state.

| Matchup, hypothetical order | Price | Initially displayed ahead | Recorded print | Fill with 100% / 50% / 0% of ahead retained |
| --- | ---: | ---: | ---: | ---: |
| Norris vs Verstappen, buy Norris | $0.50 | 10 shares | 10 shares | 0 / 5 / 5 |
| Verstappen vs Piastri, buy Piastri | $0.30 | 50 shares | 21.42857 shares | 0 / 0 / 5 |
| Norris vs Piastri, buy Norris | $0.50 | 10 shares | 2 shares | 0 / 0 / 2 |
| Norris vs Hamilton, sell Hamilton | $0.70 | 10 shares | 1.42857 shares | 0 / 0 / 1.42857 |

For illustration only, if each filled selected share pays $1 at settlement and
the position is held until then, the corresponding **gross** results for the
0%-queue-ahead scenario would be +$2.50, +$3.50, +$1.00 and −$0.428571,
respectively. The last calculation assumes the sold Hamilton shares were
prefunded as part of complete sets, so it is the change relative to holding
those sets, not an uncollateralized short. In the 100%-queue-ahead scenario,
all four hypothetical fills and their gross results are zero. These are not
realized profits, a return on capital, or evidence of an edge: fees, rewards,
funding and capital opportunity costs, other orders, other fills and hedges
are omitted. A single race cannot establish a strategy's performance.

The [official race result](https://www.formula1.com/en/results/2026/races/1289/great-britain/race-result)
places Norris and Piastri ahead of Verstappen, Norris ahead of Piastri, and
Hamilton ahead of Norris. The $1-per-selected-share calculation is still an
assumption: the actual oracle payouts for these contracts have not been
independently verified. The payout is never used to choose the earlier quote.

The PMXT subset is not proven complete. For the July 1 cases, later full-book
snapshots match the reconstructed book, but that does not prove every interim
update or trade was captured. Exchange timestamps on quiet books can be old;
the July 2 Hamilton print also arrived about eight seconds after its exchange
timestamp. The corresponding on-chain block timestamp is settlement inclusion,
not the exchange match time. Reconstructing a queue from either timestamp would
therefore require assumptions that cannot be verified from these files.

Reproduce from the checked-in, attributed filtered observations:

```sh
python3 research/prediction-markets/polymarket/trade_fill_sensitivity.py
python3 -m unittest discover -s research/prediction-markets/polymarket -p 'test_trade_fill_sensitivity.py' -v
```

The output includes all four transaction hashes, original snapshot and print
times, levels, scenario quantities and assumed-outcome gross results. The
underlying files and original PMXT file hashes are included; the output is
computed, never labeled as actual fills.
