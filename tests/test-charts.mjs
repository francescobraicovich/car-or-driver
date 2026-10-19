import assert from 'node:assert/strict';
import { splitSegments, entityColor, timeOf } from '../site/js/chart-renderer.js';
import { smoothSeries, carContinuitySeries, metricValue, metricLabel } from '../site/js/charts.js';

const snap = (date, year, raceId, extra = {}) => ({ date, year, raceId, v: 1000, ...extra });
const h = [
  snap('2022-03-20', 2022, 1, {
    race: 1000,
    qual: 1000,
    combined: 1000,
    effective: 1000,
    clean: 0.9,
    incidentElo: 1000,
    survival: 0.9,
    reliabilityElo: 1000,
  }),
  snap('2022-11-20', 2022, 2, {
    race: 1010,
    qual: 1005,
    combined: 1008,
    effective: 1006,
    clean: 0.92,
    incidentElo: 1002,
    survival: 0.93,
    reliabilityElo: 1004,
  }),
  snap('2023-03-05', 2023, 3, {
    race: 1050,
    qual: 1040,
    combined: 1046,
    effective: 1044,
    clean: 0.95,
    incidentElo: 1010,
    survival: 0.95,
    reliabilityElo: 1010,
  }),
  snap('2023-04-30', 2023, 4, {
    race: 1060,
    qual: 1055,
    combined: 1058,
    effective: 1056,
    clean: 0.96,
    incidentElo: 1012,
    survival: 0.96,
    reliabilityElo: 1012,
  }),
];

assert.equal(metricValue(h[0], 'clean', 'driver'), 90);
assert.equal(metricValue(h[0], 'survival', 'car'), 90);
assert.equal(metricValue(h[0], 'incident', 'driver'), 1000);
assert.equal(metricValue(h[0], 'reliability', 'car'), 1000);
assert.ok(Number.isNaN(metricValue(h[0], 'survival', 'driver')));
assert.equal(metricLabel('survival').includes('60-lap'), true);
assert.equal(metricLabel('unknown'), 'unknown');

assert.deepEqual(splitSegments([]), []);
assert.equal(splitSegments([h[1]]).length, 1);
assert.equal(splitSegments([h[0], h[1], h[2]]).length, 2, 'season break splits into gap segments');
assert.equal(splitSegments([{ ...h[0], gap: true }, h[1]]).length, 2, 'explicit gap flag');
assert.equal(
  splitSegments([
    { date: '2022-03-05', v: 1 },
    { date: '2022-03-05', v: 2 },
  ]).length,
  2,
  'duplicate timestamps split',
);
const annual = [2019, 2020, 2021].map((year) => ({ date: `${year}-07-01`, year, v: 0.4 }));
assert.equal(splitSegments(annual).length, 3, 'a year apart looks like a winter break by default');
assert.equal(splitSegments(annual.map((p) => ({ ...p, contiguous: true }))).length, 1, 'annual series stay one line');
assert.equal(entityColor('driver', '1'), entityColor('driver', '1'), 'stable colour');
assert.notEqual(entityColor('driver', '1'), entityColor('car', '1'));
assert.equal(timeOf({ date: '2022-03-05' }), Date.UTC(2022, 2, 5));
assert.equal(timeOf({ year: 2009, date: 'bogus' }), Date.UTC(2009, 0, 1));

function referenceSmooth(h, radius) {
  radius = Math.max(0, Math.round(+radius || 0));
  if (!radius || h.length < 3) return h.map((x) => ({ ...x }));
  const out = [];
  for (let i = 0; i < h.length; i++) {
    let num = 0;
    let den = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(h.length - 1, i + radius); j++) {
      const ti = Date.parse(h[i].date) || new Date(h[i].year, 0, 1).getTime();
      const tj = Date.parse(h[j].date) || new Date(h[j].year, 0, 1).getTime();
      if (Math.abs(tj - ti) > 240 * 86400000) continue;
      const w = radius + 1 - Math.abs(j - i);
      num += h[j].v * w;
      den += w;
    }
    out.push({ ...h[i], v: den ? num / den : h[i].v });
  }
  return out;
}

const pts = h.map((p) => ({ ...p, v: p.race }));
assert.deepEqual(smoothSeries(pts, 0), pts);
const randomFixture = Array.from({ length: 40 }, (_, i) => ({
  date: `20${10 + (i % 9)}-0${1 + (i % 9)}-1${i % 10}`,
  year: 2010 + (i % 9),
  raceId: i,
  v: 900 + i * 3,
}));
for (const radius of [1, 2, 5, 12])
  assert.deepEqual(
    smoothSeries(randomFixture, radius),
    referenceSmooth(randomFixture, radius),
    `radius ${radius} matches the original algorithm`,
  );
assert.equal(smoothSeries(pts, 1)[1].v, (2 * 1010 + 1050) / 3, '105-day winter gap still smooths');
const out = smoothSeries(
  h.map((p) => ({ ...p, v: p.race })),
  2,
);
assert.deepEqual(
  out.map((p) => p.race),
  h.map((p) => p.race),
  'raw untouched',
);

const cont = carContinuitySeries(pts, 'soft', 5);
assert.equal(cont[2].v, 1010, 'soft bridge anchors the new season at the previous displayed endpoint');
assert.ok(Math.abs(cont[3].v - (1060 - 40 * 0.5 * (1 + Math.cos(Math.PI / 5)))) < 1e-9, 'soft bridge fades back toward the raw rating');
const idx = carContinuitySeries(pts, 'index', 5);
assert.equal(idx[2].v, 1010, 'development index anchors the new season at the previous endpoint');
assert.equal(idx[3].v, 1020, 'development index preserves within-season raw deltas');
assert.equal(carContinuitySeries(pts, 'raw', 5)[2].v, 1050);

console.log('PASS chart geometry, smoothing and continuity regression checks');
