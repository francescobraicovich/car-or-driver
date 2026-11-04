# On-chain resolution evidence for the selected winner markets

The selected Norris and Hamilton contracts for Austria, Britain, the
Netherlands and Italy each have a Polygon Conditional Tokens Framework (CTF)
`ConditionResolution` event. For each condition, the public RPC reported a
successful transaction receipt containing that event in the returned canonical
block. A historical `payoutDenominator(conditionId)` read returned zero at the
end of the preceding block and one at the end of the event block. The decoded
two-slot payout numerators agree with the selected Gamma metadata.

This is direct evidence of **CTF payout recording**, rather than relying only
on Gamma's `closedTime`. It does not establish that a particular holder redeemed,
that an order filled, that a gas transaction was submitted, how long redemption
took, or when a specific wallet actually received reusable collateral. A
simulation releasing funds at the block timestamp still assumes immediate
redemption, adequate approvals and gas, and no operational or settlement delay.
Block timestamps do not specify an exact wall-clock time within the block.

| Race | Driver | Block and UTC time | Payout [YES, NO] | Transaction |
| --- | --- | --- | --- | --- |
| Austria | Norris | 89312053 · 2026-06-28 18:57:55 | [0, 1] | `0xedfc70ab241cdb80b514994201caa8cfad831233de985ac1f798d28d061dd21d` |
| Austria | Hamilton | 89312053 · 2026-06-28 18:57:55 | [0, 1] | `0xedfc70ab241cdb80b514994201caa8cfad831233de985ac1f798d28d061dd21d` |
| Britain | Norris | 89721933 · 2026-07-05 21:44:55 | [0, 1] | `0xab3b6a4c2837f359696e0b004daaee6f94385c49e7d467e312a7530e57b24161` |
| Britain | Hamilton | 89721933 · 2026-07-05 21:44:55 | [0, 1] | `0xab3b6a4c2837f359696e0b004daaee6f94385c49e7d467e312a7530e57b24161` |
| Netherlands | Norris | 92553382 · 2026-08-24 01:31:40 | [1, 0] | `0xdcb9f713bb0ff844c10e46587513b7daa974112729aed7000d0b34b3c82c0719` |
| Netherlands | Hamilton | 92553244 · 2026-08-24 01:28:13 | [0, 1] | `0xf2ba90189a86d37184b60a3c8a9fa267d112b5bb94d4028123e17ee6cdd6feed` |
| Italy | Norris | 93350232 · 2026-09-06 21:33:01 | [0, 1] | `0x6ea3a6017a304eb66a14e9d45aabf4c0704eae7e26748b71cc27fde8ff452897` |
| Italy | Hamilton | 93350232 · 2026-09-06 21:33:01 | [0, 1] | `0x6ea3a6017a304eb66a14e9d45aabf4c0704eae7e26748b71cc27fde8ff452897` |

`ctf-resolution-evidence.json` retains the conditions, log indexes, block
hashes, event payouts, previous/current denominator reads, Gamma comparison,
retrieval time, RPC source and narrow search windows. Each search was within
10 blocks of a timestamp-based block estimate, not a full-chain search; a
missing event in that window would not prove that a condition never resolved.
All eight target events were found. In the Dutch pair, use the later Norris
block time when a simulation requires both conditions to be resolved.

The [official deployment list](https://docs.polymarket.com/resources/contracts)
identifies CTF as `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` and the
negative-risk adapter as `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296`. The
[CTF contract](https://github.com/gnosis/conditional-tokens-contracts/blob/master/contracts/ConditionalTokens.sol)
defines the indexed `ConditionResolution` event, and the
[negative-risk adapter](https://github.com/Polymarket/neg-risk-ctf-adapter/blob/main/src/NegRiskAdapter.sol)
reports payouts to CTF. The event topic in the script is the Keccak-256 hash of
`ConditionResolution(bytes32,address,bytes32,uint256,uint256[])`. The starting
block estimates came from [DefiLlama's public block-by-time API](https://api-docs.defillama.com/).

Reproduce using a public Polygon archive-capable RPC; the script makes only
read-only JSON-RPC requests and requires no wallet or credentials:

```sh
python3 research/prediction-markets/polymarket/verify_ctf_resolutions.py --output /tmp/ctf-resolution-evidence.json
python3 -m unittest discover -s research/prediction-markets/polymarket -p 'test_ctf_resolution_evidence.py' -v
```
