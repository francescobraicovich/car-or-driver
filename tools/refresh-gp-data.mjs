// Append complete new race weekends from a fetched snapshot. Historical source
// corrections are reported but need a separate, deliberate review.
//   node tools/refresh-gp-data.mjs tmp/gp-fetch
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { csv } from '../packages/core/src/csv.js';
import { buildManifest, MANIFEST_FILES } from './make-data-manifest.mjs';

const keyOf = {
  results: (row) => row.resultId,
  qualifying: (row) => row.qualifyId,
  lap_times: (row) => `${row.raceId}/${row.driverId}/${row.lap}`,
  races: (row) => row.raceId,
  drivers: (row) => row.driverId,
  constructors: (row) => row.constructorId,
  status: (row) => row.statusId,
  circuits: (row) => row.circuitId,
};

const raceOrder = (race) => Number(race.year) * 100 + Number(race.round);
const readTables = (texts) => Object.fromEntries(MANIFEST_FILES.map((name) => [name.slice(0, -4), csv(texts[name])]));
const csvCell = (value) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

function indexed(rows, key, name) {
  const out = new Map();
  for (const row of rows) {
    const id = key(row);
    if (!id || (out.has(id) && JSON.stringify(out.get(id)) !== JSON.stringify(row)))
      throw Error(`${name}: missing or conflicting key ${id}`);
    out.set(id, row);
  }
  return out;
}

/** Validate a candidate snapshot against the committed one. No files are changed here. */
export function assessGpRefresh(previous, candidate, now = new Date()) {
  const old = readTables(previous);
  const next = readTables(candidate);
  for (const name of MANIFEST_FILES) {
    const table = name.slice(0, -4);
    const before = old[table];
    const after = next[table];
    if (!before.length || !after.length) throw Error(`${name}: empty table`);
    if (Object.keys(before[0]).join(',') !== Object.keys(after[0]).join(',')) throw Error(`${name}: schema changed`);
  }

  const oldRaces = indexed(old.races, keyOf.races, 'old races');
  const nextRaces = indexed(next.races, keyOf.races, 'new races');
  const oldResults = indexed(old.results, keyOf.results, 'old results');
  const nextResults = indexed(next.results, keyOf.results, 'new results');
  const oldCompleted = new Set([...oldResults.values()].map((row) => row.raceId));
  const newCompleted = new Set([...nextResults.values()].map((row) => row.raceId));
  if ([...oldCompleted].some((id) => !newCompleted.has(id))) throw Error('fetched results omit a previously completed race');
  const latestOld = [...oldCompleted]
    .map((id) => oldRaces.get(id))
    .sort((a, b) => raceOrder(a) - raceOrder(b))
    .at(-1);
  if (!latestOld) throw Error('committed data has no completed race');
  const added = [...newCompleted]
    .filter((id) => !oldCompleted.has(id))
    .map((id) => nextRaces.get(id))
    .sort((a, b) => raceOrder(a) - raceOrder(b));
  if (added.some((race) => !race || raceOrder(race) <= raceOrder(latestOld)))
    throw Error('candidate has a result for an unknown or older race');
  const historicalCorrections = {};
  for (const name of MANIFEST_FILES) {
    const table = name.slice(0, -4);
    if (table === 'lap_times') {
      const byRace = (rows) => {
        const races = new Map();
        for (const row of rows) {
          if (!oldCompleted.has(row.raceId)) continue;
          if (!races.has(row.raceId)) races.set(row.raceId, []);
          races.get(row.raceId).push(row);
        }
        return races;
      };
      const before = byRace(old.lap_times);
      const after = byRace(next.lap_times);
      const changed = [...before].filter(([id, rows]) => JSON.stringify(rows) !== JSON.stringify(after.get(id))).length;
      if (changed) historicalCorrections[name] = `${changed} race(s)`;
      continue;
    }
    const before = indexed(old[table], keyOf[table], `old ${name}`);
    const after = indexed(next[table], keyOf[table], `new ${name}`);
    let changed = 0;
    for (const [id, row] of before) {
      if (after.has(id) && JSON.stringify(after.get(id)) !== JSON.stringify(row)) changed++;
    }
    if (changed) historicalCorrections[name] = changed;
  }
  if (!added.length) return { updated: false, latest: latestOld, added: [], historicalCorrections };

  const last = added.at(-1);
  const scheduled = [...nextRaces.values()].filter((race) => raceOrder(race) > raceOrder(latestOld) && raceOrder(race) <= raceOrder(last));
  if (scheduled.some((race) => !newCompleted.has(race.raceId))) throw Error('a scheduled race was skipped in the fetched results');
  const today = now.toISOString().slice(0, 10);
  for (const race of added) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(race.date) || race.date > today) throw Error(`${race.name}: race date is in the future or invalid`);
    const results = next.results.filter((row) => row.raceId === race.raceId);
    const qualifying = next.qualifying.filter((row) => row.raceId === race.raceId);
    const laps = next.lap_times.filter((row) => row.raceId === race.raceId);
    if (
      results.length < 10 ||
      new Set(results.map((row) => row.driverId)).size < 10 ||
      qualifying.length < 10 ||
      laps.length < 100 ||
      new Set(laps.map((row) => row.driverId)).size < 10
    )
      throw Error(`${race.name}: results, qualifying or lap times look incomplete (${results.length}/${qualifying.length}/${laps.length})`);
    const publishedSchedule = oldRaces.get(race.raceId);
    if (publishedSchedule && ['year', 'round', 'date', 'circuitId'].some((field) => publishedSchedule[field] !== race[field]))
      throw Error(`${race.name}: fetched race schedule conflicts with published schedule`);
  }
  return { updated: true, latest: last, added, historicalCorrections };
}

