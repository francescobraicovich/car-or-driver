# Retrospective pre-practice strategy signals

`strategy-features.mjs` rebuilds the existing state-space/hybrid model from
race data dated strictly before the UTC decision date. It then applies the
existing pre-weekend pairwise forecast head to the previous-race driver/team
roster, without supplying current-weekend qualifying, grid or results.

The saved [feature records](strategy-features.json) cover seven Thursday
14:00 UTC decisions. They contain no target race outcome. For each driver:

- `baselineProbability` is the existing uncalibrated full-roster softmax of
  combined driver and car ratings, matching the earlier winner-score baseline.
- `formShift` is the complete-roster least-squares projection of the change in
  pairwise log-odds between the full pre-weekend head and that same head with
  the recent-form features switched off. It includes combined driver and team
  form and is expressed in log-odds units, not rating points.
- `teammateFormShift` subtracts the prior team's mean `formShift`. It represents
  a within-team contrast in the same units, not an independently fitted signal;
  a lone team member in the previous roster receives zero.
- `fullHeadStrength` is the analogous projected full pairwise head in log-odds
  units. Its softmax is a heuristic winner-score distribution, not a calibrated
  probability that the driver wins the race.

The model architecture, trained head, corrected input data, track schedule and
prior-race roster are today's retrospective versions, not proven available at
the historical decision. The previous roster can omit entrants, include drivers
who did not start, or have outdated team assignments. No probability is
allocated to Other or a cancelled event. A pairwise pace/finishing-order head
does not by itself predict race-win contract settlement. Fitting or comparing
strategy parameters on the seven observed races is therefore a research
sensitivity, not proof of an independently reproducible trading edge.

Rebuild from the repository root with Node.js:

```sh
node research/prediction-markets/pmdata/strategy-features.mjs > /private/tmp/strategy-features.json
node research/prediction-markets/pmdata/strategy-features.mjs --earlier-training > /private/tmp/earlier-features.json
node research/prediction-markets/pmdata/strategy-features.mjs --utc-midnight > /private/tmp/midnight-features.json
node tests/test-pmdata-strategy-features.mjs
```

`--earlier-training` selects Canada, Monaco and Barcelona at 14:00 UTC on the
Thursday before each race; the [saved earlier features](strategy-features-earlier.json)
may be used as training inputs before the later seven races. `--utc-midnight`
uses midnight for whichever fixed race batch is selected. The independently
rebuilt [midnight features](strategy-features-midnight.json) match the
same-day 14:00 rosters and scores exactly. The calendar-prefix builder excludes the entire
decision date in either case; the 00:00 and 14:00 signals for a given day
therefore use the same race-history prefix. The decision timestamp itself is
different, so never substitute a 14:00 feature record into an earlier replay.

The generated values depend on the checked-in model and data files; no API key
or exchange data are needed. The test checks roster normalization, zero-sum
form projections, team centering, permutation invariance, invalid inputs and
the calendar-date cutoff.
