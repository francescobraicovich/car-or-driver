import assert from 'node:assert/strict';
import { FormFeatures } from '../packages/core/src/forecast/form.js';

const rows = [
  { driverId: 'a', constructorId: 'x', statusName: 'Finished', positionOrder: '1', laps: '50' },
  { driverId: 'b', constructorId: 'x', statusName: 'Finished', positionOrder: '2', laps: '50' },
  { driverId: 'c', constructorId: 'y', statusName: 'Finished', positionOrder: '3', laps: '50' },
  { driverId: 'd', constructorId: 'y', statusName: 'Finished', positionOrder: '4', laps: '50' },
];
const qrows = rows.map((row, index) => ({
  ...row,
  position: String(index + 1),
  q1: `1:2${index}.000`,
  q2: '\\N',
  q3: '\\N',
}));
const raceId = 'test-race';
const info = { raceId, year: 2024, round: 1, circuitId: 'test-circuit' };
const paceByDriver = new Map(
  rows.map((row, index) => {
    const median = 80 + index * 0.2;
    return [
      row.driverId,
      {
        med: median,
        n: 8,
        win: [
          { s: 2, med: median, n: 4 },
          { s: 10, med: median, n: 4 },
        ],
      },
    ];
  }),
);
const lapPace = new Map([[raceId, paceByDriver]]);
const maps = {
  D: new Map(),
  C: new Map(),
  QD: new Map(),
  QC: new Map(),
  raceSeen: new Map(rows.map((row) => [row.driverId, 5])),
};

function nextWeekendFeatures(track) {
  const original = new FormFeatures(lapPace, { track });
  original.beforeWeekend({ info, rows, qrows, ...maps });
  original.afterWeekend({ info, rows });
  const checkpoint = original.exportState();
  const nextInfo = { ...info, round: 2 };
  original.beforeWeekend({ info: nextInfo, rows, qrows: [], ...maps });
  const restored = new FormFeatures(lapPace, { track });
  restored.importState(checkpoint);
  restored.beforeWeekend({ info: nextInfo, rows, qrows: [], ...maps });
  const a = rows[0];
  const b = rows[1];
  return {
    checkpoint,
    continuedFeatures: original.features(a, b, 'race', 0.5, 0.5),
    restoredFeatures: restored.features(a, b, 'race', 0.5, 0.5),
  };
}

// Checkpoint and restore retain enabled track state; disabling it leaves package and driver features unchanged.
{
  const enabled = nextWeekendFeatures(true);
  const disabled = nextWeekendFeatures(false);
  assert.deepEqual(enabled.restoredFeatures, enabled.continuedFeatures, 'track-enabled checkpoint restores the same features');
  assert.deepEqual(disabled.restoredFeatures, disabled.continuedFeatures, 'track-disabled checkpoint restores the same features');
  for (const form of Object.values(enabled.checkpoint.forms)) assert.ok(form.track instanceof Map, 'enabled track values are serialized');
  for (const form of Object.values(disabled.checkpoint.forms))
    assert.equal(Object.hasOwn(form, 'track'), false, 'disabled track state is omitted');
  assert.ok(Object.keys(enabled.restoredFeatures).some((name) => name.endsWith('_track')));
  assert.equal(
    Object.keys(disabled.restoredFeatures).some((name) => name.endsWith('_track')),
    false,
  );
  for (const channel of ['qual', 'lap', 'order'])
    for (const speed of ['fast', 'slow']) {
      const name = `${channel}_${speed}`;
      assert.equal(disabled.restoredFeatures[name], enabled.restoredFeatures[name], `${name} package state is unchanged`);
      assert.equal(
        disabled.restoredFeatures[`${name}_driver`],
        enabled.restoredFeatures[`${name}_driver`],
        `${name} driver state is unchanged`,
      );
    }
}

console.log('PASS form state: checkpoint restore and optional track state');
