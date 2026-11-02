// Compare pre-weekend production hybrid strengths with Rane's 2014–2024 ranking exam.
// Usage: node research/benchmarks/rane-benchmark.mjs [output.json]
import { writeFile } from 'node:fs/promises';
import { loadData } from '../../packages/research/node/common.mjs';
import { truncateDataset } from '../../packages/core/src/dataset.js';
import { isFinishStatusName } from '../../packages/core/src/status.js';
import { collectExam } from '../../packages/core/src/state-space/exam.js';
import { carLineage, runSession } from '../../packages/core/src/state-space/build.js';
import { hybridRatings } from '../../packages/core/src/hybrid/ratings.js';
import { aggregateRaces, scoreRace } from './rane-benchmark-metrics.mjs';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';

const data = truncateDataset(await loadData(), 2024);
const exam = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
const qualifying = runSession(exam.weekends, 'qual', exam.model.params.tmBoost);
const race = runSession(exam.weekends, 'race', exam.model.params.tmBoost, qualifying);
const hybrid = hybridRatings(exam.weekends, exam.model.snaps, race, qualifying, carLineage);
const results = [];

for (const [index, weekend] of exam.weekends.entries()) {
  if (weekend.year < 2014 || weekend.year > 2024) continue;
  const levels = hybrid.pre[index];
  const participants = weekend.rawRows.map((row) => {
    const driver = levels.rated.get(String(row.driverId));
    const car = levels.cars.get(String(row.constructorId));
    if (!Number.isFinite(driver) || !Number.isFinite(car))
      throw Error(`Missing pre-weekend rating for race ${weekend.info.raceId}, driver ${row.driverId}`);
    return { strength: driver + car, position: Number(row.positionOrder), finished: isFinishStatusName(row.statusName) };
  });
  const finishers = participants.filter((participant) => participant.finished);
  results.push({
    raceId: weekend.info.raceId,
    year: weekend.year,
    round: weekend.info.round,
    name: weekend.info.name,
    excluded: participants.length - finishers.length,
    finishers: scoreRace(finishers),
    allEntrants: scoreRace(participants),
  });
}

const output = {
  paper: 'https://arxiv.org/abs/2508.00200',
  period: '2014–2024',
  modelSource: await modelSourceHash(),
  method: 'Production hybrid portable pre-weekend driver rating plus pre-weekend car rating; finishers include Finished and +N Lap(s).',
  caveat:
    'Finisher and ranking conventions, entrant eligibility, historical data and MAE aggregation may differ from the paper; its per-race predictions were not available.',
  finishers: aggregateRaces(results.map((result) => result.finishers)),
  allEntrants: aggregateRaces(results.map((result) => result.allEntrants)),
  seasons: Array.from({ length: 11 }, (_, index) => {
    const year = 2014 + index;
    const selected = results.filter((result) => result.year === year);
    return { year, finishers: aggregateRaces(selected.map((result) => result.finishers)) };
  }),
  races: results,
};
const json = `${JSON.stringify(output, null, 2)}\n`;
if (process.argv[2]) await writeFile(process.argv[2], json);
else process.stdout.write(json);