/** Keep published rows byte-for-byte; append only records belonging to new weekends. */
export function mergeGpRefresh(previous, candidate, assessment) {
  const old = readTables(previous);
  const next = readTables(candidate);
  const addedIds = new Set(assessment.added.map((race) => race.raceId));
  return Object.fromEntries(
    MANIFEST_FILES.map((name) => {
      const table = name.slice(0, -4);
      const oldKeys = new Set(old[table].map(keyOf[table]));
      const append = next[table].filter((row) => {
        if (oldKeys.has(keyOf[table](row))) return false;
        return ['results', 'qualifying', 'lap_times', 'races'].includes(table) ? addedIds.has(row.raceId) : true;
      });
      const columns = Object.keys(old[table][0]);
      const lines = append.map((row) => columns.map((column) => csvCell(row[column])).join(','));
      const original = previous[name];
      return [name, lines.length ? `${original}${original.endsWith('\n') ? '' : '\n'}${lines.join('\n')}\n` : original];
    }),
  );
}

async function main() {
  const source = process.argv[2];
  if (!source) throw Error('usage: node tools/refresh-gp-data.mjs <fetched directory> [--check-only]');
  const checkOnly = process.argv.includes('--check-only');
  const read = async (dir) =>
    Object.fromEntries(await Promise.all(MANIFEST_FILES.map(async (name) => [name, await readFile(`${dir}/${name}`, 'utf8')])));
  const previous = await read('data');
  const candidate = await read(source);
  const result = assessGpRefresh(previous, candidate);
  if (Object.keys(result.historicalCorrections).length)
    console.log(`Ignored source corrections to published rows: ${JSON.stringify(result.historicalCorrections)}`);
  if (!result.updated) {
    console.log('No new completed Grand Prix; committed data stays unchanged.');
  } else {
    if (!checkOnly) {
      const merged = mergeGpRefresh(previous, candidate, result);
      for (const name of MANIFEST_FILES) await writeFile(`data/${name}`, merged[name]);
      const manifest = await buildManifest('data');
      if (manifest.lastRace.year !== Number(result.latest.year) || manifest.lastRace.round !== Number(result.latest.round))
        throw Error('merged manifest does not match the validated latest race');
      await writeFile('data/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
    }
    console.log(
      `${checkOnly ? 'Validated' : 'Accepted'} ${result.added.length} GP(s); latest: ${result.latest.year} round ${result.latest.round} ${result.latest.name}`,
    );
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `updated=${result.updated}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
