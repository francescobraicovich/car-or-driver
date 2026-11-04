// Retrospective projections of the existing pairwise forecast; not calibrated winner probabilities.
import { pathToFileURL } from 'node:url';
import { loadData } from '../../../packages/research/node/common.mjs';
import { buildStateSpace } from '../../../packages/core/src/state-space/build.js';
import { prepareForecast } from '../../../packages/core/src/forecast/prepare.js';
import { parseUtcTimestamp, precedingDataset, scoreWinner } from '../forecast/winner-baseline.mjs';
import { projectSignals } from '../pmdata/strategy-features.mjs';

/** Scheduled information cutoffs. A three-hour publication buffer is assumed, not verified. */
export function sessionTimes(target) {
  if (!target?.quali_date || !target?.quali_time || !target?.date || !target?.time) throw new Error('Missing schedule');
  const qualifyingStart = parseUtcTimestamp(`${target.quali_date}T${target.quali_time}Z`);
  const raceStart = parseUtcTimestamp(`${target.date}T${target.time}Z`);
  const postQualifyingDecision = raceStart - 3 * 3600000;
  const preQualifyingDecision = parseUtcTimestamp(`${target.quali_date}T00:00:00Z`);
  if (preQualifyingDecision >= qualifyingStart) throw new Error('Qualifying is not after its UTC-day boundary');
  if (qualifyingStart + 3 * 3600000 > postQualifyingDecision) throw new Error('Insufficient assumed qualifying publication buffer');
  return { qualifyingStart, raceStart, preQualifyingDecision, postQualifyingDecision };
}

/** Prior entries for which qualifying identifies the same driver and team. */
export function matchQualifying(previousResults, qrows) {
  if (!Array.isArray(previousResults) || !Array.isArray(qrows)) throw new Error('Roster and qualifying records required');
  const byId = new Map();
  for (const row of qrows) {
    const id = String(row.driverId), position = Number(row.position);
    if (byId.has(id) || !Number.isInteger(position) || position <= 0) throw new Error('Invalid or duplicate qualifying record');
    byId.set(id, row);
  }
  if (new Set(qrows.map((row) => Number(row.position))).size !== qrows.length) throw new Error('Duplicate qualifying position');
  const matched = [], excluded = [];
  for (const row of previousResults) {
    const q = byId.get(String(row.driverId));
    if (!q || String(q.constructorId) !== String(row.constructorId)) excluded.push(String(row.driverId));
    else matched.push(row);
  }
  if (matched.length < 2) throw new Error('Insufficient qualifying matches');
  const keep = new Set(matched.map((row) => String(row.driverId)));
  const qualifying = qrows.filter((row) => keep.has(String(row.driverId)));
  return { previousResults: matched, qualifying, excluded, grid: new Map(qualifying.map((row) => [String(row.driverId), Number(row.position)])) };
}

/** Build the two forecasts from prior race results and, only in the later forecast, target qualifying. */
export function buildWeekendSignals(context, target) {
  const times = sessionTimes(target);
  const prefix = precedingDataset(context, target.quali_date);
  if (String(prefix.previousRace.raceId) === String(target.raceId)) throw new Error('Target race cannot be a prior race');
  const previousId = String(prefix.previousRace.raceId);
  const roster = prefix.raw.results.filter((row) => String(row.raceId) === previousId);
  const model = buildStateSpace(prefix.raw, prefix.lapSnapshots, prefix.maps, {}, prefix.lapPace);
  const names = new Map(prefix.raw.drivers.map((driver) => [String(driver.driverId), `${driver.forename || ''} ${driver.surname || ''}`.trim()]));
  const options = { circuitId: String(target.circuitId), year: Number(target.year), round: Number(target.round) };
  const pre = prepareForecast(model, options);
  if (!pre) throw new Error('Prior model cannot provide a forecast');
  const preRoster = projectSignals(model.snaps.at(-1), roster, names, pre);
  const targetQualifying = context.raw.qualifying.filter((row) => String(row.raceId) === String(target.raceId));
  const matched = matchQualifying(roster, targetQualifying);
  const post = prepareForecast(model, { ...options, qrows: matched.qualifying });
  if (!post) throw new Error('Prior model cannot provide a post-qualifying forecast');
  const postRoster = projectSignals(model.snaps.at(-1), matched.previousResults, names,
    (a, b) => post(a, b, { gridA: matched.grid.get(String(a)), gridB: matched.grid.get(String(b)) }));
  return { raceId: String(target.raceId), race: target.name, previousRaceId: previousId, previousRaceDate: prefix.previousRace.date,
    qualifyingStart: new Date(times.qualifyingStart).toISOString(), raceStart: new Date(times.raceStart).toISOString(),
    qualifyingTimingVerified: false, historicalVintageVerified: false,
    preQualifying: { asOf: new Date(times.preQualifyingDecision).toISOString(), roster: preRoster },
    postQualifying: { asOf: new Date(times.postQualifyingDecision).toISOString(), excludedPriorDriverIds: matched.excluded,
      gridSource: 'qualifying position, not the subsequently published race-result grid', roster: postRoster } };
}

