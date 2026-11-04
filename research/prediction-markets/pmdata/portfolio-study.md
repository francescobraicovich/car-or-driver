# PMData winner-portfolio sensitivity

**Stale results:** This study was generated before the replay's floating-point
queue-depth correction. Its reported numbers have not been regenerated and
are not verified reproducible with the corrected engine; a rerun is required
before relying on them.

This is a retrospective conditional simulation, not proof of profitable
market making. The seven races and Thursday 14:00–16:00 UTC windows were
chosen after inspecting related records. Forecast settings, historical data
vintages, fee eligibility and model provenance are not independently verified.
No sample below is an untouched evaluation set.

A separate [full-Thursday sensitivity](full-window/README.md) explores a longer
window selected after these results; it has different exclusions and must not
be combined with this study as an independent evaluation.

The fixed strategy uses retrospective Norris/Hamilton win scores, $100 shared
cash, five funded YES/NO sets per driver, five-share orders, maximum inventory
of 10, a one-cent tick and five-share minimum. The quotes use a one-tick model
edge and inventory skew, with one-second submission and cancellation latency.
Orders in flight remain reserved and can fill until cancellation takes effect;
new submissions stop two seconds before the end of the window. No negative-risk
conversion is assumed. Conditional
settlement uses one winner for the race and releases cash at the latest Gamma
`closedTime`, assuming immediate redemption without gas or operational costs.

PMData YES/NO trade prints are joined by transaction ID to the same provider's
decoded on-chain logs. Exchange summary logs are excluded and individual maker
prices and quantities are reconciled before an aggregate print can advance a
queue. For 304 Austrian logs the conversion matched an independently sourced
chain extract exactly. Source hashes and all simulated fill IDs are in the
machine-readable output. The maker model charges zero fees and assumes zero
rebates. Separate pre-practice liquidation scenarios use the price-dependent
Polymarket sports fee formula and a one-cent adverse slippage, with 0.03 before
10 July 2026 and 0.05 afterwards as category assumptions, not verified
contract-specific fees. Each liquidation scenario starts independently with
$100 and is not compounded across races.

## Results

With the initial 60-second maximum source age, **five of seven races** ran:
Austria, Britain, Belgium, Hungary and the Netherlands. Italy and Singapore
failed the age guard and are excluded, not treated as zero-return races. The
five-race settlement sensitivity contains one hypothetical fill, and the shared
balance changes from $100 to $100.80. This is a conditional output, not a
verified historical trading result. The separate 120-second sensitivity was
chosen after observing the data; it includes seven races and also ends at
$100.80 because it simulates no fills in Italy or Singapore.
Because only one of the two driver contracts fills across the whole sample,
the results do not empirically test how simultaneous correlated positions
interact, despite the shared cash and single-winner settlement accounting.

| Race | First Norris snapshot UTC | First Hamilton snapshot UTC | 60s run | 120s sensitivity |
| --- | --- | --- | --- | --- |
| Austria | 14:05:59.497 | 14:05:59.366 | $0, no fill | $0, no fill |
| Britain | 15:01:13.582 | 14:04:16.737 | +$0.80, one fill | +$0.80, one fill |
| Belgium | 15:24:40.088 | 15:25:00.506 | $0, no fill | $0, no fill |
| Hungary | 14:32:21.136 | 15:00:07.860 | $0, no fill | $0, no fill |
| Netherlands | 14:00:58.379 | 14:34:16.781 | $0, no fill | $0, no fill |
| Italy | 14:44:05.927 | 14:26:14.334 | Rejected: source age | $0, no fill |
| Singapore | 14:02:04.678 | 15:51:31.114 | Rejected: source age | $0, no fill |

The British simulation hypothetically sells five pre-funded Hamilton YES shares
at $0.16 and carries them through settlement, when the reported winner was
Leclerc. The incremental result is +$0.80. If Hamilton had won instead, that
isolated fill would have lost $4.20 under the same settlement accounting. In
the separate pre-practice liquidation sensitivity, buying the five shares back
at $0.17, including the assumed one-cent slippage, incurs a $0.021165 assumed
taker fee and produces −$0.071165. Other included races have zero fills and
zero simulated liquidation profit; the 60-second Italy and Singapore scenarios
are rejected rather than valued.

The prior PMXT two-hour example simulated an Austrian fill, while this PMData
run did not. The provider feed order and simulated queue/cancel assumptions
can materially change whether that trade fills. This disagreement reinforces
that neither result validates a trading edge.

As a narrowly scoped execution check, `pm-hftbacktest` 1.0.12 also simulated
the selected British Hamilton five-share sale when submitted at 14:04:16.737
UTC at $0.16 with one-second entry and response latency and its risk-averse
queue model. The visible ask at submission was 30.92 shares. This order and
print were selected after inspecting the portfolio result, and the check does
not reproduce the full shared-collateral strategy. The book reduction precedes
the trade print in the converted event sequence; hftbacktest's Tardis converter
documentation warns that this ordering can count queue advancement twice. We
have not established whether that occurs here, so this is not an independent
validation of the simulated fill.

To run the check using the locally downloaded PMData files, install
`pm-hftbacktest==1.0.12`, pandas and PyArrow in a Python environment, then run
`python3 research/prediction-markets/pmdata/crosscheck_hft.py`.

All 14 markets have a book before 14:00, but those books are not used: in 11
markets a recorded trade arrived after the last pre-window book and no later
snapshot established its effect. To keep one uniform policy, each market starts
only on its first snapshot inside the window. Its earlier market activity is
excluded. Effective start times therefore differ materially; a skipped period
cannot be interpreted as evidence of no fills. The separate
[window audit](window-audit.md) documents event counts and reconciliation.

The historical feed lacks an authenticated complete ordering and queue
position. Many L2 events share a receive timestamp, handled in file order as
an assumption. L2 and trade events can arrive out of causal order; trade prints
do not prove that our hypothetical order was still active or accepted. The
strategy is told of simulated fills at public-print receipt; real order-fill
acknowledgements have their own delay and may arrive in another order. Replay
results can be too optimistic or pessimistic: trade-through fills, the market's
reaction to our quotes, dynamic tick changes and actual rebates are not modeled.
Per-market archive coverage remains `false`, and strict mode rejects every race.

Two source-age limits are reported: the initial 60-second rule and a separate
120-second sensitivity selected after observing late records in Italy and
Singapore. The latter is not a prespecified independent validation. Events
older than either selected threshold fail the affected race rather than being
silently omitted. In a run with excluded races, cash is carried only over the
accepted, non-overlapping races; it is not an estimate for all seven.

Reproduce from the repository root after obtaining the 42 market-day PMData L2,
trades and on-chain fill Parquet files in `tmp/pmdata` and installing pandas and
PyArrow in the chosen Python environment:

```sh
python3 research/prediction-markets/pmdata/run_portfolio_study.py --run-retrospective-sensitivity
```

The single command normalizes the local raw files to a temporary directory,
then writes the 60-second and 120-second JSON outputs. It never reads the PMData
key or makes network requests. The raw data remain in ignored `tmp/`; obtaining
them on another machine requires a PMData account, and the download manifest
records file hashes. See the [downloader instructions](README.md). The
repository also requires Node.js to run the existing portfolio engine.

The outputs are [the five-race 60-second case](portfolio-sensitivity-60s.json)
and [the seven-race 120-second sensitivity](portfolio-sensitivity-120s.json).
