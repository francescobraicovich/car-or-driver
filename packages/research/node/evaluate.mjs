// The evaluation harness: backtest the ratings and the forecasts, and test the properties a good car/driver split must have.
//
//   node packages/research/node/evaluate.mjs [options]
//
//   --model state-space|elo|both     which ratings to evaluate (default state-space)
//   --no-link               run the race filter alone (the model before the cross-session link, state-space/qualifying-link.js)
//   --set race.sdC=30       override a state-space setting (repeatable; "race.", "qual." or no prefix for both)
//   --runner file.mjs       evaluate your own model: the file's default export is (timeline, session, ctx) => ratingRun
//   --sessions race,qual    sessions to evaluate (default both)
//   --holdout               include 2016 onward (read once for this work: leave it off while experimenting)
//   --full                  also score the forecast layer (form trackers and probability heads) on these ratings
//   --null N                N synthetic worlds per session as the reference for every diagnostic (default 3, 0 = none)
//   --null-world k=v,...    stress the synthetic world: regMult=2.5, noise=t3, yearD=8, moveSd=10, ...
//   --null-self             draw the synthetic worlds from the settings under test (default: from the SHIPPED settings, so a
//                           candidate cannot certify itself by assuming what it does)
//   --tau both|shipped|auto|x   likelihood weight of the filter in the synthetic worlds: 'shipped' = the filter as evaluated
//                           on real data (null S), 'auto' = tuned to the world (null T), 'both' (default) = both nulls
//   --boot B                bootstrap draws for every interval (default 200)
//   --json out.json         write the full result
//   --label name            name of this run in the output
//   --compare a.json b.json compare two saved results and exit
//   --details               print the detail tables as well as the scorecard
//
// Every interval is a bootstrap over whole seasons. "null" is what the same diagnostic reads on synthetic worlds where
// the filter's assumptions hold, drawn on the real schedule (docs/evaluation.md).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadData } from './common.mjs';
import { STATE_SPACE } from '../../core/src/presets/state-space.js';
import { evaluateModel, eloRun, stateSpaceRun, syntheticStudy } from '../../eval/src/index.js';
import { eloForecastScores, prepareReal, stateSpaceForecastScores } from '../../eval/src/pipeline.js';
import { compare, detailReport, predictiveReport, recoveryReport, scorecard, syntheticReport } from '../../eval/src/report.js';

const argv = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? dflt : argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[i + 1];
};
const flag = (name) => argv.includes(`--${name}`);
const all = (name) => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]] : []));

if (flag('compare')) {
  const i = argv.indexOf('--compare');
  const [a, b] = [argv[i + 1], argv[i + 2]].map((p) => JSON.parse(readFileSync(p, 'utf8')));
  console.log(compare(a.headline, b.headline, { labelA: a.label ?? 'A', labelB: b.label ?? 'B' }));
  process.exit(0);
}

const model = opt('model', 'state-space');
const sessions = String(opt('sessions', 'race,qual')).split(',');
const holdout = flag('holdout');
const full = flag('full');
const nNull = +opt('null', 3);
const boot = { B: +opt('boot', 200) };
const label = opt('label', model);
const num = (v) => (Number.isFinite(+v) ? +v : v);
const parseKV = (text) =>
  Object.fromEntries(
    String(text)
      .split(',')
      .filter(Boolean)
      .map((kv) => kv.split('='))
      .map(([k, v]) => [k, num(v)]),
  );
const overrides = { race: {}, qual: {} };
for (const kv of all('set')) {
  const [k, v] = kv.split('=');
  const [s, name] = k.includes('.') ? k.split('.') : ['both', k];
  for (const sess of s === 'both' ? ['race', 'qual'] : [s]) overrides[sess][name] = +v;
}
const worldOverrides = opt('null-world') ? parseKV(opt('null-world')) : {};
const tau = opt('tau', 'both');
const explicitTau = (s) => Number.isFinite(overrides[s].tau);

const t0 = Date.now();
const data = await loadData('data');
const prep = prepareReal(data, { holdout });
prep.ctx = { ...prep.ctx, linkShipped: !flag('no-link') }; // the shipped model: the race filter reads the qualifying filter (state-space/qualifying-link.js); --set race.x=... overrides settings
console.error(
  `loaded ${prep.timeline.length} weekends (${prep.timeline[0].year}-${prep.timeline.at(-1).year})${holdout ? ' INCLUDING the 2016+ holdout' : ', holdout excluded'}`,
);

const models = model === 'both' ? ['state-space', 'elo'] : [model];
const results = {};
// Elo ratings are read first: the state-space forecast layer overwrites the core's snapshots
let eloForecast = null;
const runsBy = {};
if (models.includes('elo')) {
  const snaps = prep.elo.snaps.slice(0, prep.n);
  runsBy.elo = Object.fromEntries(sessions.map((s) => [s, eloRun(prep.timeline, prep.weekends.slice(0, prep.n), snaps, s)]));
  if (full) eloForecast = eloForecastScores(prep, { holdout });
}
if (models.includes('state-space')) {
  runsBy['state-space'] = Object.fromEntries(sessions.map((s) => [s, stateSpaceRun(prep.timeline, s, prep.ctx, overrides[s])]));
}
if (opt('runner')) {
  const mod = await import(pathToFileURL(String(opt('runner'))).href);
  runsBy.custom = Object.fromEntries(await Promise.all(sessions.map(async (s) => [s, await mod.default(prep.timeline, s, prep.ctx)])));
  models.push('custom');
}

