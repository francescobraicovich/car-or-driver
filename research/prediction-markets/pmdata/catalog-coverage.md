# PMData race-winner catalog check

On 2 November 2026, the public [PMData markets catalog](https://pmdata.dev/docs/schemas/markets-catalog)
listed L2 recording date ranges containing the selected Thursday before FP1
for Norris and Hamilton winner contracts at eight Grands Prix: Austria,
Britain, Belgium, Hungary, the Netherlands, Italy, Singapore and the United
States. The [16 catalog rows](catalog-coverage.json) preserve slugs, target
dates, catalog bounds, retrieval time, source and the SHA-256 of the downloaded
32,067,050-byte catalog.

**A date inside a first-to-last range does not guarantee that a file exists for
that date or that its books, trades or timestamps are complete.** PMData says
days with no events may be absent within that range. The catalog does not
verify a usable initial snapshot, venue sequencing, queue position or actual
execution. Downloaded race-specific files require independent validation.

The [provider's historical-data page](https://pmdata.dev/polymarket-historical-data)
advertises a free trial with 600 one-time downloads and 50 per month for data
older than three weeks. Authentication and account creation are required; no
account or file downloads were made for this check. In particular, the 22
October United States window was not yet three weeks old on 2 November 2026.
The free trial's terms and the rights needed for any commercial application
must be checked separately. A file may have no trades even if it has book
events; replaying it requires both the L2 and trade sources.

The original catalog is retained locally at `tmp/pmdata-markets.parquet`
(ignored by Git). To reproduce, download the public catalog URL recorded in the
JSON with a `User-Agent: pmdata-catalog` header and check its SHA-256 against
the recorded value. The catalog is updated daily, so a newly downloaded copy
may differ. It is Parquet and can be queried with DuckDB or PyArrow by matching
the recorded `market_slug`, `record_start` and `record_end` columns.
