# Recent form and conditional prediction layers

**Decision: keep the current strength model without recent form. Add only a small grid-known prediction layer.**

This study uses the existing data through the 2026 Mexico City Grand Prix. It leaves the three driver and car strength ratings unchanged. The new layer changes a race forecast only when both starting positions are supplied. Missing either position returns the existing pre-weekend probability exactly.

## The three form alternatives

| Model | Historical result log loss | Change from no form | Qualifying margin MAE | Race margin MAE |
| --- | ---: | ---: | ---: | ---: |
| No form | 0.530117 | +0.000000 | 0.006468 | 0.005939 |
| External residual form | 0.531138 | +0.001021 | 0.006395 | 0.005862 |
| Joint slow + fast states | 0.529760 | -0.000357 | 0.006417 | 0.005872 |

Lower is better. Timing errors are fractions of lap time. Model parameters were chosen on 2002–2007 predictions, after 1994–2001 warm-up. Forecast calibration used years before each evaluation block. Historical results cover 2008–2025; each race has equal weight.

External form worsened result predictions. Embedded form improved log loss by only 0.000357, below the declared 0.001 threshold, with a whole-season 95% interval of roughly [−0.001192, +0.000454]. It improved two historical blocks and worsened two. Timing gains were about 0.8% in qualifying and 1.1% in race pace. They did not establish a useful separate result-strength component.

The embedded slow driver estimate moved about 11% less at the 90th percentile, but its total driver estimate moved almost twice as much (6.91 versus 3.50 points). These movement summaries compare adjacent appearances present in both snapshots, so they differ slightly from the original unified-study statistic. A smoother slow curve is a consequence of the imposed decomposition, not independent evidence that it is a more accurate ability estimate.

Both candidates selected an 84-day fast half-life, 16 driver points and 24 car points of stationary fast variation from the small declared grid. The embedded candidate retained the original slow-process rate. Slow is a random walk; fast is mean-reverting. Two unconstrained random walks would identify only their sum. The full embedded covariance retains the negative slow/fast correlation; adding separate error bars would be wrong.

The external correction fits residuals after the ordinary update and does not feed back into ratings. It is a predictive residual model, not independent evidence: its summed uncertainty omits correlation with the original filter. The embedded candidate is cleaner probabilistically, but the additional timescale remains assumption-dependent. The small known-state simulations did not establish reliable separate recovery: fast estimation errors were still large, including when transient form existed.

A bounded interaction check allowed the minimal linear head to learn how to use total and fast states. External form then improved production log loss by only 0.000152; embedded form improved it by 0.000558. Neither passed the same 0.001 adoption rule. No further parameter search followed.

2026 monitoring was more favourable to form: loss was 0.52304 without form, 0.51771 externally and 0.51874 embedded. These 19 races were reported separately and did not select the model. They are a reason to keep monitoring, not to override inconsistent historical evidence.

## Prediction layers

A head should learn from future observed outcomes, not from the model’s later ratings. Training it to imitate its own subsequent estimates would make the target depend on the assumptions being tested. Our outcome heads optimize actual-result log loss, including the explicit retirement model. Timing observations remain the independent target for checking pace quality.

Without a grid, reweighting all six driver/car strengths did not earn its place. Circuit-specific rating effects and a small nonlinear basis also failed the improvement rule. An inner chronological family selector mostly retained the original pre-weekend calculation. Each fitted head preserves exact competitor reversal and has no free intercept.

| Same grid-covered historical pairs | Rating-only forecast | Compact grid head |
| --- | ---: | ---: |
| Log loss | 0.528053 | 0.504646 |
| Brier score | 0.174928 | 0.164702 |
| Calibration slope; 1 is ideal | 0.966 | 0.976 |

The comparison includes 73,749 pairs across 362 races. Every historical block improves. The paired whole-season 95% interval for the loss difference is [-0.031003, -0.016177]. This is the benefit of additional information; it is not a better Thursday forecast. Starting positions are their final archival values, assumed available before the start. Four pairs with duplicate positive grid slots are excluded from the final production exam.

The production competitive log odds are:

```text
rating coefficient × overall package gap / sqrt(1 + π × gap variance / 8)
  + grid coefficient × (B starting position − A starting position) / 10
```

The gap is in latent units; driver and car strengths are added as usual. The two coefficients are fitted with ridge shrinkage toward a rating-only fit on the same training sample, selected from three penalties using four earlier validation seasons. Retirement risks are then applied exactly as before. No second calibration layer is retained. Grid slots affect predictions, never strength updates.

The initial six-rating grid head added only about 0.000013 in log-loss improvement over an exploratory overall-plus-grid head. The final implementation simplifies that further to two predictors, selects regularization directly on raw forecast loss, and revalidates the exact implementation. Circuit interactions and nonlinear additions worsened the simple grid head. Extra temperature calibration did not earn a separate stage. A known-weather residual check also failed; its labels cover realized wet races through 2025 and never enter unconditional pre-weekend predictions.

## Reproduction and checks

Run `node research/unified-form/run.mjs` after installing the model requirements. It exports existing evidence, runs the bounded form comparison and prediction-layer comparisons, performs the small synthetic check, and rewrites this report. It does not automatically alter production settings. Intermediate arrays are in ignored `tmp/unified-form/`.

The canonical retained grid fitter is `packages/core/python/unified_grid.py`; the browser calculation is in `packages/core/src/unified/forecast.js`. Production rebuilds fit historical and annual grid bundles only from earlier years. Tests cover derivatives, reversal, shared-car cancellation, slow/fast covariance and decay, transfers, future-data invariance, invalid/missing grids, unchanged ratings and Python/JavaScript inference parity.

The [protocol](protocol.md) records the original criteria and the bounded follow-up checks. Detailed outputs: [form](form-results.json), [heads](head-results.json), [calibration selection](head-selection.json), [form/head interaction](interaction-results.json), [minimal grid comparison](grid-comparison.json), [production grid](production-grid-results.json), [weather](weather-results.json), and [simulations](simulation-results.json). The [production parity check](production-parity.json) confirms that all 59,667 published ratings across 620 weekends retain their baseline values. These remain retrospective comparisons, not independent prospective confirmation.

Background: [Stan’s time-series guide](https://mc-stan.org/docs/stan-users-guide/time-series.html) describes autoregressive states; [scikit-learn’s calibration guide](https://scikit-learn.org/stable/modules/calibration.html) explains calibration curves and why log loss also reflects discrimination. These references motivate methods; they do not validate this project’s results.
