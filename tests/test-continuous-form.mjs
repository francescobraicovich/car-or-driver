import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../packages/research/node/common.mjs';
import { collectExam } from '../packages/core/src/state-space/exam.js';
import { runPublishedRatings } from '../packages/core/src/state-space/build.js';
import { ContinuousFormFeatures as ProductionForm } from '../packages/core/src/forecast/continuous-form.js';
import { ContinuousFormFeatures as ResearchForm } from '../research/current-form/form-candidates.mjs';
import { ratingDigest, ratingValues } from '../research/current-form/rating-digest.mjs';
import { compareRatingSignatures, ratingSignature } from './rating-signature.mjs';
import { createFormFeatures } from '../packages/core/src/forecast/form-method.js';
import { FormFeatures } from '../packages/core/src/forecast/form.js';
import { forecastPair } from '../packages/core/src/forecast/prepare.js';
import { STATE_SPACE_HEADS } from '../packages/core/src/state-space/forecast-heads.js';
import { replayForecastLayer } from '../packages/core/src/state-space/replay.js';

// Saved models without a method tag retain legacy features; current models
// select continuous features and all fitted heads declare the same method.
assert(createFormFeatures(null) instanceof ProductionForm);
assert(createFormFeatures(null, 'legacy') instanceof FormFeatures);
assert(!(createFormFeatures(null, 'legacy') instanceof ProductionForm));
assert.throws(() => createFormFeatures(null, 'unknown'), /Unknown form method/);
const replay = (heads) => replayForecastLayer([], { race: [], qual: [] }, { lapPace: null, params: {}, heads }).form;
assert(replay(null) instanceof ProductionForm, 'new training replay uses continuous form');
assert(!(replay({ 2024: { pre: {} } }) instanceof ProductionForm), 'legacy heads without metadata use legacy form');
assert(replay({ 2024: { pre: { formMethod: 'continuous' } } }) instanceof ProductionForm, 'tagged heads use continuous form');

for (const heads of Object.values(STATE_SPACE_HEADS))
  for (const head of Object.values(heads)) {
    assert.equal(head.formMethod, 'continuous', 'all production heads use the installed form schema');
  }
function savedModel(form, head) {
  const drivers = [
    { driverId: 'a', constructorId: 'X', q: 0 },
    { driverId: 'b', constructorId: 'Y', q: 0 },
  ];
  const cars = [
    { constructorId: 'X', q: 0 },
    { constructorId: 'Y', q: 0 },
  ];
  const latest = { driverIds: ['a', 'b'], carIds: ['X', 'Y'], mean: new Float64Array(4) };
  return {
    snaps: [{ year: 2024, round: 1, circuitId: '', drivers, cars }],
    params: { modelKind: 'state-space', scale: 75, hazardW: 0, stdLaps: 30 },
    ss: { latest: { race: latest, qual: latest } },
    forecastState: { form, seen: new Map(), heads: { 2024: { pre: head, post: head, grid: head } } },
  };
}
const legacy = createFormFeatures(null, 'legacy', { track: false });
legacy.year = 2024;
legacy.forms.qual_fast.d.set('a', 1);
legacy.forms.qual_fast.c.set('X', 0.5);
const legacyState = legacy.exportState();
assert.equal(legacyState.method, undefined);
const legacyResult = forecastPair(savedModel(legacyState, { family: 'linear', names: ['qual_fast'], coefficients: [1] }), 'a', 'b');
assert(Math.abs(legacyResult.p - 1 / (1 + Math.exp(-1.5))) < 1e-12, 'untagged saved state uses legacy package form');
const continuous = createFormFeatures(null, 'continuous');
continuous.year = 2024;
continuous.forms.qual_fast.d.set('a', 1);
continuous.forms.qual_fast.c.set('X', 0.5);
const continuousResult = forecastPair(
  savedModel(continuous.exportState(), {
    family: 'linear',
    names: ['qual_fast_driver', 'qual_fast_car'],
    coefficients: [1, 1],
    formMethod: 'continuous',
  }),
  'a',
  'b',
);
const aged = Math.fround(2 ** (-1 / 10)) + Math.fround(0.5 * 2 ** (-1 / 10));
assert(Math.abs(continuousResult.p - 1 / (1 + Math.exp(-aged))) < 1e-12, 'tagged state uses aged continuous features');

