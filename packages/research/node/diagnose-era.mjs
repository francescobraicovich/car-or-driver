// Is the race rating a weaker predictor of race duels in later seasons, for everyone? Per-season weights of the race gap and the qualifying gap
// in teammate duels with ratings frozen at 10-weekend block starts (stayers), the strict reading. Output: research/eval/diagnosis-era.txt
import { loadData } from './common.mjs';
import { indexTimeline, stateSpaceRun } from '../../eval/src/index.js';
import { prepareReal } from '../../eval/src/pipeline.js';
import { merge } from './separation-report.mjs';
import { FINAL } from './strict-eval.mjs';
import { scorePoint } from './cross-session.mjs';
import { duelRecords, logit, wloss } from './diagnostics-library.mjs';

const data = await loadData(new URL('../../../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: true });
const timeline = prep.timeline;
const env = { idx: indexTimeline(timeline, prep.ctx), timeline, prep };
const base = merge({});
const qualRun = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
const { runs } = scorePoint(prep, timeline, qualRun, { ...base.race, ...FINAL.race }, FINAL.beta, 5, FINAL.gamma);
const { stayers } = duelRecords(
  env,
  runs.race,
  qualRun,
  10,
  () => undefined,
  () => undefined,
);
const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
console.log(
  '# Teammate duels (stayers, ratings frozen at 10-weekend blocks). Per period: loss of the race gap alone, the qualifying gap alone, both; and the weights (race, qualifying) when both are used',
);
console.log('period      duels  coin    race-gap-only  qual-gap-only  both     weights race/qual (se)');
const periods = [
  [2002, 2005],
  [2006, 2009],
  [2010, 2013],
  [2014, 2017],
  [2018, 2023],
];
for (const [a, b] of periods) {
  const rs = stateSpaceRows(a, b);
  if (rs.length < 200) continue;
  const m1 = logit(rs, [(r) => r.z], { cluster: (r) => r.cluster });
  const m2 = logit(rs, [(r) => r.zq], { cluster: (r) => r.cluster, init: [0.8] });
  const m3 = logit(rs, [(r) => r.z, (r) => r.zq], { cluster: (r) => r.cluster, init: [0.5, 0.3] });
  console.log(
    `${a}-${b}  ${String(rs.length).padStart(5)}  0.6931  ${f(
      wloss(rs, (r) => m1.b[0] * r.z),
      4,
    )}         ${f(
      wloss(rs, (r) => m2.b[0] * r.zq),
      4,
    )}        ${f(
      wloss(rs, (r) => m3.b[0] * r.z + m3.b[1] * r.zq),
      4,
    )}  ${f(m3.b[0], 2)}/${f(m3.b[1], 2)} (${f(m3.se[0], 2)}/${f(m3.se[1], 2)})`,
  );
}
function stateSpaceRows(a, b) {
  return stayers.filter((r) => r.year >= a && r.year <= b);
}
