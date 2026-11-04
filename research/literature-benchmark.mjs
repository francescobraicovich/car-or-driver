// Compare published metrics using the production model and a documented teammate Elo baseline.
// Usage: node research/literature-benchmark.mjs [output.json]
import { writeFile } from 'node:fs/promises';
import { loadData } from '../packages/research/node/common.mjs';
import { truncateDataset } from '../packages/core/src/dataset.js';
import { parseQualTime } from '../packages/core/src/qualifying.js';
import { isFinishStatusName } from '../packages/core/src/status.js';
import { collectExam } from '../packages/core/src/state-space/exam.js';
import { runPublishedRatings } from '../packages/core/src/state-space/build.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { STATE_SPACE } from '../packages/core/src/presets/state-space.js';
import { modelSourceHash } from '../tools/model-source-hash.mjs';
import { eloUpdate, pairedAccuracyInterval, probability, rankingLogProbability, scorePairs, seededRandom, simulateRanking } from './literature-metrics.mjs';

export const benchmarkRatings = runPublishedRatings;

async function main() {
const data = truncateDataset(await loadData(), 2024);
const exam = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
const { race: hybrid, qual: qualifying } = benchmarkRatings(exam.weekends, exam.model.params.tmBoost);
const names = new Map(data.raw.drivers.map((row) => [String(row.driverId), `${row.forename} ${row.surname}`]));
const elo = { race: new Map(), qualifying: new Map() };
const lastHybrid = { race: new Map(), qualifying: new Map() };
const paired = [];
const ranking = [];
const distributions = new Map();
const random = seededRandom(20261029);
const draws = 2000;

function teammatePairs(rows, value) {
  const teams = new Map();
  for (const row of rows) {
    const key = String(row.constructorId);
    if (!teams.has(key)) teams.set(key, []);
    teams.get(key).push(row);
  }
  const pairs = [];
  for (const team of teams.values()) {
    if (team.length !== 2) continue;
    const [a, b] = team;
    const va = value(a);
    const vb = value(b);
    if (!Number.isFinite(va) || !Number.isFinite(vb) || va === vb) continue;
    pairs.push({ first: String(a.driverId), second: String(b.driverId), outcome: Number(va < vb) });
  }
  return pairs;
}

const bestTime = (row) => {
  const times = ['q1', 'q2', 'q3'].map((key) => parseQualTime(row[key])).filter((value) => Number.isFinite(value) && value > 0);
  return times.length ? Math.min(...times) : NaN;
};

for (const [index, weekend] of exam.weekends.entries()) {
  if (weekend.year < 2014 || weekend.year > 2024) continue;
  const classified = teammatePairs(weekend.rawRows, (row) => isFinishStatusName(row.statusName) ? Number(row.positionOrder) : NaN);
  const leadLap = teammatePairs(weekend.rawRows, (row) => {
    const ms = Number(row.milliseconds);
    return row.statusName === 'Finished' && Number.isFinite(ms) && ms > 0 ? ms : NaN;
  });
  const qualifyingPairs = teammatePairs(weekend.qrows, bestTime);
  const sessions = [
    { name: 'race', train: classified, test: leadLap, pre: hybrid.pre[index].rated, scale: STATE_SPACE.race.s },
    { name: 'qualifying', train: qualifyingPairs, test: qualifyingPairs, pre: qualifying.pre[index].rated, scale: STATE_SPACE.qual.s },
  ];
  for (const session of sessions) {
    for (const pair of session.test) {
      const first = session.pre.get(pair.first);
      const second = session.pre.get(pair.second);
      if (!Number.isFinite(first) || !Number.isFinite(second)) throw Error(`Missing rating for ${weekend.info.raceId}`);
      const ea = elo[session.name].get(pair.first) ?? 1500;
      const eb = elo[session.name].get(pair.second) ?? 1500;
      const frozenA = lastHybrid[session.name].get(pair.first) ?? 0;
      const frozenB = lastHybrid[session.name].get(pair.second) ?? 0;
      paired.push({
        year: weekend.year, raceId: weekend.info.raceId, session: session.name, ...pair,
        hybrid: probability(first - second, session.scale),
        elo: probability(ea - eb, 400),
        ...(weekend.year === 2023 ? { frozenHybrid: probability(frozenA - frozenB, session.scale),
          frozenHybridMissing: Number(!lastHybrid[session.name].has(pair.first)) + Number(!lastHybrid[session.name].has(pair.second)) } : {}),
      });
    }
    // Keep the 2022 snapshot for the entire 2023 holdout; Elo is stored separately below.
    if (weekend.year < 2023) {
      const post = session.name === 'race' ? hybrid.ratings[index] : qualifying.ratings[index];
      for (const [id, value] of post.drivers) if (value.seen) lastHybrid[session.name].set(id, value.m);
    }
  }
  if (weekend.year === 2023 && !elo.frozen) elo.frozen = { race: new Map(elo.race), qualifying: new Map(elo.qualifying) };
  if (weekend.year === 2023) {
    for (const row of paired.filter((row) => row.raceId === weekend.info.raceId && row.year === 2023)) {
      const frozen = elo.frozen[row.session];
      row.frozenElo = probability((frozen.get(row.first) ?? 1500) - (frozen.get(row.second) ?? 1500), 400);
    }
  }
  for (const session of sessions) for (const pair of session.train) eloUpdate(elo[session.name], pair.first, pair.second, pair.outcome);

  if (weekend.year < 2014 || weekend.year > 2021) continue;
  const finishers = weekend.rawRows.filter((row) => isFinishStatusName(row.statusName))
    .sort((a, b) => Number(a.positionOrder) - Number(b.positionOrder));
  const strengths = finishers.map((row) => hybrid.pre[index].rated.get(String(row.driverId)) + hybrid.pre[index].cars.get(String(row.constructorId)));
  const logProbability = rankingLogProbability(strengths, STATE_SPACE.race.s);
  ranking.push({ year: weekend.year, raceId: weekend.info.raceId, entrants: finishers.length, logProbability });
  if (![2015, 2019, 2021].includes(weekend.year)) continue;
  const frequencies = finishers.map(() => Array(finishers.length).fill(0));
  for (let draw = 0; draw < draws; draw++) {
    const order = simulateRanking(strengths, STATE_SPACE.race.s, random);
    for (const [position, entry] of order.entries()) frequencies[entry][position]++;
  }
  for (const [observedRank, row] of finishers.entries()) {
    const id = String(row.driverId);
    const key = `${weekend.year}|${id}`;
    if (!distributions.has(key)) distributions.set(key, { year: weekend.year, driverId: id, name: names.get(id), races: 0, observed: [], expected: [] });
    const item = distributions.get(key);
    item.races++;
    for (let rank = 0; rank < frequencies[observedRank].length; rank++) {
      item.observed[rank] ??= 0;
      item.expected[rank] ??= 0;
      item.expected[rank] += frequencies[observedRank][rank] / draws;
    }
    item.observed[observedRank]++;
  }
}

const pairSummary = (session, year, model) => {
  const rows = paired.filter((row) => row.session === session && row.year === year);
  return { ...scorePairs(rows.map((row) => ({ probability: row[model], outcome: row.outcome }))),
    missingFrozenHybridRatings: model === 'frozenHybrid' ? rows.reduce((sum, row) => sum + row.frozenHybridMissing, 0) : undefined };
};
const output = {
  modelSource: await modelSourceHash(),
  teammate2023: Object.fromEntries(['race', 'qualifying'].map((session) => [session,
    Object.fromEntries(['hybrid', 'elo', 'frozenHybrid', 'frozenElo'].map((model) => [model, pairSummary(session, 2023, model)]))])),
  accuracyDifferenceIntervals2023: Object.fromEntries(['race', 'qualifying'].map((session) => {
    const rows = paired.filter((row) => row.session === session && row.year === 2023);
    return [session, { rolling: pairedAccuracyInterval(rows, 'hybrid', 'elo'),
      frozen: pairedAccuracyInterval(rows, 'frozenHybrid', 'frozenElo') }];
  })),
  ranking2014to2021: { races: ranking.length, entrants: ranking.reduce((sum, item) => sum + item.entrants, 0),
    totalLogProbability: ranking.reduce((sum, item) => sum + item.logProbability, 0),
    meanLogProbability: ranking.reduce((sum, item) => sum + item.logProbability, 0) / ranking.length },
  distributionDrawsPerRace: draws,
  distributions: [...distributions.values()],
  paired2023: paired.filter((row) => row.year === 2023),
  ranking,
};
const json = `${JSON.stringify(output, null, 2)}\n`;
if (process.argv[2]) await writeFile(process.argv[2], json);
else process.stdout.write(json);

}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
