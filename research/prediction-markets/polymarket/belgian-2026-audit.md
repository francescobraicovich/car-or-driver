# Belgian Grand Prix pre-practice archive sample

The official [Formula 1 timetable](https://www.formula1.com/en/racing/2026/belgium)
places FP1 at 11:30 UTC on July 17, 2026. The attached PMXT recording contains
Norris–Piastri market activity on July 16. The independent
[on-chain event sample](onchain/additional-onchain-events.json) includes four
unique transactions whose hashes match four Piastri-token PMXT buy prints.

The first Norris-token snapshot at 11:11:04.244 UTC shows a bid of $0.40 for
63.32 shares. It arrived 184 ms before the first print, but the first trade's
corresponding level update had already arrived, so the snapshot may reflect that
trade. Later Norris bid updates report 46.65, then 26.65, then zero shares;
their corresponding complementary-token buy prints were received roughly
0.2 seconds later and report 16.666665, 20 and 26.65 shares. A hypothetical
order placed after the first print must not count the first print toward its
queue. Market-data receipt and exchange matching order are not guaranteed to
coincide, and rounding, missing messages and cancellations leave the real queue
unknown. Do not infer hypothetical fills by treating the later print time as
the exact time the earlier level change happened.

The raw filtered events, both outcome tokens and the original transaction
hashes are in `belgian-2026-july-16-matchup-events.json`. Market condition and
token identifiers are factual information from [benjessel's public market
metadata](https://huggingface.co/datasets/benjessel/polymarket_trades/blob/main/markets.parquet),
which does not specify an open license. The PMXT v2 data is CC BY 4.0; credit
PMXT, <https://archive.pmxt.dev/Polymarket/v2>. There is no claim that the
recorded event stream is complete.

With DuckDB installed, reproduce the extract from the repository root:

```sh
curl -fL -o pmxt-2026-07-16T10.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-16T10.parquet
curl -fL -o pmxt-2026-07-16T11.parquet https://r2v2.pmxt.dev/polymarket_orderbook_2026-07-16T11.parquet
python3 research/prediction-markets/polymarket/extract_belgian_july_16_events.py \
  pmxt-2026-07-16T10.parquet pmxt-2026-07-16T11.parquet /tmp/belgian-matchup-events.json
```

The extractor checks the source SHA-256 hashes:

- 10:00: `7b6fb054149f636ffa6313413bf2020cec71264464668c4cae1edb99717c24ff`
- 11:00: `5cc1441d76b93b904635e6e37a4038147b52b45ef71bb6c89aaacd4f2061f23e`
