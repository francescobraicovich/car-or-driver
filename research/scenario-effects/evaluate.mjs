// Retrospective, paired, chronological test of optional scenario adjustments.
// Run: node research/scenario-effects/evaluate.mjs [report.json]
import { writeFile } from 'node:fs/promises';
import { loadData } from '../../packages/research/node/common.mjs';
import { collectExam } from '../../packages/core/src/state-space/exam.js';
import { runPublishedRatings } from '../../packages/core/src/state-space/build.js';
import { scenarioEffects } from '../../packages/core/src/state-space/scenario-effects.js';
import { clusterBootstrap } from '../../packages/eval/src/stats.js';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';

const data = await loadData();
const { model, weekends } = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
const race = runPublishedRatings(weekends, model.params.tmBoost).race;
function score(options) {
  const races = new Map();
  scenarioEffects(weekends, race, model.snaps, {
    ...options,
    observe: ({ weekend, observation, wetRace, probability }) => {
      if (observation.src !== 'finish' || weekend.year < 2008 || weekend.year > 2025) return;
      const raceId = String(weekend.info.raceId);
      const row = races.get(raceId) ?? { raceId, year: weekend.year, wet: wetRace, weight: 0, loss: 0, brier: 0, count: 0 };
      const { o, w } = observation;
      row.weight += w;
      row.loss += w * -Math.log(o ? probability : 1 - probability);
      row.brier += w * (probability - o) ** 2;
      row.count++;
      races.set(raceId, row);
    },
  });
  return races;
}
const baseline = score({ circuitRate: 0, wetRate: 0 });
const candidates = { circuit: score({ circuitRate: 5, wetRate: 0 }), circuitAndWet: score({ circuitRate: 5, wetRate: 4 }) };
const samples = {
  '2008-2011': (row) => row.year <= 2011,
  '2012-2015': (row) => row.year >= 2012 && row.year <= 2015,
  '2016-2020': (row) => row.year >= 2016 && row.year <= 2020,
  '2021-2025': (row) => row.year >= 2021,
  '2008-2025': () => true,
  '2008-2025-wet': (row) => row.wet,
  '2021-2025-wet': (row) => row.year >= 2021 && row.wet,
};
const reports = {};
for (const [name, candidate] of Object.entries(candidates)) {
  reports[name] = {};
  for (const [period, select] of Object.entries(samples)) {
    const rows = [...baseline.values()].filter(select).map((row) => ({ ...row, candidate: candidate.get(row.raceId) }));
    if (rows.some((row) => !row.candidate || row.weight !== row.candidate.weight || row.count !== row.candidate.count))
      throw Error('Scenario comparison observations differ');
    const total = (pick) => rows.reduce((sum, row) => sum + pick(row), 0);
    const weight = total((row) => row.weight);
    const difference = clusterBootstrap(
      rows,
      (row) => row.raceId,
      (draw) => draw.reduce((sum, row) => sum + row.candidate.loss - row.loss, 0) / draw.reduce((sum, row) => sum + row.weight, 0),
      { B: 3000 },
    );
    reports[name][period] = {
      races: rows.length,
      pairs: total((row) => row.count),
      baselineLoss: total((row) => row.loss) / weight,
      candidateLoss: total((row) => row.candidate.loss) / weight,
      baselineBrier: total((row) => row.brier) / weight,
      candidateBrier: total((row) => row.candidate.brier) / weight,
      difference,
    };
  }
}
const output = {
  modelSource: await modelSourceHash(),
  methodology: 'Retrospective pre-weekend finishing-order pairs, weighted; 95% paired intervals resample races.',
  limitations: 'Historical periods informed development; wet labels cover 2000-2025, and 2026 is not evaluated.',
  reports,
};
const json = `${JSON.stringify(output, null, 2)}\n`;
if (process.argv[2]) await writeFile(process.argv[2], json);
else process.stdout.write(json);
