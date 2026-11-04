# Austrian GP: two selected race-winner prints

This is an **illustrative, hypothetical sensitivity**, not an empirical profit
backtest. The two prints were selected after observing the data. No
counterfactual fills are known, and archive continuity and exchange queue position
are unverified. The exchange's current resolved metadata reports both selected
YES outcomes at zero; an independent on-chain oracle check has not been made.
The markets below are distinct negative-risk race-winner contracts, not a
head-to-head contract. The corresponding F1 driver roster and model parameters
come from a retrospectively rebuilt, uncalibrated pace proxy whose publication
vintages have not been established.

At 14:00 UTC on June 25 the saved proxy assigns Norris 0.09604005545050225 and
Hamilton 0.06248470688105083. The assumption is a one-cent tick and minimum edge;
the actual historical tick size was not verified. A later official Gamma response
reports a current tick size of $0.001, minimum order size 5 and fees enabled for
both contracts, but does not establish their June 25 historical settings. No book snapshot for either
YES token was recorded in the downloaded 13:00 hour. The first later snapshots
arrived separately:

| YES token | Snapshot receipt UTC | Snapshot source UTC | Best bid × shares | Best ask × shares | Proxy minus bid | Ask minus proxy |
| --- | --- | --- | --- | --- | --- | --- |
| Norris | 14:05:06.967 | 14:04:33.943 | $0.05 × 2,605.48 | $0.07 × 1,081.86 | +$0.0460400555 | −$0.0260400555 |
| Hamilton | 14:05:59.482 | 14:05:59.347 | $0.20 × 789.56 | $0.23 × 566.72 | −$0.1375152931 | +$0.1675152931 |

These are proxy margins per share, not demonstrated executable edge. A quiet
book may retain an old source timestamp; a 33-second Norris timestamp age does
not itself prove the snapshot is wrong. It does limit what we know at submission.

## Fixed-order sensitivity

The script selects a 5-share fixed limit from each observed snapshot and applies
a one-second submission delay. It chooses each limit **at submission**, then
uses later observations only to check the assumed activation queue and whether
the order would cross. It rejects known earlier eligible prints, source trade
times before activation and ambiguous same-receipt competing prints. It does
not reprice the fixed quote: Hamilton's ask later becomes less competitive than
the market. The recorded feed can have missing or reordered events, so passing
these checks cannot establish historical queue continuity or exact matching.
This fixed-resting-order hypothetical is **not output from the reference
strategy's replay**: that strategy can reprice when the observed best quote
changes. The hypothetical order is never canceled; the conservative case assumes
no cancellations ahead, and both cases assume the hypothetical order does not
change subsequent market activity. Both use a zero-fee assumption, not a
verified historical fee schedule.

| Order | Activation UTC | Selected print receipt UTC | Transaction | Displayed shares assumed ahead at activation | Recorded shares at quoted price | All ahead, no cancellations ahead | Zero ahead |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Buy Norris YES at $0.05 | 14:05:07.967 | 14:05:59.587 | `0x1eb338278faa3506334b3e2eff4204df98612d57c25c6f6b2b8e0929dd0fa931` | 2,605.48 | 42.50526 | 0 shares | 5 shares |
| Sell Hamilton YES at $0.23 | 14:06:00.482 | 14:16:34.990 | `0x024d44b559d8df60dd7635a9d0dc93664f45faf48a2304cfc11bdae020cd1730` | 596.72 | 226.77 | 0 shares | 5 shares |

For Hamilton, an intervening $0.22 ask is better than the fixed $0.23 ask; its
observed print does not fill the $0.23 quote. The later PMXT print reports
266.77 shares at $0.23, but independently archived on-chain maker legs show
40 shares economically at $0.22 and 226.77 at $0.23. The calculation uses only
the latter and excludes the on-chain exchange summary row to avoid counting it
twice. On-chain block timestamps are inclusion times, not exchange match times.

Norris's recorded print is a NO buy; mapping it to an economic YES sale at
$0.05 is an explicit complementary-token assumption. Negative-risk matching,
minting, collateral and exchange rules do not guarantee that the same queue
liquidity would have been available to a hypothetical order. Hamilton's sale
requires holding or funding YES shares; this is not a naked short. Cancellation
priority and the hypothetical order's effect on later activity are unknown.

Polymarket's official Gamma event response, retrieved on November 2, reports
Norris and Hamilton as closed, resolved YES=0 and NO=1, and Russell as YES=1.
Selected fields, receipt time and the original response hash are retained in
`austrian-2026-official-outcomes.json`; this is exchange-reported metadata rather
than independent on-chain oracle verification. At those reported YES payouts,
assuming zero maker fees, no execution costs and holding to settlement, the
individual zero-ahead scenarios are −$0.25 on Norris and +$1.15 on Hamilton.
All-ahead produces no fills on the selected prints. Liquidating before practice
would require a separate depth- and taker-fee-aware calculation.

The official CLOB price-history endpoint returned 120 minute-fidelity points
per driver for 14:00–16:00 UTC, retained with source and hashes in
`austrian-2026-official-prices-history.json`. Its first sampled Norris value is
$0.06 at 14:00:06 UTC and Hamilton value is $0.205 at 14:00:07 UTC. These are
sampled prices, not bids, asks, depth or evidence of executable fills, and they
were observed after the 14:00 proxy timestamp.

## If both hypothetical orders filled

Fund five Hamilton YES/NO complete sets for $5, keep $0.25 cash to buy five
Norris YES, then assume the Hamilton YES sale at $0.23 and the Norris YES buy
at $0.05 both fill. Relative to retaining those complete sets and cash, the
binary payout illustration is:

| Assumed winning outcome | Change before fees and funding costs |
| --- | ---: |
| Norris | +$5.90 |
| Hamilton | −$4.10 |
| Another driver | +$0.90 |

This table assumes mutually exclusive binary settlements and both full fills;
it makes no negative-risk conversion or rebate assumption. Cancellation,
postponement, Other and void outcomes require separately verified rules. It is
not a prediction of profit.

## Reproduce

Run `python3 research/prediction-markets/polymarket/austrian_winner_single_print.py`
and `python3 -m unittest discover -s research/prediction-markets/polymarket -p
'test_austrian_winner_single_print.py' -v` from the repository root. Raw
recording, source hashes and the hash-checked extraction command are documented
in [the Austrian audit](austrian-2026-audit.md). The source-based normalized
`austrian-2026-norris-winner-replay.json` includes the dated proxy and remains
`coverage.complete: false`; the main replay intentionally rejects it. The
NO-to-YES print conversion is economic and does not prove identical queue
liquidity.

The winner-market source extract is reproduced with:

```sh
curl -fL -o pmxt-2026-06-25T14.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-25T14.parquet
curl -fL -o pmxt-2026-06-25T15.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-25T15.parquet
python3 research/prediction-markets/polymarket/extract_austrian_winner_events.py \
  pmxt-2026-06-25T14.parquet pmxt-2026-06-25T15.parquet /tmp/austrian-winner-events.json
node research/prediction-markets/polymarket/normalize_austrian_winner_sample.mjs \
  /tmp/austrian-winner-events.json /tmp/austrian-norris-replay.json
```

The separate 13:00 file checked for earlier snapshots is
`https://r2v2.pmxt.dev/polymarket_orderbook_2026-06-25T13.parquet`, SHA-256
`209408787990ab03db843f4c5b33ece67f70b421a84cccf0464ee1ebe306726f`.
The earlier-snapshot observation is restricted to that one hour; it is not a
claim that no still earlier book was recorded.
