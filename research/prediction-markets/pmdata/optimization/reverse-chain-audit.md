# Reverse trade-coverage check

The [results](reverse-chain-audit.json) compare PMData on-chain maker transaction
hashes with websocket trade IDs across ten researcher-selected 14:00–16:00 UTC
windows and four driver-winner markets per race. The chain scope is buffered by
60 seconds at both ends, and only non-exchange-summary maker rows are counted.
The chain and websocket files are from the same provider; block inclusion is
not the same timestamp as exchange matching. Hash agreement does not establish
feed completeness or queue position.

One maker transaction remains unexplained in the core window: Barcelona
Leclerc, transaction
`0xddeb30cb46300623be6c2e83a0f7f812d40f05942da1777170c7a9be5817d05c`.
There is no matching `trade_id` anywhere in that day's PMData trade file.
Polygon's public RPC returned a successful receipt in block 88323577 at
15:05:51 UTC. Log 756 is a negative-risk exchange `OrderFilled` for the Leclerc
YES token, with a maker paying 1.168658 pUSD for 37.698645 shares.

The PMData L2 record at 15:05:48.712 UTC reduces the displayed 0.031 YES bid
from 115.20 to 77.50 shares: a reduction of 37.70, close to the on-chain maker
quantity, approximately 2.3 seconds before the block. This supports a missing
websocket print within the intended window; it does not prove the exact causal
ordering or exchange match time. Treat the market as potentially incomplete and
exclude it from strategy simulations until its missing trade is reconciled.

The other buffered unmatched transaction hashes have matching websocket prints
outside their windows: four Barcelona records at approximately 16:00:34 UTC,
and one Hungarian Hamilton record before 14:00. No in-window PMData trade
record in these 40 windows lacks an ID. Reproduction requires the 120 local
PMData Parquet files and DuckDB; the script makes no network calls or reads of
credentials:

```sh
python3 research/prediction-markets/pmdata/optimization/audit_reverse_chain.py
```