for (const name of models) {
  const t1 = Date.now();
  const res = evaluateModel(prep.timeline, prep.identity, runsBy[name], { boot });
  res.label = models.length > 1 ? name : label;
  res.model = name;
  res.settings = name === 'state-space' ? Object.fromEntries(sessions.map((s) => [s, { ...STATE_SPACE[s], ...overrides[s] }])) : null;
  res.holdout = holdout;
  if (full && name === 'state-space' && runsBy['state-space'].race && runsBy['state-space'].qual) {
    res.forecast = stateSpaceForecastScores(prep, runsBy['state-space'], { holdout });
    for (const [win, v] of Object.entries(res.forecast))
      for (const k of ['raceDay', 'thursday', 'qual']) res.headline[`forecast.state-space.${k}.${win}`] = { est: v[k] };
  }
  if (full && name === 'elo' && eloForecast) {
    res.forecast = eloForecast;
    for (const [win, v] of Object.entries(eloForecast))
      for (const k of ['raceDay', 'thursday', 'qual']) res.headline[`forecast.elo.${k}.${win}`] = { est: v[k] };
  }
  if (name === 'state-space' && nNull > 0) {
    res.synthetic = {};
    for (const s of sessions) {
      res.synthetic[s] = {};
      // the same filter as evaluated ('same') and the filter tuned to the world ('tuned'); a `tau` set by hand is the filter as evaluated
      for (const mode of explicitTau(s) || tau === 'shipped' ? ['shipped'] : tau === 'both' ? ['shipped', 'auto'] : [tau]) {
        const study = syntheticStudy(prep.timeline, prep.ctx, {
          session: s,
          hyper: overrides[s],
          self: flag('null-self'),
          seeds: Array.from({ length: nNull }, (_, i) => i + 1),
          world: worldOverrides,
          tau: mode === 'auto' || mode === 'shipped' ? mode : +mode,
          boot: { B: Math.min(boot.B, 80) },
        });
        const key = study.tauMode === 'auto' ? 'tuned' : 'same';
        res.synthetic[s][key] = {
          world: study.world,
          tau: study.tau,
          tauMode: study.tauMode,
          tuning: study.tuning,
          seeds: study.seeds,
          summary: study.summary,
        };
        console.error(`synthetic ${s} (${key}): ${nNull} worlds, tau ${study.tau}`);
      }
    }
  }
  results[name] = res;
  console.error(`${name}: evaluated in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  const nulls = { same: {}, tuned: {} };
  for (const s of Object.keys(res.synthetic ?? {}))
    for (const [key, study] of Object.entries(res.synthetic[s])) Object.assign(nulls[key], study.summary);
  console.log(
    `\n=== ${res.label}: ${res.counts.weekends} weekends, ${res.counts.moves} movers, ${res.counts.lineupChanges} lineup changes with a new established driver, ${res.counts.rookies} rookies ===`,
  );
  console.log(`\n# Predictive (ratings alone, exam weights)\n${predictiveReport(res.predictive)}`);
  if (res.forecast) {
    console.log('\n# Forecast layer (log-loss; heads trained on earlier years)');
    for (const v of Object.values(res.forecast))
      console.log(
        `  ${v.label}: race-day ${v.raceDay.toFixed(4)}  Thursday ${v.thursday.toFixed(4)}  qualifying head ${v.qual.toFixed(4)}   (race Brier ${v.raceBrier.toFixed(4)}, accuracy ${(100 * v.raceAcc).toFixed(1)}%; qualifying Brier ${v.qualBrier.toFixed(4)}, accuracy ${(100 * v.qualAcc).toFixed(1)}%)`,
      );
  }
  console.log('\n# Scorecard (value [95% CI over seasons]; null = the same diagnostic on synthetic worlds)');
  console.log(scorecard(res.headline, nulls));
  console.log(recoveryReport(nulls));
  for (const s of Object.keys(res.synthetic ?? {}))
    for (const [key, study] of Object.entries(res.synthetic[s]))
      console.log(
        `\n${syntheticReport({ ...study, session: s, label: key === 'same' ? 'same filter as evaluated' : 'filter tuned to the world' })}`,
      );
  if (flag('details')) console.log(detailReport(res.sessions));
}

if (models.length === 2) {
  console.log('\n# state-space vs elo (headline metrics)');
  console.log(compare(results['state-space'].headline, results.elo.headline, { labelA: 'state-space', labelB: 'elo' }));
}
const jsonPath = opt('json');
if (jsonPath && jsonPath !== true) {
  const out = models.length === 1 ? results[models[0]] : results;
  writeFileSync(
    jsonPath,
    JSON.stringify(out, (k, v) => (v instanceof Float64Array ? undefined : v)),
  );
  console.error(`wrote ${jsonPath}`);
}
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
