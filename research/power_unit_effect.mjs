// Walk-forward check of FIA-reported new power-unit elements. The report must
// predate the relevant session; the effect is fitted in 2024 and checked in 2025.
import { readFileSync } from 'node:fs';
import { csv } from '../packages/core/src/csv.js';
import { stateSpaceRun } from '../packages/eval/src/adapters.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { FINAL, load } from '../packages/research/node/strict-eval.mjs';

const env = await load(2025, true);
const { timeline, prep, base } = env;
const reports = csv(readFileSync(new URL('./power-unit-events.csv', import.meta.url), 'utf8'));
const raceDates = new Map(prep.data.raw.races.map((r) => [String(r.raceId), r.date]));
const qualDates = new Map(prep.data.raw.races.map((r) => [String(r.raceId), r.quali_date]));
const components = new Set(['ICE', 'TC', 'MGU-H', 'MGU-K']);
const exposure = { race: new Map(), qual: new Map() };
for (const report of reports) {
  if (!components.has(report.component)) continue;
  for (const session of ['race', 'qual']) {
    const date = (session === 'race' ? raceDates : qualDates).get(report.raceId);
    if (!date || !(report.published.slice(0, 10) < date)) continue;
    if (!exposure[session].has(report.raceId)) exposure[session].set(report.raceId, new Set());
    exposure[session].get(report.raceId).add(report.driverId);
  }
}

const qual = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
const race = stateSpaceRun(timeline, 'race', { ...prep.ctx, ...qualLink(qual.raw, FINAL.beta, FINAL.gamma) }, { ...base.race, ...FINAL.race });
const runs = { race, qual };
const weightedLoss = (session, year, effect, affectedOnly) => {
  let loss = 0;
  let weight = 0;
  let pairs = 0;
  let affected = 0;
  for (const [i, weekend] of timeline.entries()) {
    if (weekend.year !== year) continue;
    const set = exposure[session].get(weekend.raceId) || new Set();
    for (const [j, ob] of weekend.obs[session].entries()) {
      const delta = Number(set.has(ob.x)) - Number(set.has(ob.y));
      if (affectedOnly && !delta) continue;
      const run = runs[session];
      const variance = run.z[i].vari[j];
      const attenuation = Math.sqrt(1 + (Math.PI / 8) * run.k * run.k * variance);
      const z = run.z[i].adj[j] + (run.k * effect * delta) / attenuation;
      loss += ob.w * Math.log1p(Math.exp(ob.o ? -z : z));
      weight += ob.w;
      pairs++;
      if (delta) affected++;
    }
  }
  return { loss: loss / weight, weight, pairs, affected };
};

for (const session of ['race', 'qual']) {
  const candidates = [-40, -30, -20, -10, 0, 10, 20, 30, 40];
  const fit = candidates.map((points) => ({ points, ...weightedLoss(session, 2024, points, true) }));
  const selected = fit.reduce((best, item) => (item.loss < best.loss ? item : best));
  const check = [0, selected.points].map((points) => ({
    points,
    eventPairs: weightedLoss(session, 2025, points, true),
    allPairs: weightedLoss(session, 2025, points, false),
  }));
  console.log(JSON.stringify({ session, fitted2024: fit, checked2025: check }, null, 2));
}
