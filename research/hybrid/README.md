# Hybrid selection evidence

The three selected scorecards preserve the historical comparison of the published hybrid with its prior filter-only baseline. The 2016–2025 and 2026 results were inspected during selection and are not independent holdout tests. The model, scorecard values, bootstrap intervals and limitations are described in [the hybrid methodology](../../docs/hybrid.md).

The scripts in this directory reproduce the candidate ratings, paired confidence intervals and prefix-invariance check. The ranking implementation retains the original candidate calculation for reproducibility; the production implementation is in `packages/core/src/hybrid/`. Retired experiments are available in Git history.
