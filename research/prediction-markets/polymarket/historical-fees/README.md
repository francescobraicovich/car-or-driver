# Historical sports fee scenarios for the 2026 sample

These are the **published sports-category schedules**, not proof of the exact
fee settings of a specific F1 contract at a specific time. The
[Polymarket predictions changelog](https://docs.polymarket.com/changelog/predictions)
says sports fees changed at **2026-07-10 00:00 UTC**. It also says market fees
should be calculated from the market's `feeSchedule` object. Market-specific
eligibility, exceptions and historical settings must be checked separately.
The current fee page lists more than one sports schedule, so a category-level
rate should not silently replace missing market-specific evidence.

| Studied windows | Published sports taker coefficient | Published maker share of collected taker-fee pool |
| --- | ---: | ---: |
| Austria, 24–26 June; Britain, 1–3 July 2026 | 0.03 | 25% |
| Belgium, 15–17 July; Hungary, 22–24 July; Netherlands, 19–21 August; Italy, 2–4 September 2026 | 0.05 | 15% |

The dated July 10 changelog states that the coefficient rose from 0.03 to 0.05,
and the maker rebate share fell from 25% to 15% at midnight UTC. It does not
prove that a particular archived contract followed that schedule. The official
changelog contains no further sports-category fee change through the studied
Italian window; an unlisted change or an individual market exception remains
possible. The category fee expansion was documented on March 30, 2026. This
helper deliberately covers only 24 June through the end of 4 September, which
contains our studied windows, instead of inferring the exact effective time of
earlier changes.

[Polymarket's fee documentation](https://docs.polymarket.com/trading/fees)
describes the formula `shares × coefficient × price × (1 − price)` and zero
platform maker fee. At a price of 0.50, 100 shares would incur a taker fee of
0.75 or 1.25 collateral units under the respective rate, before any rounding or
other transaction costs. Use the historical contract's actual parameters and
rounding where known. This scenario excludes builder-specific fees.

The maker share is a fraction of the market's **taker-fee-funded rebate pool**,
not a rebate automatically received on each filled maker order. The
[rebate documentation](https://docs.polymarket.com/programs/maker-rebates)
describes a fee-equivalent-weighted allocation among eligible maker fills in
the same market. The pool, competing eligible fills, thresholds, historical
programme rules and actual receipts would be required to estimate a rebate.
When those are unknown, the research replay uses zero rebate and reports that
assumption. There may also be separate liquidity or holding rewards, which this
scenario does not model.

## Usage

```js
import { publishedSportsFeeScenario } from './sports-fee-scenarios.mjs';

// The category schedule at this timestamp, not a verified contract fee.
const scenario = publishedSportsFeeScenario(Date.parse('2026-06-25T15:00:00Z'));
// scenario.takerFeeRate === 0.03; scenario.makerFeeRate === 0.
// scenario.makerRebatePoolShare === 0.25 is a pool parameter, not P&L.
```

The function requires integer UTC Unix milliseconds from 2026-06-24 00:00 UTC
through, but excluding, 2026-09-05 00:00 UTC. It returns
`requiresMarketVerification: true` for every result. Do not expose the
subsequently known final settlement or fee receipts to the strategy before the
quote time. Run its tests using:

```sh
node tests/test-historical-sports-fees.mjs
```

## Small contract-specific on-chain archive check

The public [V2 OrderFilled archive](https://huggingface.co/datasets/wzsg/polymarket-orderfilled-v2)
records the following **exchange-taker summary** fields. These examples are
from the selected Austrian Hamilton and Hungarian Verstappen/Hamilton race-winner
contracts, before the corresponding FP1 sessions. The archive maps the raw V2
`fee` to a six-decimal collateral amount and identifies side and token amounts.
The saved fields for all five events were independently matched to public
Polygon RPC transaction receipts, checking the contract, event topic, log
index, side, token and amounts. That checks one RPC provider's receipts, not
the wider source archive's completeness. The values corroborate the
sports-category coefficients for these specific transactions, not for every F1
market, and do not prove any maker rebate was paid.

| Race / contract | Block date UTC | Taker token / side | Shares | Price | Recorded fee (pUSD) | Formula, unrounded |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Austria / Hamilton | 25 Jun | YES / buy | 37 | 0.22 | 0.19047 | 0.190476 |
| Austria / Hamilton | 25 Jun | YES / buy | 19 | 0.22 | 0.09781 | 0.097812 |
| Austria / Hamilton | 25 Jun | NO / buy | 190 | 0.79 | 0.94563 | 0.945630 |
| Hungary / Verstappen | 22 Jul | YES / buy | 100 | 0.10 | 0.45000 | 0.450000 |
| Hungary / Hamilton | 22 Jul | YES / sell | 10 | 0.18 | 0.07380 | 0.073800 |

The calculated fees use 0.03 for Austria and 0.05 for Hungary; the small
rounding differences do not establish the historic rounding algorithm. Block
times are inclusion times, not necessarily matching times. We retain the
transaction hashes, raw amounts, token IDs and raw fee fields in
`austrian-winner-fee-events.json` and `hungarian-winner-fee-events.json`.
Source dataset revision is `f8782fc0c18a4e32b7bdc348ada114e5007a4367`;
the dataset licence is unspecified, and only a narrow extract of factual event
fields is included. The two source shards and publisher-reported SHA-256s are:

- `event_month=2026-06/data_19.parquet`:
  `a0178df23e92144061b4a4195e4dc51cc674ba5301d9c38a05829bf4d930721f`.
- `event_month=2026-07/part-b090602815-b090652814-5d10329c99e1.parquet`:
  `5d10329c99e11e262c43ea90dee1a1fa8d3e7645c80da8ce28eab868db8c6bd3`.

Only portions of those files were read; their whole-file hashes were not
independently verified. With the pinned Python environment described in the
[on-chain notes](../onchain/README.md), reproduce and test these observations:

```sh
/tmp/prediction-market-onchain/bin/python research/prediction-markets/polymarket/historical-fees/extract_fee_evidence.py \
  --race austrian --output /tmp/austrian-winner-fee-events.json
/tmp/prediction-market-onchain/bin/python research/prediction-markets/polymarket/historical-fees/extract_fee_evidence.py \
  --race hungarian --output /tmp/hungarian-winner-fee-events.json
python3 -m unittest discover -s research/prediction-markets/polymarket/historical-fees -p 'test_*.py' -v
python3 research/prediction-markets/polymarket/historical-fees/verify_polygon_receipts.py
```

The receipt verifier defaults to the public `https://polygon.drpc.org` RPC and
accepts `--rpc` for another Polygon node. Access and archival coverage depend
on the provider; the verification never signs or submits transactions. It
validates the five saved V2 `OrderFilled` event payloads against the receipts,
not the historical order book, quote sequence, rebates or strategy fills.

## Later transaction receipt checks

Three additional exchange-taker summary logs were inspected directly in public
Polygon receipts from the same V2 negative-risk exchange. The stated timestamps
come from the Polymarket Data API and can reflect block inclusion rather than
matching time. Prices and quantities below are rounded for display. Look up a
hash with `eth_getTransactionReceipt` on the RPC above and select the indicated
decimal `logIndex`; the V2 event data contains the side, token, maker amount,
taker amount, fee, builder code and metadata in that order. Contract and topic
are specified in `verify_polygon_receipts.py`.

| Market and time UTC | Transaction hash; log index | Taker | Recorded fee | Formula at 0.05, unrounded |
| --- | --- | --- | ---: | ---: |
| Dutch / Antonelli, 20 Aug 14:19:25 | `0x5946ced3feae2568c00b2fb2373e73430871b25621ce15c8d38d76b4653e78bf`; 973 | Buy 16.129031 YES at ~0.31 | 0.17249 | ~0.17250 |
| Italian / Leclerc, 3 Sep 14:36:55 | `0x7fc9e1c751ce775487e6d68838ded162ea059a40354ea9e7ecb8a0b780b42fa9`; 409 | Buy 1251.59 YES at ~0.11984755 | 6.60114 | ~6.60114 |
| Italian / Leclerc, 3 Sep 14:55:34 | `0xb4083b1290d967a5c85c0edeaff7808cb1b62f199e3bffface616644bda231e0`; 1068 | Buy 8.333332 YES at ~0.12 | 0.08398 | ~0.04400 |

The last receipt has a nonzero builder code
`0x11a22276beb720e66a072cba8b8e74cded60afda510af535b947b81a1b81a883`;
the first two have a zero builder code. Polymarket describes
[builder fees](https://docs.polymarket.com/programs/builders/fees) as additional
fees, but this receipt alone does not establish the cause of the discrepancy.
These isolated receipts cannot establish the fee for other orders or rebate
income. In particular, a replay that uses only the category coefficient may
understate transaction costs.
