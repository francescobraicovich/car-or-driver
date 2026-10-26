// Training rows for the forecast heads on the state-space ratings: one row per observation, with the form,
// grid, qualifying and context columns of the Elo path and the rating inputs (baseline*, race_driver/car,
// qual_driver/car) from the state-space levels as forecast before each weekend. Written to
// research/state-space/pairs.jsonl; nothing under research/ else is touched.
//
// It also runs the Elo feature path beside the new one and fails unless every column other than the six rating
// inputs is identical, row for row: that catches any alignment slip between the two pipelines. The Elo heads'
// predictions are exported too (elo_post, elo_pre, elo_qual), so the new heads are compared on exactly the same
// observations.
import { mkdir, writeFile } from 'node:fs/promises';
import { loadData } from './common.mjs';
import { runSession } from '../../core/src/state-space/build.js';
import { carIdentity } from '../../core/src/lineage.js';
import { hybridRatings } from '../../core/src/hybrid/ratings.js';
import { collectExamWithElo } from '../../core/src/elo-benchmark.js';
import { replayForecastLayer } from '../../core/src/state-space/replay.js';
import { FormFeatures } from '../../core/src/forecast/form.js';
import { ELO_HEADS } from '../../core/src/elo-forecast-heads.js';
import { scoreHead, selectHeads } from '../../core/src/forecast/inference.js';

const RATING_COLUMNS = new Set(['baseline', 'baseline_pre', 'race_driver', 'race_car', 'qual_driver', 'qual_car']);

// --through YEAR: leave out every weekend after YEAR (the filters are forward-only, so nothing before it changes); the hill climb exports
// through 2015 so that the holdout years never enter a file
const through = process.argv.includes('--through') ? +process.argv[process.argv.indexOf('--through') + 1] : Infinity;
const ctx = await loadData();
const exam = collectExamWithElo(ctx.raw, ctx.lapSnapshots, ctx.maps, { modelKind: 'state-space' }, ctx.lapPace);
const { model } = exam;
const weekends = exam.weekends.filter((w) => w.year <= through);
const tmBoost = model.params.tmBoost;
const qual = runSession(weekends, 'qual', tmBoost);
const race = runSession(weekends, 'race', tmBoost, qual);
const hybrid = hybridRatings(weekends, model.snaps.slice(0, weekends.length), race, qual, carIdentity);

// Elo path: the form trackers on Elo ratings and the Elo heads
const old = [];
{
  const form = new FormFeatures(ctx.lapPace);
  weekends.forEach((wk) => {
    form.beforeWeekend({
      info: wk.info,
      rows: wk.rawRows,
      qrows: wk.qrows,
      raceSeen: wk.raceSeen,
      D: wk.eloD,
      C: wk.eloC,
      QD: wk.eloQD,
      QC: wk.eloQC,
    });
    const heads = selectHeads(ELO_HEADS, wk.info.year);
    for (const { ob, session, weight, p, pPre } of wk.replayObs) {
      const f = form.features(ob.x, ob.y, session, p, pPre);
      const pred = heads
        ? session === 'qual'
          ? scoreHead(heads.qual, f)
          : { post: scoreHead(heads.post, f), pre: scoreHead(heads.pre, f) }
        : null;
      old.push({ f, p, pPre, weight, pred });
    }
    form.afterWeekend({ info: wk.info, rows: wk.rawRows });
  });
}

const out = [];
let seq = 0;
replayForecastLayer(
  weekends,
  { race: hybrid.pre, qual: qual.pre },
  {
    lapPace: ctx.lapPace,
    params: model.params,
    heads: null,
    onRow: ({ info, weekend, session, ob, weight, base, features }) => {
      const o = old[seq++];
      if (o.weight !== weight) throw Error(`observation streams diverged at row ${seq}`);
      for (const name of Object.keys(features)) {
        if (RATING_COLUMNS.has(name)) continue;
        if (features[name] !== o.f[name]) throw Error(`column ${name} differs at row ${seq}: ${features[name]} vs ${o.f[name]}`);
      }
      if (weekend < 20) return;
      out.push({
        raceId: info.raceId,
        year: info.year,
        round: info.round,
        weekend,
        session,
        source: ob.source || 'qual',
        a: ob.x.driverId,
        b: ob.y.driverId,
        y: ob.obs,
        w: weight,
        p: base,
        p_pre: base,
        p_elo: o.p,
        p_pre_elo: o.pPre,
        elo_post: o.pred ? (session === 'qual' ? null : o.pred.post) : null,
        elo_pre: o.pred ? (session === 'qual' ? null : o.pred.pre) : null,
        elo_qual: o.pred && session === 'qual' ? o.pred : null,
        ...features,
      });
    },
  },
);
if (seq !== old.length) throw Error(`row counts differ: ${seq} vs ${old.length}`);
await mkdir('research/state-space', { recursive: true });
await writeFile('research/state-space/pairs.jsonl', out.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`Exported ${out.length} rows from ${weekends.length} weekends; non-rating columns identical to the Elo feature path.`);
