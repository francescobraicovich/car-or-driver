# Joint-evidence teammate graph research baseline

This study combines finishing order, overlapping race-lap pace margins and
qualifying margins in one temporal teammate graph. It uses the existing local
data, including the existing evidence exclusions. Its definition and acceptance
rules are in [the protocol](protocol.md); the production graph remains the
control.

The completed comparison selects **joint evidence with gap uncertainty**.
Use [baseline.json](baseline.json) as the starting specification for subsequent
graph research. [Recorded results](results.md) explain the improvement and why
session separation, altered memory and weekend states were not retained.

The graph estimates one driver strength per season. Finish and pre-retirement
order are ordinal observations. Qualifying and race pace are continuous signed
fractions of lap duration. Source scales are estimated from completed earlier
seasons and frozen for each incoming measurement. A robust logistic measurement
loss bounds the influence of exceptional margins. Finish and pace share a race
evidence budget, while qualifying supplies a separate observation. Neither
duplicate rows nor the sign of an already-used margin add another observation.

For a margin observation, an update responds to the difference between the
observed and predicted margin. A narrow win can therefore reduce an estimated
advantage if the graph expected a much larger win. Increasing the observed
margin still favors that driver monotonically. This is an intentional
consequence of measuring performance differences; the original binary
win/loss direction tests remain checks of the unchanged binary control.

The implementation has three responsibilities:

- [Evidence preparation](evidence.mjs) selects distinct measurements, allocates
  the race budget and estimates past-only source scales.
- [The numerical model](model.py) fits the temporal graph with a sparse Newton
  solve. The same solver reproduces the current binary graph, supports the
  continuous measurements, and computes joint covariance when requested.
- [Evaluation](evaluation.mjs) scores unchanged teammate targets and uses the
  existing frozen-transfer definitions and move-balanced metric. The
  [experiment runner](evaluate.mjs) selects memory settings on the early
  training block and applies the predeclared acceptance guards.

Python uses NumPy and SciPy, already declared in the repository's research
requirements. Actual versions are recorded in the results. Run from the
repository root:

```sh
node tests/test-graph-evidence.mjs
python3 research/graph-evidence/test_model.py
node research/graph-evidence/export.mjs
python3 research/graph-evidence/model.py tmp/graph-evidence/input.json tmp/graph-evidence/configurations.json tmp/graph-evidence/histories.json
node research/graph-evidence/evaluate.mjs
```

The JavaScript evidence and frozen-prediction checks also run under `npm test`.
The numerical-model tests run separately so ordinary Node tests continue to
work without Python dependencies.

To fit only the selected baseline after exporting the evidence:

```sh
python3 research/graph-evidence/model.py tmp/graph-evidence/input.json research/graph-evidence/baseline.json tmp/graph-evidence/baseline-history.json
```

The `forecastUncertainty` setting requires `evaluateGraph(..., { uncertainty:
true })` when scoring the returned history. Its covariance matrices are in
log-odds units; `levels` are rating points. Forecast calibration must still use
only data preceding its evaluation block.

Intermediate evidence and histories are stored under `tmp/graph-evidence`.
The runner writes `results.json` and `selection.json` here. `researchBaseline`
identifies the requested joint-evidence model. `validatedSelection` identifies
the model, if any, that survives the acceptance guards. These are intentionally
separate fields: a requested research starting point is not automatically a
validated production replacement.

Uncertainty, session separation and memory changes are evaluated individually.
Only independently passing changes may be combined, and the combination must
pass again. A full website replacement also requires production integration and
complete forecast validation; this graph-only study does not claim that result.

The objective is a tempered composite likelihood. Hessian covariance is an
approximation and has not established frequentist coverage. Shared equipment
does not eliminate strategy, traffic or unequal-car effects. Historical results
remain retrospective, and 2026 is monitoring only. All failed and inconclusive
comparisons are retained.
