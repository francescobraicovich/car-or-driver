# Pre-FP1 sampled-price comparison

This retrospective comparison scores the repository's **uncalibrated winner pace proxy** against raw Polymarket CLOB sampled prices for the same 22 named-driver YES contracts in each of four races. These are per-contract binary scores, not a complete race-winner distribution and not a trading backtest. The sampled price is not an executable quote; the API does not establish the underlying order-book or last-trade freshness. The four races are a small selected sample and the 88 binary observations are dependent: each race has just one positive result among 22 named contracts.

The result JSON is [`polymarket-binary-comparison-2026.json`](polymarket-binary-comparison-2026.json). It includes each observation, source URL and original response SHA-256, full parsed CLOB and Gamma responses, source-time cutoff, per-race outcomes, excluded markets, errors, and price-series flags. The CLOB `prices-history` series are sampled at requested one-minute fidelity; the reported sample timestamp is a sample time, not proof that a live executable price changed at that time. Gamma outcomes are current resolved metadata used only to score results after the race; they are checked against the recorded local race winner. See [Polymarket's prices-history reference](https://docs.polymarket.com/api-reference/markets/get-prices-history) for the upstream endpoint.

## Predeclared rules and coverage

- Use the four designated Austrian, British, Belgian and Hungarian 2026 Grand Prix events. The decision is one second before the published FP1 start; the 30-minute request window ends there. Pick the last returned point at or before that decision and reject a selected sample more than 180 seconds old. All selected timestamps precede FP1. This filter does not verify the age of the underlying book or trade.
- Match the 22-driver **previous-race roster** to current Gamma named-market titles using unique surnames, and verify each YES token and condition ID against the separately recorded outcome identifiers. Each named market must have been created and started by the decision time and must currently have an unambiguous resolved 0/1 YES outcome. Require exactly one named winner, matching the local race-results winner. Model scores were built from a previous-race data prefix; the published data and model-vintage limitations in [README.md](README.md) still apply.
- The Gamma event contains 28 markets: 22 named drivers plus `Other` and `Driver A` through `Driver E`. The six non-roster/placeholder markets in each event are explicitly excluded from this **named-contract binary** exercise, with no claim that they had zero historical probability. Their sampled prices were not requested. There is no normalization across named contracts and no comparison of complete winner distributions.
- A missing series, an invalid or boundary 0/1 sample, a selected point older than 180 seconds, a token mismatch, an unresolved outcome, or an incomplete roster match generates an explicit error rather than a fabricated score. Current responses produced no such errors: 88/88 requested contracts returned acceptable sampled prices. There were no 0 or 1 values among the 2,640 returned sample points. Values can be near zero: the minimum was 0.0005.
- A constant 0.5 series is flagged as an unverified possible placeholder, **not** treated as proof of one: both all-eligible and excluding-constant-0.5 scores are reported. There were zero such series, so both sets coincide. After observing the data, an additional exploratory sensitivity excludes any series constant for the full 30-minute window. Constancy does not prove staleness; genuine prices can remain unchanged.

## Results

Each row contains the mean binary score across the same 22 matched named contracts. Lower is better. The named price mass is the **unnormalized** sum of raw sampled prices and excludes all six other contracts.

| Race | Model Brier | Sampled-price Brier | Model log loss | Sampled-price log loss | Named price mass | Constant series |
|---|---:|---:|---:|---:|---:|---:|
| Austria | 0.02429 | 0.04007 | 0.08411 | 0.12595 | 1.0780 | 20/22 |
| Britain | 0.04218 | 0.05334 | 0.13640 | 0.20502 | 1.0560 | 19/22 |
| Belgium | 0.03939 | 0.02182 | 0.12566 | 0.07608 | 1.0460 | 20/22 |
| Hungary | 0.04742 | 0.05034 | 0.16638 | 0.17641 | 1.0805 | 18/22 |
| All 88 contracts | 0.03832 | 0.04139 | 0.12814 | 0.14587 | — | 77/88 |

The all-eligible sample contains four positive outcomes. For the realized winners only, the model / sampled-price pairs were Russell 0.3226 / 0.1750 in Austria, Leclerc 0.1321 / 0.0355 in Britain, Antonelli 0.1613 / 0.3850 in Belgium, and Norris 0.0727 / 0.0660 in Hungary. These outcome labels were not inputs to selecting prices. Sample ages at the cutoff were 51–56 seconds; again, that is **not** the age of the underlying quote.

The exploratory nonconstant-only subset contains 11 contracts and one positive, with model / sampled-price Brier 0.09841 / 0.11547 and log loss 0.35335 / 0.40231. This subset is selected after inspecting the data and is much smaller; it cannot establish an edge. The constant-series prevalence, unknown underlying freshness, retrospective model configuration, class imbalance and four dependent races substantially limit interpretation.

## Reproduction and tests

Run the offline comparison tests:

```sh
python3 research/prediction-markets/forecast/test_compare_polymarket_prices.py
node tests/test-winner-probability.mjs
```

Re-fetch the public Gamma and CLOB endpoints with the same sampling and matching rules:

```sh
python3 research/prediction-markets/forecast/compare_polymarket_prices.py --output research/prediction-markets/forecast/polymarket-binary-comparison-2026.json
```

Network access and verified TLS are required. Gamma responses are current metadata and can change on a later retrieval; keep the saved file and its original-response hashes when reproducing this specific study. The command reports any incomplete rows and exits with failure if there are fetch, validation or matching errors. An apparent difference in these scores does not establish that either approach is calibrated or that any order could have been placed or filled at the sampled prices.
