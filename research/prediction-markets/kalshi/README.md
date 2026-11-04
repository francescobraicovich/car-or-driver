# Kalshi Formula 1 matchup data

`fetch-data.mjs` requests public data from Kalshi's `KXF1H2H` series. It saves the complete JSON response to every request, the request URL, the retrieval time, and the archive cutoff. It retrieves both current and historical market listings and both current and historical trade streams, following every cursor; it collects one-minute bid, ask, and trade-price candlesticks from the tier where each market is listed. Candlestick request windows overlap at their boundaries, so consumers must deduplicate boundary bars. No API key is used for these endpoints.

```sh
node research/prediction-markets/kalshi/fetch-data.mjs --output tmp/kalshi-matchups.json
# To collect one market instead:
node research/prediction-markets/kalshi/fetch-data.mjs --output tmp/kalshi-one-market.json --ticker KXF1H2H-EXAMPLE
node tests/test-kalshi-data.mjs
```

The ticker above is illustrative. Obtain an actual market ticker from the market list. The output file must not already exist; the command fails instead of replacing an earlier archive. The collector stops on an HTTP failure or an invalid or repeated cursor. It does not claim the server returned complete history, and an empty series or trade list is not proof that no market or trade ever existed. Public endpoint and archive coverage can change. Respect Kalshi's current terms and rate limits.

A one-minute candle is not an order book. It does not show depth, queue position, cancellations, or the exact sequence of quotes within the minute. Trade prints do not identify our counterfactual fills. The market's final `result`, settlement fields, and later updates are outcomes for scoring, not features available when placing an order. Market metadata received today may contain corrections made after the historical trade.

The archive contains the full available market window; it is **not** a pre-practice selection. To study pre-practice execution, independently obtain the scheduled first session's actual UTC start (including sprint or other sessions before FP1 where relevant), apply a strict cutoff before that timestamp, and exclude races with unknown or unverified session times. A candle that straddles the cutoff must also be excluded. Race start and market close are not substitutes for the first-session start. Preserve timestamps and rules used for every race.

References: [historical cutoffs](https://docs.kalshi.com/api-reference/historical/get-historical-cutoff-timestamps), [historical markets](https://docs.kalshi.com/api-reference/historical/get-historical-markets), [historical trades](https://docs.kalshi.com/api-reference/historical/get-historical-trades), [historical candles](https://docs.kalshi.com/api-reference/historical/get-historical-market-candlesticks), [current markets](https://docs.kalshi.com/api-reference/market/get-markets), [current trades](https://docs.kalshi.com/api-reference/market/get-trades), [current candles](https://docs.kalshi.com/api-reference/market/get-market-candlesticks), and [an F1 matchup market](https://kalshi.com/markets/kxf1h2h/f1-headtohead/kxf1h2h-mex26hamrus).
