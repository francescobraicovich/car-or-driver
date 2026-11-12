// Publish historical joint refits separately from the causal forecast model.
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { deserialize, serialize } from '../packages/core/src/json-serialization.js';
import { withHistories } from '../packages/core/src/weekend-histories.js';
import { latestModel, shippedModel } from './build-model.mjs';

const run = promisify(execFile);
const files = [
  'research/retrospective-refit/retrospective_refit.py',
  'research/retrospective-refit/export.mjs',
  'research/retrospective-refit/build_publication.py',
  'research/retrospective-refit/validate_publication.py',
  'research/retrospective-refit/export_boundary_warmup.mjs',
  'tools/build-retrospective.mjs',
];
export async function retrospectiveSourceHash(sourceHash) {
  const hash = createHash('sha256').update(sourceHash);
  for (const file of files) hash.update(file).update(await readFile(file));
  return hash.digest('hex').slice(0, 16);
}

export function retrospectiveModel(model, result, sourceInput, productionInput) {
  const offset = result.offset;
  if (
    !Number.isInteger(offset) ||
    result.history.length !== sourceInput.length ||
    sourceInput.length - offset !== model.snaps.length ||
    productionInput.length !== model.snaps.length
  )
    throw Error('Retrospective history does not match the production history');
  const groups = new Map();
  model.snaps.slice(0, -1).forEach((snap, index) => {
    const entries = groups.get(snap.year) ?? [];
    entries.push(index);
    groups.set(snap.year, entries);
  });
  const samples = new Set([...groups.values()].flatMap((indices) => [indices[0], indices[Math.floor(indices.length / 2)], indices.at(-1)]));
  const yearly = {};
  const snaps = model.snaps.map((snap, i) => {
    const index = i + offset,
      input = sourceInput[index];
    if (
      String(snap.raceId) !== String(input.raceId) ||
      String(snap.raceId) !== String(productionInput[i].raceId) ||
      JSON.stringify(input.observations) !== JSON.stringify(productionInput[i].observations)
    )
      throw Error(`Retrospective evidence differs at ${snap.raceId}`);
    // Current estimates and forecasts retain the original filtered state.
    if (i === model.snaps.length - 1) return snap;
    const estimates = result.history[index],
      posterior = result.covariance[String(index)];
    if (samples.has(i) && !posterior) throw Error(`Missing retrospective covariance at ${snap.raceId}`);
    const rebuild = (row, kind, identity) => {
      const values = estimates[kind]?.[String(identity)];
      if (!values || values.some((value) => !Number.isFinite(value)))
        throw Error(`Missing retrospective ${kind} ${identity} at ${snap.raceId}`);
      if (samples.has(i)) {
        const sd = posterior.standardDeviation[kind]?.[String(identity)];
        if (!sd || sd.some((value) => !Number.isFinite(value))) throw Error(`Missing retrospective ${kind} uncertainty at ${snap.raceId}`);
        yearly[snap.year] ??= { driver: { sum: [0, 0, 0], count: 0 }, car: { sum: [0, 0, 0], count: 0 } };
        const group = yearly[snap.year][kind];
        sd.forEach((value, channel) => {
          group.sum[channel] += value;
        });
        group.count++;
      }
      const { effective, packageOverall, packagePace, packageEffective, qualSd, raceSd, overallSd, combinedSd, ...retained } = row; // eslint-disable-line no-unused-vars
      const [qual, race, overall] = values.map((value) => 1000 + value);
      return { ...retained, qual, race, overall, combined: overall };
    };
    const { diag, unified, ...historicalSnapshot } = snap; // eslint-disable-line no-unused-vars
    return {
      ...historicalSnapshot,
      drivers: snap.drivers.map((row) => rebuild(row, 'driver', row.driverId)).sort((a, b) => b.overall - a.overall),
      cars: snap.cars.map((row) => rebuild(row, 'car', row.carId)).sort((a, b) => b.overall - a.overall),
    };
  });
  const annualUncertainty = Object.fromEntries(
    Object.entries(yearly).map(([year, kinds]) => [
      year,
      Object.fromEntries(
        Object.entries(kinds).map(([kind, group]) => {
          if (!group.count) throw Error(`Missing yearly ${kind} uncertainty for ${year}`);
          return [kind, group.sum.map((value) => value / group.count)];
        }),
      ),
    ]),
  );
  return withHistories({ ...model, snaps, annualUncertainty });
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  if (!process.argv.includes('--existing')) {
    await run('node', ['research/retrospective-refit/export.mjs']);
    await run('node', ['research/retrospective-refit/export_boundary_warmup.mjs']);
    await new Promise((resolve, reject) => {
      const child = spawn('python3', ['research/retrospective-refit/build_publication.py'], {
        stdio: 'inherit',
        env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
      });
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(Error(`Retrospective fit failed (${code})`))));
    });
  }
  await run('python3', ['research/retrospective-refit/validate_publication.py'], {
    env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
  });
  const [baseText, resultText, warmText, inputText] = await Promise.all([
    readFile('data/model.json', 'utf8'),
    readFile('tmp/retrospective-refit/publication-refit.json', 'utf8'),
    readFile('tmp/retrospective-refit/boundary-warmup-input.json', 'utf8'),
    readFile('tmp/retrospective-refit/input.json', 'utf8'),
  ]);
  const base = deserialize(baseText),
    result = JSON.parse(resultText);
  if (result.inputSha256 !== createHash('sha256').update(warmText).digest('hex')) throw Error('Retrospective fit input is stale');
  const warmInput = JSON.parse(warmText);
  const model = retrospectiveModel(base.model, result, warmInput, JSON.parse(inputText));
  const header = {
    format: 1,
    sourceHash: base.sourceHash,
    refitHash: await retrospectiveSourceHash(base.sourceHash),
    lastRace: base.lastRace,
    licence: base.licence,
    method: 'joint-retrospective',
    warmupFrom: warmInput[0].date,
    inputSha256: result.inputSha256,
    maximumGradient: result.maximumGradient,
  };
  const full = serialize({ ...header, model: shippedModel(model) });
  const latest = serialize({ ...header, model: latestModel(model) });
  if (Buffer.byteLength(full) > 25 * 1024 * 1024) throw Error('Retrospective model exceeds the 25 MiB Cloudflare Pages asset limit');
  await writeFile('data/retrospective.json', full);
  await writeFile('data/retrospective-latest.json', latest);
  console.log(`Retrospective ratings: ${(full.length / 1e6).toFixed(1)} MB; latest ${(latest.length / 1e3).toFixed(0)} kB.`);
}
