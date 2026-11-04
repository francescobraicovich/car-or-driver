import assert from 'node:assert/strict';
import { summarizeBacktest } from '../packages/core/src/backtest.js';

const block = ({ obsCount = 1, weight = 1, logLoss = 0.5, brier = 0.25, acc = 0.75 } = {}) => ({
  obsCount,
  weight,
  logLoss: weight ? logLoss : NaN,
  brier: weight ? brier : NaN,
  acc: weight ? acc : NaN,
});

const diagnostic = ({ race, pre = race, qual = block({ weight: 0, obsCount: 0 }) } = {}) => ({
  ...race,
  preWeight: pre.weight,
  preLogLoss: pre.logLoss,
  preBrier: pre.brier,
  preAcc: pre.acc,
  q: qual,
});

const snap = (year, diag) => ({ year, diag });

// Each score is weighted by its own observation weight; all three metrics use the same selected weekends.
{
  const model = {
    snaps: [
      snap(2019, diagnostic({ race: block({ weight: 50 }) })),
      snap(
        2020,
        diagnostic({
          race: block({ obsCount: 2, weight: 2, logLoss: 0.2, brier: 0.4, acc: 0.75 }),
          pre: block({ obsCount: 2, weight: 4, logLoss: 0.6, brier: 0.3, acc: 0.8 }),
          qual: block({ obsCount: 1, weight: 1, logLoss: 0.5, brier: 0.2, acc: 0.5 }),
        }),
      ),
      snap(
        2021,
        diagnostic({
          race: block({ obsCount: 3, weight: 3, logLoss: 0.6, brier: 0.6, acc: 0.25 }),
          pre: block({ obsCount: 3, weight: 2, logLoss: 0.3, brier: 0.5, acc: 0.5 }),
          qual: block({ obsCount: 4, weight: 2, logLoss: 0.7, brier: 0.4, acc: 0.75 }),
        }),
      ),
      snap(2022, diagnostic({ race: block({ weight: 100 }) })),
    ],
  };
  const summary = summarizeBacktest(model, { burnIn: 1, fromYear: 2020, toYear: 2021 });
  assert.equal(summary.weekends, 2, 'burn-in and the year window select one shared set of weekends');
  assert.deepEqual(
    summary.seasons.map(({ year }) => year),
    [2020, 2021],
  );
  assert.equal(summary.overall.raceObs, 5);
  assert.equal(summary.overall.raceW, 5);
  assert.equal(summary.overall.raceLogLoss, (0.2 * 2 + 0.6 * 3) / 5);
  assert.equal(summary.overall.raceBrier, (0.4 * 2 + 0.6 * 3) / 5);
  assert.equal(summary.overall.raceAcc, (0.75 * 2 + 0.25 * 3) / 5);
  assert.equal(summary.overall.preRaceW, 6);
  assert.equal(summary.overall.preRaceLogLoss, (0.6 * 4 + 0.3 * 2) / 6);
  assert.equal(summary.overall.qualObs, 5);
  assert.equal(summary.overall.qualLogLoss, (0.5 + 0.7 * 2) / 3);
  assert.equal(summary.overall.preCombinedLogLoss, (0.6 * 4 + 0.3 * 2 + 0.5 + 0.7 * 2) / 9);
}

// Empty windows and legitimate no-observation weekends retain their documented NaN summary metrics.
{
  const empty = summarizeBacktest({ snaps: [] }, { burnIn: 0 });
  assert.equal(empty.weekends, 0);
  assert.deepEqual(empty.seasons, []);
  assert.equal(empty.overall.raceW, 0);
  assert.ok(Number.isNaN(empty.overall.combinedLogLoss));

  const noObservations = summarizeBacktest({ snaps: [snap(2024, diagnostic({ race: block({ weight: 0, obsCount: 0 }) }))] }, { burnIn: 0 });
  assert.equal(noObservations.weekends, 1);
  assert.equal(noObservations.seasons.length, 1);
  assert.ok(Number.isNaN(noObservations.overall.raceLogLoss));
  assert.ok(Number.isNaN(noObservations.overall.qualLogLoss));
  const legacyEmptyQualifying = summarizeBacktest(
    {
      snaps: [
        {
          year: 2000,
          diag: {
            ...diagnostic({ race: block() }),
            q: { obsCount: 0, logLoss: NaN, brier: NaN, acc: NaN },
          },
        },
      ],
    },
    { burnIn: 0 },
  );
  assert.equal(legacyEmptyQualifying.overall.qualW, 0, 'legacy empty qualifying does not imply malformed positive-weight evidence');
}

// An absent optional diagnostic family is skipped; a present corrupt family is rejected.
{
  const absent = summarizeBacktest({ snaps: [snap(2024, diagnostic({ race: block() }))] }, { burnIn: 0, diag: 'eloDiag' });
  assert.equal(absent.weekends, 0);
  assert.throws(
    () => summarizeBacktest({ snaps: [{ year: 2024, eloDiag: null }] }, { burnIn: 0, diag: 'eloDiag' }),
    /snapshot 2024 eloDiag must be an object/,
  );
}

// Invalid options and reversed ranges fail with direct messages.
{
  for (const burnIn of [-1, 1.5, NaN, Infinity, '1']) assert.throws(() => summarizeBacktest({ snaps: [] }, { burnIn }), /burnIn must be/);
  for (const options of [
    null,
    { fromYear: NaN },
    { fromYear: Infinity },
    { toYear: NaN },
    { toYear: -Infinity },
    { fromYear: 2025, toYear: 2024 },
    { diag: '' },
  ])
    assert.throws(() => summarizeBacktest({ snaps: [] }, options));
}

// Positive-weight race, pre-weekend, and qualifying diagnostics require finite, bounded metrics and valid counts.
{
  const valid = diagnostic({ race: block() });
  const invalidDiagnostics = [
    { ...valid, weight: Infinity },
    { ...valid, weight: -1 },
    { ...valid, obsCount: 0 },
    { ...valid, obsCount: 0.5 },
    { ...valid, logLoss: NaN },
    { ...valid, brier: NaN },
    { ...valid, brier: 1.01 },
    { ...valid, acc: -0.01 },
    { ...valid, preWeight: 1, preLogLoss: NaN },
    { ...valid, q: { ...valid.q, weight: 1, obsCount: 1, logLoss: NaN, brier: 0.2, acc: 0.5 } },
  ];
  for (const diag of invalidDiagnostics)
    assert.throws(() => summarizeBacktest({ snaps: [snap(2024, diag)] }, { burnIn: 0 }), /finite|nonnegative|between|observations/);
  assert.throws(() => summarizeBacktest({ snaps: [snap(NaN, valid)] }, { burnIn: 0 }), /integer year/);
}

console.log('PASS backtest integrity: validation, weighted windows, optional diagnostics, and empty summaries');
