import { fitSlope, observationRows } from '../packages/eval/src/index.js';
import { strictItems, strictStayers } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { buildHybridRatings } from './hybrid_rating_model.mjs';
import { componentExposure, discriminativeRanking, teammateNetwork } from './alternative_rating_models.mjs';
import { teammatePaceGraph } from './teammate_pace_graph.mjs';

const env = await load(2025, true);
const { timeline, prep, base, idx, moves } = env;
const { hybrid, ranking } = buildHybridRatings(timeline, prep, base);
const exposure = componentExposure(timeline, prep.data.raw.races);
const network = teammateNetwork(timeline, 'race', prep.ctx.carOf, exposure, { includeComponent: false });
const qualifyingRanking = discriminativeRanking(timeline, 'qual', prep.ctx.carOf, exposure,
  { includeComponent: false, learningRate: 180, teammateWeight: 2, levelPenalty: 0.001, carWinterRetention: 0.8 });
const pace = teammatePaceGraph(timeline, prep.data, hybrid, prep.ctx.carOf,
  { qualifyingWeight: 1, racePaceWeight: 0, outcomeWeight: 0, memoryYears: 5, fade: 0.8, ridge: 2 });
const names = new Map(prep.data.raw.drivers.map((row) => [String(row.driverId), `${row.forename} ${row.surname}`]));
const inspect = (run) => {
  const stayers = strictStayers(idx, run, 5);
  const slope = fitSlope(stayers);
  const items = strictItems(idx, run, moves, 5).filter((row) => row.kind === 'tm');
  const byMove = new Map();
  for (const row of items) {
    const key = `${row.driverId}:${row.t0}`;
    if (!byMove.has(key)) byMove.set(key, []);
    byMove.get(key).push(row);
  }
  return moves.filter((move) => move.valid).map((move) => {
    const rows = byMove.get(`${move.driverId}:${move.t0}`) ?? [];
    let weight = 0;
    let wins = 0;
    let loss = 0;
    for (const row of rows) {
      weight += row.w;
      wins += row.w * row.o;
      const x = slope * row.z * (row.o ? -1 : 1);
      loss += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    }
    return { year: move.year, mover: names.get(move.driverId), firstRace: timeline[move.t0].name,
      n: rows.length, result: wins / weight, predicted: rows.length ? 1 / (1 + Math.exp(-slope * rows[0].z)) : null,
      loss: loss / weight };
  }).filter((row) => row.n);
};
const hybridRows = inspect(hybrid);
const rankRows = inspect(ranking);
const networkRows = inspect(network);
const qualifyingRankingRows = inspect(qualifyingRanking);
const paceRows = inspect(pace);
console.log(JSON.stringify(hybridRows.map((row, i) => ({ ...row, ranking: rankRows[i],
  network: networkRows[i], qualifyingRanking: qualifyingRankingRows[i], pace: paceRows[i] })), null, 2));
