# Polymarket winner-market mechanics and historical evidence

## Collateral and negative-risk outcomes

The [official position documentation](https://docs.polymarket.com/concepts/positions-tokens)
describes the economic operations: splitting one pUSD of collateral creates a
complete YES/NO pair in one binary market; merging a matching pair returns one
pUSD; after resolution, positions redeem according to the recorded payout.
The [negative-risk documentation](https://docs.polymarket.com/concepts/negative-risk)
states that one NO position in outcome A can be converted atomically into one
YES position in **every other** outcome in the event. Selling YES requires an
owned YES position; the split is one way to create both sides before quoting.
The conversion needs the full actual event outcome set, not only two drivers.

The four sampled winner events each have 22 named driver markets in our
metadata. A separate catalog lists five placeholder markets and an Other market
in addition. The documentation says augmented negative-risk placeholder
outcomes can be clarified later, and the meaning of Other can change as that
happens. Do not assume the named drivers exhaust all possible outcomes or that
`NO(A)` equals `YES(B)` for one other driver. A portfolio model should include
the residual outcome, capital tied in tokens, any permitted conversions and
fees, and the timing and limits on splitting, merging, and redemption. It must
not simulate a naked YES sale as a funded order.

The archived 2026 British Grand Prix winner-market description says an event
canceled or rescheduled beyond 12 July 2026 resolves to Other, and the winner
is based on the FIA final classification as described in its rules. This
[research metadata snapshot](https://huggingface.co/datasets/od2961/polymarket-full-market-dataset)
is not an independently verified on-chain settlement record; its licence is
unspecified. Obtain each actual contract's historical rules and payout rather
than assuming all races share that deadline. The current position docs say
negative-risk markets have one full winning outcome, while a standalone binary
can have a split payout; this is a generic statement, not proof of any one
historical contract's oracle settlement.

The [official changelog](https://docs.polymarket.com/changelog/predictions)
says CLOB V2 went live on 28 April 2026, introducing pUSD collateral and new
standard and negative-risk exchange contracts. On 14 July it announced
retirement of the old CLOB V1 negative-risk relayer adapter, with its redemption
grace period ending 17 July at 00:00 UTC. Use the correct contemporaneous
contract and position system; today's documentation can describe newer systems
as well as CTF. A 17 July changelog entry announced a matching-latency rollout
for 24 July at 04:00 UTC, within the Hungarian study window. That is a scheduled
change, not an observed latency distribution. A constant replay delay should
be labeled as a scenario and tested for sensitivity.

## Independent archive candidates

- [PMData](https://pmdata.dev/pricing) advertises a free trial with 600 initial
  downloads plus 50 per month, for data older than three weeks; it lists L2,
  trades and on-chain fills, but requires account creation and an API key. Its
  public catalog identifies the historical F1 markets. Actual per-market data
  quality and uninterrupted coverage are not established by the catalog. Its
  published paid terms distinguish personal use and commercial use. Verify
  current terms and the actual files before relying on the offer.
- [Marketlens](https://marketlens.trade/) advertises a free tier for markets
  open in the previous seven days and a paid tier for its full historical
  archive. Its public [sample repository](https://github.com/marketlenstrade/polymarket-historical-data)
  does not list these F1 events. The provider's coverage claims and the older
  sample repository's key/quota descriptions should be checked against the
  current service before making assumptions about historical access.
- [PendulumFlow](https://archive.pendulumflow.com/) has older PMXT v2 data and
  independently recorded v3/v3.1 archives. The [v3.1 format documentation](https://archive.pendulumflow.com/formats/v3.1)
  describes category-split data, source timestamps, opening state and
  provenance. It is licensed CC BY-NC 4.0, so commercial use requires separate
  permission. The [v3.1 audit](https://archive.pendulumflow.com/audit/v31)
  says it has not yet been graded against on-chain fills; no verdict is not
  evidence of complete capture. Available dates and formats can change.

None of these provider descriptions alone verifies a complete, ordered L2 and
trade feed for a particular driver pair and time window. If data is obtained,
compare timestamps, snapshot reconciliation, trades, on-chain settlement and
coverage on the exact contracts before using it in the replay.
