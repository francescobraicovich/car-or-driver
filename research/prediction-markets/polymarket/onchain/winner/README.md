# F1 race-winner markets: pre-practice on-chain activity

This research compares recorded maker-side activity for **named race-winner**
markets with the previously studied head-to-head markets. For each race, the
window begins at 00:00 UTC on Wednesday and ends strictly before first practice
on Friday. These are observations from one publisher's historical on-chain
archive, not a backtest, executable market capacity, or independently verified
exchange-wide volume.

## Contract structure

An F1 race-winner event contains separate YES/NO contracts for named drivers:
for example, YES on Hamilton means Hamilton wins the race; NO means he does not.
The 22 named contracts identified per event are marked negative-risk in the
market metadata. A NO token on one driver is not a claim that a particular
second driver wins. A two-driver portfolio thus requires its own payoff,
collateral, conversion and risk model, rather than the direct matchup strategy.
[Polymarket's negative-risk documentation](https://docs.polymarket.com/concepts/negative-risk)
describes how these multi-outcome markets can be linked.

A separate [PMData catalog](https://pmdata.dev/docs/schemas/markets-catalog)
lists 28 contracts in each event: the same 22 named driver markets, five
unnamed placeholders and an Other outcome. Our outcome metadata maps only the
22 named contracts. The five placeholders and Other are excluded, so results
are not a complete winner-event total. We cannot establish from later metadata
alone that every token or label was available throughout each historical window.

## Observed activity

The winner-event counts sum non-summary maker event rows on **both YES and NO**
tokens, and the collateral totals add the value paid by a maker BUY and value
received by a maker SELL. For each row, side 0 uses `makerAmountFilled`; side 1
uses `takerAmountFilled`, scaled by one million per the source's normal six
pUSD decimal places. Exchange-taker summary rows are excluded. Each column for
the direct matchup markets uses the same method. Distinct transactions can
contain several maker events, including events on different YES/NO tokens;
therefore the collateral amount is not necessarily the distinct economic
notional of the transaction and must not be added to the taker side.

| Race | Winner maker rows | Winner transactions | Winner maker collateral (pUSD) | Matchup maker rows | Matchup maker collateral (pUSD) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Austria | 756 | 420 | 24,174.578978 | 1 | 0.587301 |
| Britain | 1,386 | 826 | 31,559.300184 | 4 | 12.857142 |
| Belgium | 312 | 211 | 5,084.325924 | 21 | 189.960338 |
| Hungary | 544 | 306 | 20,298.531244 | 11 | 194.362146 |

These numbers suggest the sampled named winner contracts recorded more
maker-side activity than the sampled matchups in each window. They do **not**
establish how much volume a new strategy could capture or whether it would be
profitable. YES and NO winner positions differ from head-to-head positions;
notional, spread, depth, available inventory and adverse selection cannot be
assumed comparable. The tiny matchup samples and excluded winner contracts also
limit comparisons.

On-chain `OrderFilled` timestamps are block-inclusion times, not verified
exchange matching times. Orders may have matched before their inclusion timestamp;
we cannot strictly prove that an order matching just before a window boundary
belongs inside it. The dataset does not contain cancellations, queue position,
resting depth or independently verified settlement. All 4,761 raw event rows
in the extract have distinct `(contract, transactionHash, logIndex)` keys, and
all are recorded against the negative-risk V2 exchange. The publisher claims
coverage of both standard and negative-risk V2 contracts; the underlying block
and event completeness is not independently verified. Earlier trading is omitted.

## Sources and reproduction

- The 22 named winner-market condition and outcome-token identifiers per race
  come from [benjessel/polymarket_trades market metadata](https://huggingface.co/datasets/benjessel/polymarket_trades),
  revision `3e38abb2847b904d418df9203ea921e6c886e638`; its licence is
  unspecified. `outcome-identifiers.json` stores only identifiers, labels and
  negative-risk flags.
- `winner-onchain-events.json` is a narrow factual extract of the public
  [wzsg/polymarket-orderfilled-v2](https://huggingface.co/datasets/wzsg/polymarket-orderfilled-v2)
  archive, revision `f8782fc0c18a4e32b7bdc348ada114e5007a4367`. The dataset
  licence is unspecified; no redistribution or commercial-use permission is
  assumed. Its source, amount/side mapping and timestamp limitations are
  described in the parent [on-chain research notes](../README.md).
- The 81 June/July source paths and their publisher-reported SHA-256 values are
  in [`../additional-shards.json`](../additional-shards.json). The range reads
  did not independently verify whole-file hashes. Extraction prunes Parquet
  row groups by source timestamp statistics, whose accuracy is not independently
  verified.
- The raw extract SHA-256 is
  `dd962d765324939dd7738ea5568b5b4e5af86ff5f323241b43196fae5dba9b61`.
  `summary.json` contains per-race and per-market counts, including the number
  of YES and NO maker events; it does not establish profits or fill probability.

Create the pinned Python environment described in the parent README, then:

```sh
/tmp/prediction-market-onchain/bin/python research/prediction-markets/polymarket/onchain/winner/scan_winner_markets.py \
  --output /tmp/f1-winner-onchain-events.json
cmp /tmp/f1-winner-onchain-events.json research/prediction-markets/polymarket/onchain/winner/winner-onchain-events.json
python3 research/prediction-markets/polymarket/onchain/winner/summarize_winner_markets.py > /tmp/f1-winner-summary.json
cmp /tmp/f1-winner-summary.json research/prediction-markets/polymarket/onchain/winner/summary.json
python3 -m unittest discover -s research/prediction-markets/polymarket/onchain/winner -p 'test_*.py' -v
```

The scanner contacts a public data host and can transfer substantial data. Do
not mark a book feed complete solely because on-chain transactions exist.
