# Vike event-tape capture

`fetch_events.py` requests raw Polymarket book snapshots, price-level changes,
trade prints, tick changes and status markers for up to 100 selected token IDs
over a window of at most 24 hours. Set `VIKE_API_KEY` in the process environment;
the key is sent only as an HTTPS request header, not as an argument, URL or
output field. Redirects are refused, and response bodies are not printed on an
HTTP error. The client writes a new file only after all pages have been fetched.

```sh
python3 research/prediction-markets/vike/fetch_events.py \
  --token-id TOKEN_ID --from-ms START_MILLISECONDS --to-ms END_MILLISECONDS \
  --output /private/tmp/vike-events.json
python3 -m unittest discover -s research/prediction-markets/vike -p 'test_*.py' -v
```

Pass `--token-id` more than once for multiple outcome tokens. Times are UTC
epoch milliseconds and the end is exclusive. The page cursor is opaque and
preserved unchanged. A repeat or missing cursor, failed request, redirect,
invalid response or excessive pagination stops the capture without saving a
partial result. The output intentionally retains `coverageComplete: false`;
it is raw source evidence and has not been normalized for the portfolio replay.

Vike's [event documentation](https://vike.io/docs/data/polymarket/endpoints/events)
states that its recording begins 2026-07-25 and that the API serves the full
recorded history. A separate [overview](https://vike.io/data/?ds=pm_markets&view=api)
describes approximately 30 days of API history. Test the requested race's
actual window and retain any empty-response note; an empty response is not
proof of no trading. The [daily archive](https://vike.io/data/polymarket) is
another source for the recorded history, but its whole-day files can be several
gigabytes each and should be inspected for size before downloading.

Even a successful paginated request does not prove completeness. Stream-health
markers can indicate gaps, and token-filtered results may not include every
global status marker. Audit the target window against independent snapshots and
on-chain trades, verify timestamp/sequence semantics, historical ticks and fee
rules, and assess the data licence before any performance claim. Raw API
trade prints do not alone establish simulated queue position or historical
execution. The provider identifies its archive as CC BY 4.0; confirm the
relevant terms for the material and use.

## Authenticated coverage probes, 2 November 2026

Read-only requests succeeded using a locally supplied key; the key and request
headers were not saved with the results. The sanitized
[market statistics](vike-market-stats-probes.json) retain the individual responses and the time
each group of sequential responses was written. The latter is an upper bound
on the requests' times; exact per-response times were not recorded. The
exchange YES token IDs are in the associated official race metadata or the
event-probe files below. Statistics report a token's recorded first and last
event, not continuous coverage between them.

For the selected Norris and Hamilton YES tokens, Vike reported:

- Dutch Grand Prix: first events on 23 August, the race day, for both tokens;
  the selected pre-practice window was 20 August. The direct [five-minute
  pre-practice query](vike-dutch-probe.json) returned no events for either.
- Italian Grand Prix: Norris's first recorded event was 6 September, race day;
  Hamilton's response reported zero total events. The selected pre-practice
  window was 3 September.
- Singapore Grand Prix: first events for both tokens were on 11 October,
  race day; the selected pre-practice window was 8 October.
- United States Grand Prix: zero total events for both tokens. A direct
  [one-hour pre-practice query](vike-us-prepractice-probe.json), 22 October
  14:00–15:00 UTC, also returned no events for eight selected YES tokens:
  Norris, Hamilton, Leclerc, Antonelli, Verstappen, Piastri, Russell and Other.
- Mexico City Grand Prix: Hamilton's first event was on 1 November, race day;
  Norris's response reported zero total events. The selected pre-practice
  window was 29 October.

As a positive endpoint control, the
[Dutch Norris race-day query](vike-dutch-norris-race-day-probe.json), 23 August
14:05–14:07 UTC, returned
2,169 events, including six book messages, one trade and two status messages.
This verifies only that those authenticated requests returned recorded data;
it does not establish complete market coverage. Empty results and recorded
bounds describe Vike's responses for these tokens and windows, not the absence
of exchange activity. The positive control falls outside the pre-FP1 strategy.

The separate [daily archive audit](archive-trade-audit.md) checks both the full
daily and sports-inclusive trade files. Neither contained rows for the selected
Dutch conditions or any of the 29 United States winner-event conditions during
the corresponding UTC day. This is a trade-tape finding; the large order-book
files were not downloaded or assessed.
