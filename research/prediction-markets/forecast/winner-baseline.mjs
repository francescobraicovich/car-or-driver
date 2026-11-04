// Retrospective pace-only winner scores. See README.md for provenance limitations.
import { loadData } from '../../../packages/research/node/common.mjs';
import { buildStateSpace } from '../../../packages/core/src/state-space/build.js';
import { pathToFileURL } from 'node:url';

const slope = Math.LN10 / 75;

export function parseUtcTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw new Error('Timestamp must be an ISO UTC time ending in Z');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== value.slice(0, 19)) throw new Error('Invalid UTC timestamp');
  return time;
}

export function precedingDataset(context, firstPracticeDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstPracticeDate)) throw new Error('Invalid first-practice date');
  const completed = new Set(context.raw.results.map((row) => String(row.raceId)));
  const races = context.raw.races.filter((race) => race.date < firstPracticeDate && completed.has(String(race.raceId)));
  races.sort((a, b) => a.date.localeCompare(b.date) || Number(a.round) - Number(b.round));
  if (!races.length) throw new Error('No earlier completed race');
  const keep = new Set(races.map((race) => String(race.raceId)));
  const results = context.raw.results.filter((row) => keep.has(String(row.raceId)));
  const qualifying = context.raw.qualifying.filter((row) => keep.has(String(row.raceId)));
  const driverIds = new Set(results.map((row) => String(row.driverId)));
  const constructorIds = new Set(results.map((row) => String(row.constructorId)));
  const circuitIds = new Set(races.map((race) => String(race.circuitId)));
  return {
    previousRace: races.at(-1),
    raw: {
      ...context.raw,
      races,
      results,
      qualifying,
      drivers: context.raw.drivers.filter((row) => driverIds.has(String(row.driverId))),
      constructors: context.raw.constructors.filter((row) => constructorIds.has(String(row.constructorId))),
      circuits: context.raw.circuits.filter((row) => circuitIds.has(String(row.circuitId))),
    },
    maps: context.maps,
    lapSnapshots: new Map([...context.lapSnapshots].filter(([key]) => keep.has(String(key).split('|')[0]))),
    lapPace: context.lapPace ? new Map([...context.lapPace].filter(([key]) => keep.has(String(key)))) : null,
  };
}

export function winnerScores(snapshot, previousResults) {
  if (!snapshot || !Array.isArray(previousResults) || !previousResults.length) throw new Error('Previous race and ratings are required');
  const driverRatings = new Map(snapshot.drivers.map((driver) => [String(driver.driverId), driver.combined]));
  const carRatings = new Map(snapshot.cars.map((car) => [String(car.constructorId), car.combined]));
  const seen = new Set();
  const entries = previousResults.map((row) => {
    const driverId = String(row.driverId);
    const constructorId = String(row.constructorId);
    if (seen.has(driverId)) throw new Error('Duplicate driver in previous roster');
    seen.add(driverId);
    const driver = driverRatings.get(driverId);
    const car = carRatings.get(constructorId);
    if (!Number.isFinite(driver) || !Number.isFinite(car)) throw new Error(`Missing rating for roster entry ${driverId}`);
    return { driverId, constructorId, strength: driver + car };
  });
  const maximum = Math.max(...entries.map((entry) => slope * entry.strength));
  const weights = entries.map((entry) => Math.exp(slope * entry.strength - maximum));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return entries.map((entry, index) => ({ ...entry, probability: weights[index] / total }));
}

export function scoreWinner(entries, winnerId) {
  if (!winnerId || !entries.length) throw new Error('Winner and forecast are required');
  const winner = entries.find((entry) => entry.driverId === String(winnerId));
  const probability = winner?.probability ?? 0;
  const brier = entries.reduce((sum, entry) => sum + (entry.probability - Number(entry.driverId === String(winnerId))) ** 2, 0) + (winner ? 0 : 1);
  return { winnerId: String(winnerId), winnerInRoster: Boolean(winner), winnerProbability: probability, logLoss: probability > 0 ? -Math.log(probability) : null, brier };
}

