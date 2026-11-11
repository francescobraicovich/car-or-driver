# Model evaluation

This directory contains the acceptance protocol and recorded evaluation results for the state-space model. `regenerate.sh` runs the earlier state-space evaluation suite against the current data; it is not the current published-model scorecard. Its 2016 onward outputs are second looks, not untouched holdouts. Run `npm run evaluate` for the current pipeline. See [backtesting](../../docs/backtesting.md) and [hybrid](../../docs/hybrid.md) for interpretation and limitations.

The `backbone/` directory records the prior Elo benchmark selection protocol and era-transfer evidence.

Historical acceptance records may refer to documentation since removed; those earlier documents remain in Git history.
