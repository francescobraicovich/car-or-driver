// Golden-master regression test: refactors must not change any model output.
//
// Hashes the *complete* build (every snapshot, diag, export row, history) for the Elo core, the Elo model and the
// state-space model, not just the log-loss, so a change to any stage of a build is caught even when the headline
// score happens not to move.
//
//   node tests/golden.mjs            compare against tests/golden.json
//   node tests/golden.mjs --update   rewrite tests/golden.json (deliberate model changes only)
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadData, evaluate } from '../packages/research/node/common.mjs';
import { buildEloCore } from '../packages/core/src/elo-core.js';
import { buildEloForecast } from '../packages/core/src/elo-forecast.js';
import { buildStateSpace } from '../packages/core/src/state-space/build.js';
import { collectExam } from '../packages/core/src/state-space/exam.js';
import { eloBenchmark } from '../packages/core/src/elo-benchmark.js';
import { forecastPair } from '../packages/core/src/forecast/prepare.js';
import { TUNED_ELO } from '../packages/core/src/presets/tuned-elo.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GOLDEN = fileURLToPath(new URL('./golden.json', import.meta.url));

// Numbers are rounded to 7 significant digits before hashing. The model code is deterministic, but Math.exp/log/pow are not bit-identical across Node/V8
// versions and platforms, and a difference of one unit in the last place grows through the iterated filters to about 1e-12 relative: far below 7 digits, far above
// a bit-exact hash. A change to the model moves outputs by much more than that, so the test still catches every behavioural change.
const round = (_key, v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toPrecision(7) : v);
// Object keys are sorted before hashing: the order in which a builder happens to create a row's fields is not part of the model (arrays and map entries keep theirs).
const sorted = (_key, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, v[k]]),
      )
    : v;
const hash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(value, (k, v) => sorted(k, round(k, v))))
    .digest('hex')
    .slice(0, 32);
const entries = (m) => [...m].map(([k, v]) => [k, v]);
const nested = (m) => entries(m).map(([k, v]) => [k, v instanceof Map ? entries(v) : v]);

// The forecast of every pair among the first ten of the latest grid, read the way the site reads it (with and without a circuit).
function forecasts(model) {
  if (!model.forecastState) return null;
  const grid = model.snaps
    .at(-1)
    .drivers.slice(0, 10)
    .map((d) => d.driverId);
  const circuit = model.circuitList?.[0]?.circuitId ?? '';
  const out = [];
  for (let i = 0; i < grid.length; i++)
    for (let j = i + 1; j < grid.length; j++)
      for (const circuitId of ['', circuit]) {
        const f = forecastPair(model, grid[i], grid[j], { circuitId });
        out.push(f && [f.p, f.pPace, f.qA, f.qB, f.gap, f.edge]);
      }
  return out;
}

function fingerprint(model) {
  return {
    snaps: hash(model.snaps),
    exportRows: hash(model.exportRows),
    driverHistory: hash(entries(model.dh)),
    carHistory: hash(entries(model.ch)),
    counters: [model.recoveredSnapshots, model.totalRetirements, model.qualWeekends],
    form: model.forecastState ? hash(model.forecastState.form) : null,
    ss: model.ss ? hash({ latest: model.ss.latest, slopes: model.ss.slopes, scenario: model.ss.scenario }) : null,
    // everything below was added before the migration of the state-space model off the Elo core (it was unguarded)
    params: hash(model.params),
    names: hash([entries(model.dname), entries(model.cname), model.circuitList]),
    tracks: hash({ aff: nested(model.affFinal ?? new Map()), wet: entries(model.wetFinal ?? new Map()) }),
    forecastState: model.forecastState
      ? hash({
          seen: entries(model.forecastState.seen),
          nationalities: entries(model.forecastState.nationalities),
          countries: entries(model.forecastState.countries),
        })
      : null,
    forecasts: hash(forecasts(model)),
  };
}

// The exam the state-space filters read: per weekend the entrants, the race and qualifying observations with their weights, the
// pre-weekend hazards and the observation stream the forecast layer replays. Nothing here depends on a rating.
function examFingerprint(weekends) {
  return hash(
    weekends.map((w) => ({
      info: w.info,
      rows: w.rows,
      raceObs: w.raceObs.map(({ pElo: _p, ...o }) => o),
      qualObs: w.qualObs.map(({ pElo: _p, ...o }) => o),
      preQ: { rel: entries(w.preQ.rel), inc: entries(w.preQ.inc) },
      raceSeen: entries(w.raceSeen),
      rawRows: w.rawRows,
      qrows: w.qrows,
      replay: w.replayObs.map((r) => [r.session, r.ob.x.driverId, r.ob.y.driverId, r.ob.obs, r.ob.source, r.weight]),
    })),
  );
}

async function main() {
  const ctx = await loadData(`${ROOT}data`);
  const args = [ctx.raw, ctx.lapSnapshots, ctx.maps];
  const out = {};
  out['elo-core'] = fingerprint(buildEloCore(...args, { ...TUNED_ELO }, ctx.lapPace));
  out['elo-full'] = fingerprint(buildEloForecast(...args, {}, ctx.lapPace));
  out['state-space-full'] = fingerprint(buildStateSpace(...args, {}, ctx.lapPace, { benchmark: eloBenchmark }));
  out['state-space-plain'] = fingerprint(buildStateSpace(...args, {}, ctx.lapPace));
  out['state-space-exam'] = examFingerprint(collectExam(...args, {}, ctx.lapPace).weekends);
  out['elo-score-2008-2011'] = +evaluate(TUNED_ELO, ctx, { fromYear: 2008, toYear: 2011, burnIn: 20, objective: 'full' }).score.toPrecision(
    7,
  );

  if (process.argv.includes('--update')) {
    await writeFile(GOLDEN, `${JSON.stringify(out, null, 2)}\n`);
    console.log('golden.json updated');
    return;
  }
  const want = JSON.parse(await readFile(GOLDEN, 'utf8'));
  let bad = 0;
  for (const key of Object.keys(want)) {
    const same = JSON.stringify(want[key]) === JSON.stringify(out[key]);
    console.log(`${same ? 'PASS' : 'FAIL'} golden ${key}`);
    if (!same) {
      bad++;
      console.log('  want', JSON.stringify(want[key]));
      console.log('  got ', JSON.stringify(out[key]));
    }
  }
  if (bad) process.exit(1);
}
await main();