export function evaluateRace(context, target, options = {}) {
  if (!target.fp1_date || !target.fp1_time || target.fp1_date === '\\N' || target.fp1_time === '\\N') throw new Error('First practice time is missing');
  const firstPractice = parseUtcTimestamp(`${target.fp1_date}T${target.fp1_time}Z`);
  const decisionTime = options.decisionTime === undefined ? firstPractice - 1000 : parseUtcTimestamp(options.decisionTime);
  if (!Number.isFinite(decisionTime) || decisionTime >= firstPractice) throw new Error('Decision time must be before first practice');
  const prefix = precedingDataset(context, new Date(decisionTime).toISOString().slice(0, 10));
  const previousId = String(prefix.previousRace.raceId);
  const roster = prefix.raw.results.filter((row) => String(row.raceId) === previousId);
  const model = buildStateSpace(prefix.raw, prefix.lapSnapshots, prefix.maps, {}, prefix.lapPace);
  const names = new Map(prefix.raw.drivers.map((driver) => [String(driver.driverId), `${driver.forename || ''} ${driver.surname || ''}`.trim()]));
  const entries = winnerScores(model.snaps.at(-1), roster).map((entry) => ({ ...entry, name: names.get(entry.driverId) || entry.driverId }));
  const actual = context.raw.results.filter((row) => String(row.raceId) === String(target.raceId) && Number(row.positionOrder) === 1);
  if (actual.length !== 1) throw new Error('Race must have exactly one recorded winner');
  return {
    raceId: String(target.raceId), race: target.name, raceDate: target.date,
    firstPractice: new Date(firstPractice).toISOString(), decisionTime: new Date(decisionTime).toISOString(),
    previousRaceId: previousId, previousRace: prefix.previousRace.name, previousRaceDate: prefix.previousRace.date,
    prefixRaceIds: prefix.raw.races.map((race) => String(race.raceId)),
    roster: entries, ...scoreWinner(entries, actual[0].driverId),
  };
}

export function summarize(results) {
  if (!results.length) throw new Error('No results to summarize');
  const missingWinners = results.filter((result) => !result.winnerInRoster).length;
  const supported = results.filter((result) => result.winnerInRoster);
  return {
    races: results.length,
    missingWinners,
    meanBrier: results.reduce((sum, result) => sum + result.brier, 0) / results.length,
    meanLogLoss: missingWinners ? null : results.reduce((sum, result) => sum + result.logLoss, 0) / results.length,
    logLossNote: missingWinners ? 'Infinite: at least one actual winner was absent from the forecast roster' : 'Finite',
    meanLogLossConditionalOnWinnerInRoster: supported.length ? supported.reduce((sum, result) => sum + result.logLoss, 0) / supported.length : null,
  };
}

async function main() {
  const year = Number(process.argv[2] ?? 2026);
  if (!Number.isInteger(year) || year < 1995 || year > 2100) throw new Error('Usage: node research/prediction-markets/forecast/winner-baseline.mjs [YEAR]');
  const selectedRaceId = process.argv[3];
  const decisionTime = process.argv[4];
  if (decisionTime && !selectedRaceId) throw new Error('Specify a race ID for a custom decision time');
  if (decisionTime) parseUtcTimestamp(decisionTime);
  const context = await loadData();
  const raceIds = new Set(context.raw.results.map((row) => String(row.raceId)));
  const targets = context.raw.races.filter((race) => Number(race.year) === year && raceIds.has(String(race.raceId)) && (!selectedRaceId || String(race.raceId) === selectedRaceId)).sort((a, b) => Number(a.round) - Number(b.round));
  if (!targets.length) throw new Error('No matching completed races');
  const results = [];
  const errors = [];
  for (const target of targets) {
    try {
      results.push(evaluateRace(context, target, { decisionTime }));
    } catch (error) {
      errors.push({ raceId: String(target.raceId), race: target.name, error: error.message });
    }
  }
  const uniformResults = results.map((result) => scoreWinner(result.roster.map((entry) => ({ ...entry, probability: 1 / result.roster.length })), result.winnerId));
  console.log(JSON.stringify({ description: 'Retrospective uncalibrated pace-only proxy, assuming the previous race roster and team mapping. See forecast README.', year, summary: results.length ? summarize(results) : null, uniformPreviousRosterSummary: uniformResults.length ? summarize(uniformResults) : null, errors, results }, null, 2));
  if (errors.length || !results.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