const data = await loadData();
const { model, weekends } = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
const runs = runPublishedRatings(weekends, model.params.tmBoost);
const originalDigest = ratingDigest(runs);
// Future data refreshes can append weekends without changing the archived test.
const referenceWeekends = weekends.slice(0, 619);
assert.equal(String(referenceWeekends.at(-1)?.info.raceId), '1186', 'the archived calendar is intact');
const referenceRuns = weekends.length === 619 ? runs : runPublishedRatings(referenceWeekends, model.params.tmBoost);
const fixture = JSON.parse(await readFile('tests/fixtures/long-term-rating-signature.json', 'utf8'));
assert.equal(
  fixture.referenceDigest,
  '941ccb58a8b3a3d7a939c22c2fe0065a8085fe9b60228a44adeaa56a63604048',
  'fixture is anchored to the original reference',
);
const comparison = compareRatingSignatures(ratingSignature(ratingValues(referenceRuns)), fixture);
assert.ok(comparison.equal, `long-term driver/car states and predictions match the frozen reference: ${comparison.reason}`);
// A small real change in one rating must not hide in a full-build aggregate;
// representable last-bit noise is allowed across engines and processors.
const control = { rating: Array.from({ length: 512 }, (_, i) => 900 + i / 10) };
const controlSignature = ratingSignature(control);
const noise = { rating: control.rating.map((value) => value * (1 + 1e-12)) };
assert.ok(compareRatingSignatures(ratingSignature(noise), controlSignature).equal, 'small floating-point noise is tolerated');
const changed = { rating: [...control.rating] };
changed.rating[111] += 0.01;
assert.equal(compareRatingSignatures(ratingSignature(changed), controlSignature).equal, false, 'a 0.01-point rating change is detected');
assert.equal(
  compareRatingSignatures(ratingSignature({ rating: control.rating.slice(1) }), controlSignature).equal,
  false,
  'shape changes are detected',
);
const actual = new ProductionForm(data.lapPace);
const expected = new ResearchForm(data.lapPace);
let compared = 0;
for (const [i, weekend] of weekends.entries()) {
  const context = {
    info: weekend.info,
    rows: weekend.rawRows,
    qrows: weekend.qrows,
    raceSeen: weekend.raceSeen,
    D: runs.race.pre[i].drivers,
    C: runs.race.pre[i].cars,
    QD: runs.qual.pre[i].drivers,
    QC: runs.qual.pre[i].cars,
  };
  actual.beforeWeekend(context);
  expected.beforeWeekend(context);
  assert.deepEqual(actual.exportState(), expected.exportState(), `pre-state at ${weekend.info.raceId}`);
  const used = new Set();
  for (const { ob, session } of weekend.replayObs) {
    if (used.has(session)) continue;
    used.add(session);
    for (const [x, y] of [
      [ob.x, ob.y],
      [ob.y, ob.x],
    ]) {
      assert.deepEqual(
        actual.features(x, y, session, 0.6, 0.55),
        expected.features(x, y, session, 0.6, 0.55),
        `pair features at ${weekend.info.raceId} ${session}`,
      );
      compared++;
    }
  }
  const update = { info: weekend.info, rows: weekend.rawRows, replayObs: weekend.replayObs };
  const captured = actual.exportState();
  actual.afterWeekend(update);
  expected.afterWeekend(update);
  assert.deepEqual(actual.exportState(), expected.exportState(), `post-state at ${weekend.info.raceId}`);
  if (i === 0) {
    assert.equal(captured.method, 'continuous');
    assert.equal(captured.forms.order_fast.d.size, 0, 'checkpoint remains detached from later updates');
    const restored = new ProductionForm(data.lapPace);
    restored.importState(actual.exportState());
    assert.deepEqual(restored.exportState(), actual.exportState(), 'form state restores independently');
    assert.throws(() => restored.importState({ ...actual.exportState(), method: 'innovation' }), /method/);
  }
}
assert.equal(ratingDigest(runs), originalDigest, 'form replay never changes the ratings');
console.log(`PASS continuous form: ${weekends.length} weekends, ${compared} paired feature checks and all dated states`);