/** Convert a projected head to a full-field score, with or without the head's form contribution. */
export function headProbabilities(roster, withForm) {
  if (!Array.isArray(roster) || roster.length < 2 || typeof withForm !== 'boolean') throw new Error('Invalid projected roster');
  const scores = roster.map((driver) => {
    if (!Number.isFinite(driver.fullHeadStrength) || !Number.isFinite(driver.formShift)) throw new Error('Missing projected head');
    return driver.fullHeadStrength - (withForm ? 0 : driver.formShift);
  });
  const high = Math.max(...scores), weights = scores.map((score) => Math.exp(score - high));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return roster.map((driver, index) => ({ driverId: driver.driverId, probability: weights[index] / total }));
}

/** Outcomes are used only here, after all feature construction. */
export function scoreWeekend(signals, winnerId) {
  const scores = {};
  for (const period of ['preQualifying', 'postQualifying']) {
    scores[period] = {};
    for (const withForm of [false, true]) {
      scores[period][withForm ? 'withForm' : 'withoutForm'] = scoreWinner(headProbabilities(signals[period].roster, withForm), winnerId);
    }
  }
  return scores;
}

export function summarizeScores(rows) {
  const output = {};
  for (const period of ['preQualifying', 'postQualifying']) {
    output[period] = {};
    for (const variant of ['withoutForm', 'withForm']) {
      const selected = rows.map((row) => row.scores[period][variant]);
      output[period][variant] = { races: selected.length, missingWinners: selected.filter((row) => !row.winnerInRoster).length,
        meanBrier: selected.length ? selected.reduce((sum, row) => sum + row.brier, 0) / selected.length : null,
        meanLogLoss: selected.length && selected.every((row) => row.logLoss !== null) ? selected.reduce((sum, row) => sum + row.logLoss, 0) / selected.length : null,
        meanLogLossConditionalOnWinnerInRoster: selected.some((row) => row.winnerInRoster)
          ? selected.filter((row) => row.winnerInRoster).reduce((sum, row) => sum + row.logLoss, 0) / selected.filter((row) => row.winnerInRoster).length : null };
    }
  }
  return output;
}

/** Fixed paired differences; positive values mean adding form worsened the score. */
export function compareForm(rows) {
  return Object.fromEntries(['preQualifying', 'postQualifying'].map((period) => {
    const pairs = rows.map((row) => row.scores[period]);
    const brier = pairs.map((pair) => pair.withForm.brier - pair.withoutForm.brier);
    const logLoss = pairs.filter((pair) => pair.withForm.logLoss !== null && pair.withoutForm.logLoss !== null)
      .map((pair) => pair.withForm.logLoss - pair.withoutForm.logLoss);
    const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return [period, { races: pairs.length, meanBrierDifferenceWithMinusWithout: mean(brier),
      brierImproved: brier.filter((value) => value < 0).length,
      finiteLogLossPairs: logLoss.length, meanLogLossDifferenceWithMinusWithout: mean(logLoss),
      logLossImproved: logLoss.filter((value) => value < 0).length }];
  }));
}

async function main() {
  const context = await loadData();
  let requested = process.argv.slice(2);
  if (requested.length === 1 && /^--year=\d{4}$/.test(requested[0])) {
    const year = Number(requested[0].slice(7));
    const completed = new Set(context.raw.results.map((row) => String(row.raceId)));
    requested = context.raw.races.filter((race) => Number(race.year) === year && completed.has(String(race.raceId)))
      .sort((a, b) => Number(a.round) - Number(b.round)).map((race) => String(race.raceId));
  }
  if (!requested.length || requested.some((id) => !/^\d+$/.test(id))) throw new Error('Specify one or more race IDs');
  const races = [], failures = [];
  for (const id of requested) {
    try {
      const target = context.raw.races.find((race) => String(race.raceId) === id);
      if (!target) throw new Error('Unknown race');
      const signals = buildWeekendSignals(context, target);
      const winners = context.raw.results.filter((row) => String(row.raceId) === id && Number(row.positionOrder) === 1);
      if (winners.length !== 1) throw new Error('Winner missing or ambiguous');
      races.push({ ...signals, scores: scoreWeekend(signals, String(winners[0].driverId)) });
      console.error(`Processed ${target.name}`);
    } catch (error) { failures.push({ raceId: id, reason: error.message }); console.error(`Excluded race ${id}: ${error.message}`); }
  }
  console.log(JSON.stringify({ description: 'Retrospective prior-prefix pairwise-head projections; winner shares are not calibrated.',
    limitations: ['Prior model architecture, fitted heads, corrected historical inputs and qualifying publication vintages are unverified.',
      'Post-qualifying signal assumes qualifying results are available three hours after scheduled start and at least three hours before race; exact publication and later revisions are not verified.',
      'Qualifying positions proxy for the pre-race grid; race-result grid and target race finish data are excluded from features.',
      'Previous-race roster and teams may differ from the entry list; unmatched post-qualifying drivers are omitted with no Other allocation.',
      'Pairwise finishing/pace forecasts are projected to a winner score, not directly calibrated win probabilities.'],
    summary: summarizeScores(races), pairedFormComparison: compareForm(races), races, failures }, null, 2));
  if (!races.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
