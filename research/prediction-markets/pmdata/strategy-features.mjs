// Retrospective prefix-built signals; no historical model/data vintage is certified.
import { pathToFileURL } from 'node:url';
import { loadData } from '../../../packages/research/node/common.mjs';
import { buildStateSpace } from '../../../packages/core/src/state-space/build.js';
import { prepareForecast } from '../../../packages/core/src/forecast/prepare.js';
import { fitShifts, removeTeamMean } from '../../../packages/core/src/forecast/form-shift.js';
import { parseUtcTimestamp, precedingDataset, winnerScores } from '../forecast/winner-baseline.mjs';

const logOdds = (p) => {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Invalid pairwise probability');
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
};

/** Project existing pre-weekend pair forecasts into full-roster relative signals. */
export function projectSignals(snapshot, previousResults, names, pairForecast) {
  if (!(names instanceof Map) || typeof pairForecast !== 'function') throw new Error('Names and a pairwise forecast are required');
  const base = winnerScores(snapshot, previousResults);
  if (base.length < 2) throw new Error('At least two prior-roster drivers are required');
  const ids = base.map((row) => row.driverId);
  const teams = new Map(base.map((row) => [row.driverId, row.constructorId]));
  const pairs = new Map();
  const pair = (a, b) => {
    const key = `${a}|${b}`;
    if (!pairs.has(key)) {
      const result = pairForecast(a, b);
      if (!result || !result.breakdown) throw new Error('Missing pre-weekend pair forecast');
      pairs.set(key, { full: logOdds(result.breakdown.full), calibrated: logOdds(result.breakdown.calibrated) });
    }
    return pairs.get(key);
  };
  const fullHead = fitShifts(ids, (a, b) => pair(a, b).full);
  const form = fitShifts(ids, (a, b) => pair(a, b).full - pair(a, b).calibrated);
  const teammateForm = removeTeamMean(form, (id) => teams.get(id));
  const drivers = new Map(snapshot.drivers.map((d) => [String(d.driverId), d]));
  const cars = new Map(snapshot.cars.map((c) => [String(c.constructorId), c]));
  return base.map((row) => {
    const driver = drivers.get(row.driverId), car = cars.get(row.constructorId);
    const name = names.get(row.driverId);
    if (!name || !Number.isFinite(driver?.combined) || !Number.isFinite(car?.combined)) throw new Error('Missing prior-roster driver name or ratings');
    return { driverId: row.driverId, constructorId: row.constructorId, name,
      baselineProbability: row.probability, driverRating: driver.combined, carRating: car.combined,
      formShift: form.get(row.driverId), teammateFormShift: teammateForm.get(row.driverId),
      fullHeadStrength: fullHead.get(row.driverId) };
  });
}

/** Build a forecast from data with race dates strictly earlier than the UTC decision date. */
export function buildRaceSignals(context, target, decisionTime) {
  const at = parseUtcTimestamp(decisionTime);
  if (!target || !target.fp1_date || !target.fp1_time) throw new Error('Missing first-practice metadata');
  const practice = parseUtcTimestamp(`${target.fp1_date}T${target.fp1_time}Z`);
  if (at >= practice || !target.date || target.date < decisionTime.slice(0, 10)) throw new Error('Decision must precede first practice and race');
  const prefix = precedingDataset(context, decisionTime.slice(0, 10));
  const previousId = String(prefix.previousRace.raceId);
  const previousResults = prefix.raw.results.filter((row) => String(row.raceId) === previousId);
  const model = buildStateSpace(prefix.raw, prefix.lapSnapshots, prefix.maps, {}, prefix.lapPace);
  const names = new Map(prefix.raw.drivers.map((driver) => [String(driver.driverId), `${driver.forename || ''} ${driver.surname || ''}`.trim()]));
  const forecast = prepareForecast(model, { circuitId: String(target.circuitId), year: Number(target.year), round: Number(target.round) });
  if (!forecast) throw new Error('Prior model cannot provide a forecast');
  return { raceId: String(target.raceId), race: target.name, decisionTime: new Date(at).toISOString(),
    firstPractice: new Date(practice).toISOString(), previousRaceId: previousId, previousRaceDate: prefix.previousRace.date,
    historicalVintageVerified: false, roster: projectSignals(model.snaps.at(-1), previousResults, names, forecast) };
}

const CASES = [
  ['1176', '2026-06-25T14:00:00Z'], ['1177', '2026-07-02T14:00:00Z'],
  ['1178', '2026-07-16T14:00:00Z'], ['1179', '2026-07-23T14:00:00Z'],
  ['1180', '2026-08-20T14:00:00Z'], ['1181', '2026-09-03T14:00:00Z'],
  ['1185', '2026-10-08T14:00:00Z'],
];

const EARLIER_CASES = [
  ['1173', '2026-05-21T14:00:00Z'], ['1174', '2026-06-04T14:00:00Z'],
  ['1175', '2026-06-11T14:00:00Z'],
];

/** Select fixed chronological study races and a prior-to-practice decision time. */
export function selectCases(args) {
  if (!Array.isArray(args) || args.some((flag) => !['--earlier-training', '--utc-midnight'].includes(flag)) || new Set(args).size !== args.length) {
    throw new Error('Supported options: --earlier-training and --utc-midnight');
  }
  const cases = args.includes('--earlier-training') ? EARLIER_CASES : CASES;
  return cases.map(([id, timestamp]) => [id, args.includes('--utc-midnight') ? `${timestamp.slice(0, 10)}T00:00:00Z` : timestamp]);
}

async function main() {
  const context = await loadData();
  const races = selectCases(process.argv.slice(2)).map(([id, decision]) => {
    const targets = context.raw.races.filter((race) => String(race.raceId) === id);
    if (targets.length !== 1) throw new Error(`Cannot uniquely identify race ${id}`);
    return buildRaceSignals(context, targets[0], decision);
  });
  console.log(JSON.stringify({
    description: 'Retrospective prefix-built signals; scores are not calibrated race-winner probabilities.',
    limitations: ['Current model architecture, fitted head, corrected input data and prior-roster availability are not historically versioned.',
      'The field uses the previous race roster and assumes no missing entrants; no probability is allocated to Other or cancellation.',
      'Pairwise head forecasts target pace/finishing order rather than exact race-winner payout; their projection is a heuristic.',
      'formShift is the full-head minus no-form pairwise log-odds contribution, projected to roster-centered per-driver values.',
      'teammateFormShift is formShift minus each prior team mean; fullHeadStrength is the projection of full-head pairwise log odds.'],
    races,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
