# Brazilian Grand Prix winner-market coverage check

On 2 November 2026, before first practice, the public Polymarket data API
returned trades in the Brazilian Grand Prix winner event. In a check around
17:37 UTC, the following YES trades were returned:

- Antonelli: 25 shares at $0.40, timestamp 17:20:16 UTC.
- Verstappen: 21.739131 shares at approximately $0.46, timestamp 17:20:16
  UTC; and 4.347827 shares at approximately $0.46, timestamp 14:30:13 UTC.

These are actual exchange API records, not hypothetical strategy fills. API
timestamps do not establish exact maker queue position or capture completeness.
The underlying [Antonelli trades](https://data-api.polymarket.com/trades?market=0xda4aacac3818d44cfa5c15f7abaeacb57dd59c70c3f5477ddc5f231bde8e776b&limit=100)
and [Verstappen trades](https://data-api.polymarket.com/trades?market=0x807b3bc6b44a42781d916c67d3c3419f74602e7660afc9dd85e3605bb86097c9&limit=100)
are public, but their current results may change.

At the same check, Vike `/market_stats` reported zero events for each of the
Antonelli, Verstappen, Norris, Hamilton, Russell and Piastri YES tokens. An
authenticated Vike `/events` request for the first four YES tokens returned
zero records for 2 November 14:00:00 UTC through approximately 17:37:44 UTC;
the response was retrieved at 17:37:44 UTC. This is a scoped observation of
Vike's responses, not evidence that exchange trading did not occur. Vike may
have ingestion delay or other coverage limits; the reason is not established.
Credentials and request headers are not retained in this report.

The [public Gamma event endpoint](https://gamma-api.polymarket.com/events?slug=f1-brazilian-grand-prix-winner-2026-11-08)
reported an event `volume` of 29.347827 and `liquidity` of 26213.72907 in a
response with `updatedAt` 2026-11-02T17:35:28Z. Its `volume24hr` was
51.086958, larger than the reported total `volume`, so these fields should not
be assumed to be synchronized. The liquidity happens to be close to 26,000,
but without inspecting the user's display we cannot determine what its number
represents. Live market figures change.

The Polymarket CLOB also returned nonempty YES books for the four drivers at
the check time. A current snapshot is evidence of displayed orders then, not
a historical full-depth event stream or proof of executable fills.
