// The production build: shared evidence, one numerical model, dated snapshots.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { collectExam } from '../src/state-space/exam.js';
import { withHistories } from '../src/weekend-histories.js';
import { gapToP, pToRating } from '../src/math.js';
import { headToHeadWithHazard } from '../src/hazard.js';
import { exportRowsFor } from '../src/report.js';
import { entrants, measurementRows, outcomeRows, retainedLaps } from './unified-evidence.mjs';

const run = promisify(execFile);
const engine = fileURLToPath(new URL('../python/build_unified.py', import.meta.url));

export async function buildUnified(data) {
  const { model, weekends } = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
  const laps = await retainedLaps();
  const settings = JSON.parse(await readFile(new URL('../python/unified-settings.json', import.meta.url), 'utf8'));
  const inputs = weekends.map((weekend) => ({
    raceId: String(weekend.info.raceId),
    year: weekend.year,
    date: weekend.info.date,
    entries: entrants(weekend).map((entry) => ({
      ...entry,
      grid: +weekend.rawRows.find((row) => String(row.driverId) === entry.driver)?.grid || 0,
    })),
    observations: measurementRows(weekend, data.lapPace, laps, settings.refinements),
    // The fixed measurement exam used to validate the selected model.
    tests: [...measurementRows(weekend, data.lapPace, laps).filter((row) => row.channel < 2), ...outcomeRows(weekend)],
  }));
  const directory = await mkdtemp(join(tmpdir(), 'unified-ratings-'));
  let result;
  try {
    await writeFile(join(directory, 'input.json'), JSON.stringify(inputs));
    await run('python3', [engine, join(directory, 'input.json'), join(directory, 'output.json')], {
      env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
      maxBuffer: 1024 * 1024,
    });
    result = JSON.parse(await readFile(join(directory, 'output.json'), 'utf8'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const exportRows = [];
  model.snaps.forEach((snap, index) => {
    const post = result.history[index];
    const entries = new Map(inputs[index].entries.map((entry) => [entry.driver, entry]));
    const carIds = new Map(inputs[index].entries.map((entry) => [entry.constructor, entry.car]));
    const original = snap.diag;
    const rebuild = (row, kind, identity, fieldHazard) => {
      const [qual, race, overall] = post[kind][identity].map((value) => 1000 + value);
      const [qualSd, raceSd, overallSd] = post.uncertainty[kind][identity];
      return {
        ...row,
        qual,
        race,
        overall,
        qualSd,
        raceSd,
        overallSd,
        // Kept for older exports only. There is no race–qualifying blend.
        combined: overall,
        combinedSd: overallSd,
        effective: pToRating(headToHeadWithHazard(gapToP(overall - 1000, 75), row.q, fieldHazard, 60), 75),
        kind: kind === 'drivers' ? 'driver' : 'car',
      };
    };
    snap.cars = snap.cars.map((row) => ({
      ...rebuild(row, 'cars', carIds.get(row.constructorId), original.qRelField),
      carId: carIds.get(row.constructorId),
      survival: (1 - row.q) ** 60,
    }));
    const carMap = new Map(snap.cars.map((row) => [row.constructorId, row]));
    snap.drivers = snap.drivers.map((row) => {
      const rating = rebuild(row, 'drivers', row.driverId, original.qIncField);
      const car = carMap.get(row.constructorId);
      const races = entries.get(row.driverId).appearances + 1;
      const packageOverall = rating.overall + car.overall - 1000;
      return {
        ...rating,
        races,
        newDriver: races < 10,
        clean: (1 - row.q) ** 60,
        packageOverall,
        packagePace: packageOverall,
        packageEffective: pToRating(
          headToHeadWithHazard(
            gapToP(packageOverall - 1000, 75),
            1 - (1 - row.q) * (1 - car.q),
            1 - (1 - original.qIncField) * (1 - original.qRelField),
            60,
          ),
          75,
        ),
      };
    });
    snap.drivers.sort((a, b) => b.overall - a.overall);
    snap.cars.sort((a, b) => b.overall - a.overall);
    snap.unified = post.state;
    snap.evidence = Object.fromEntries(
      ['qual', 'race', 'overall'].map((channel, channelIndex) => [
        channel,
        inputs[index].observations.filter((row) => row.channel === channelIndex).length,
      ]),
    );
    delete snap.diag;
    delete snap.audit;
    delete snap.qualAudit;
    if (post.diagnostics) snap.diag = post.diagnostics;
    const { drivers, cars, unified, evidence, diag, ...info } = snap; // eslint-disable-line no-unused-vars
    exportRows.push(...exportRowsFor(info, drivers, carMap));
  });
  model.params = {
    modelKind: 'unified',
    ratingMethod: 'joint-teammate',
    ratingReference: 'model-prior',
    scale: 75,
    stdLaps: 60,
    ...settings,
  };
  model.forecastState = { kind: 'unified', calibrations: result.calibrations, gridHeads: result.gridHeads };
  model.exportRows = exportRows;
  return withHistories(model);
}
