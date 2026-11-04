// One causal pass over fixed ratings, with identical scoring rows for every form.
import { createHash } from 'node:crypto';
import { openSync, writeSync, closeSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { strictItems } from '../../packages/research/node/mover-strict.mjs';
import { runPublishedRatings } from '../../packages/core/src/state-space/build.js';
import { ssBaseline, ssGap, pairHazard } from '../../packages/core/src/state-space/inputs.js';
import { scoreHead, selectHeads } from '../../packages/core/src/forecast/inference.js';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';
import { FormFeatures as ReferenceFormFeatures } from './reference-form.mjs';
import { ContinuousFormFeatures, InnovationFormFeatures, CombinedFormFeatures } from './form-candidates.mjs';
import { ratingDigest } from './rating-digest.mjs';

const directory = 'tmp/current-form';
mkdirSync(directory, { recursive: true });
const digest = (value) => createHash('sha256').update(value).digest('hex');
const archivePath = 'research/current-form/reference-heads.json';
const archiveText = readFileSync(archivePath, 'utf8');
const archive = JSON.parse(archiveText);
if (archive.sourceHash !== '7a44023e0b230847' || digest(JSON.stringify(archive.heads)) !== archive.headsHash) throw Error('Invalid form reference');
const provenance = async () => digest(JSON.stringify([
  (await modelSourceHash()).sourceHash,
  ...['research/current-form/protocol.md', 'research/current-form/form-candidates.mjs',
    'research/current-form/reference-form.mjs', archivePath].map((path) => [path, digest(readFileSync(path))]),
]));
const before = await provenance();
const env = await load(2026, true);
const weekends = env.prep.weekends.slice(0, env.timeline.length);
const runs = runPublishedRatings(weekends, env.prep.ctx.tmBoost);
const ratingsSha256 = ratingDigest(runs);
const ratingReferencePath = 'research/current-form/reference-ratings.json';
try {
  const expected = JSON.parse(readFileSync(ratingReferencePath, 'utf8'));
  if (expected.ratingsSha256 !== ratingsSha256) throw Error('Long-term ratings changed during form work');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  if ((await modelSourceHash()).sourceHash !== archive.sourceHash) throw Error('Rating reference must be frozen before production edits');
  writeFileSync(ratingReferencePath, JSON.stringify({ sourceHash: archive.sourceHash, ratingsSha256,
    frozenMoverPrimary: 0.6888431259752807 }, null, 2) + '\n');
}
const classes = { legacy: ReferenceFormFeatures, continuous: ContinuousFormFeatures,
  innovation: InnovationFormFeatures, combined: CombinedFormFeatures };
const create = (Class) => new Class(env.prep.data.lapPace, { track: false });
const forms = Object.fromEntries(Object.entries(classes).map(([name, Class]) => [name, create(Class)]));
const heads = archive.heads;
const params = env.prep.model.params;
const quote = (value) => {
  const text = String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
};
function writer(path) {
  const fd = openSync(path, 'w');
  let keys = null, buffer = '', rows = 0;
  return {
    push(row) {
      if (!keys) { keys = Object.keys(row); writeSync(fd, keys.map(quote).join(',') + '\n'); }
      if (Object.keys(row).length !== keys.length) throw Error('Forecast CSV schema changed');
      const values = keys.map((key) => {
        const value = row[key];
        if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw Error(`Invalid ${key}`);
        return quote(value);
      });
      buffer += values.join(',') + '\n'; rows++;
      if (rows % 500 === 0) { writeSync(fd, buffer); buffer = ''; }
    },
    finish() { if (buffer) writeSync(fd, buffer); closeSync(fd); return { path, rows, sha256: digest(readFileSync(path)) }; },
  };
}
const output = writer(`${directory}/features.csv`);
const frozen = writer(`${directory}/frozen.csv`);
const adaptive = writer(`${directory}/adaptive.csv`);
const scoredRows = new Map();
const foldEnd = (year) => year < 2008 ? null : year <= 2011 ? 2011 : year <= 2015 ? 2015 : year <= 2020 ? 2020 : year <= 2025 ? 2025 : year === 2026 ? 2026 : null;
const eligible = (row) => { const end = foldEnd(row.year); return end !== null && row.eligibilityYear <= end && row.observationYear <= end; };
const templates = [];
for (const session of ['race', 'qual']) for (const horizon of [5, 10]) {
  const run = { session, k: Math.LN10 / 75, pre: runs[session].pre };
  for (const item of strictItems(env.idx, run, env.moves, horizon)) if (eligible(item)) templates.push({ ...item, session, horizon });
}
const movesByKey = new Map(env.moves.map((move) => [`${move.driverId}:${move.t0}`, move]));
const frozenByIndex = new Map();
for (const item of templates) if (item.kind === 'tm') {
  const move = movesByKey.get(`${item.driverId}:${item.t0}`);
  if (!frozenByIndex.has(move.ell)) frozenByIndex.set(move.ell, new Map());
  const group = frozenByIndex.get(move.ell);
  const key = `${move.driverId}:${move.t0}`;
  if (!group.has(key)) group.set(key, { move, rows: [] });
  group.get(key).rows.push(item);
}
const getFeatures = (models, x, y, session, base) => Object.fromEntries(Object.entries(models).map(([name, model]) => {
  const f = model.features(x, y, session, base, base);
  for (const channel of ['qual', 'lap', 'order']) for (const speed of ['fast', 'slow']) {
    const key = `${channel}_${speed}`;
    f[`${key}_car`] ??= f[key] - f[`${key}_driver`];
  }
  return [name, f];
}));
const flatten = (features) => Object.fromEntries(Object.entries(features).flatMap(([method, values]) =>
  Object.entries(values).map(([key, value]) => [`${method}__${key}`, value])));
const predictReference = (features, year, base) => {
  const bundle = selectHeads(heads, year);
  return Object.fromEntries(['pre', 'post', 'qual', 'grid'].map((mode) => [`reference_${mode}`,
    bundle ? scoreHead(bundle[mode], features.legacy) : base]));
};
const frozenMaps = (index) => ({ D: new Map(runs.race.pre[index].rated), QD: new Map(runs.qual.pre[index].rated),
  C: new Map([['frozen-car', 0]]), QC: new Map([['frozen-car', 0]]) });
let rowIndex = 0;
for (let i = 0; i < weekends.length; i++) {
  const wk = weekends[i];
  const maps = { D: runs.race.pre[i].drivers, C: runs.race.pre[i].cars,
    QD: runs.qual.pre[i].drivers, QC: runs.qual.pre[i].cars };
  const input = { info: wk.info, rows: wk.rawRows, qrows: wk.qrows, raceSeen: wk.raceSeen, ...maps };
  for (const model of Object.values(forms)) model.beforeWeekend(input);
  if (frozenByIndex.has(i)) {
    const saved = Object.fromEntries(Object.entries(forms).map(([name, model]) => [name, structuredClone(model.exportState())]));
    for (const { move, rows } of frozenByIndex.get(i).values()) {
      const models = Object.fromEntries(Object.entries(classes).map(([name, Class]) => {
        const model = create(Class); model.importState(saved[name]); return [name, model];
      }));
      const frozenLevels = frozenMaps(i);
      const targets = new Map();
      for (const item of rows) {
        if (!targets.has(item.weekendIndex)) targets.set(item.weekendIndex, []);
        targets.get(item.weekendIndex).push(item);
      }
      const last = Math.max(...targets.keys());
      for (let t = i + 1; t <= last; t++) {
        const future = weekends[t];
        const syntheticRows = [...wk.rows].map((row) => ({ ...row, constructorId: 'frozen-car', grid: 0 }));
        for (const model of Object.values(models)) model.beforeWeekend({ info: future.info, rows: syntheticRows,
          qrows: [], raceSeen: wk.raceSeen, ...frozenLevels });
        for (const item of targets.get(t) ?? []) {
          const observation = env.timeline[t].obs[item.session][item.observationIndex];
          const other = observation.x === item.driverId ? observation.y : observation.x;
          const x = { driverId: item.driverId, constructorId: 'frozen-car', grid: 0 };
          const y = { driverId: other, constructorId: 'frozen-car', grid: 0 };
          const base = ssBaseline(item.session, ssGap(item.session, frozenLevels, x, y), 0, 0, params);
          const f = getFeatures(models, x, y, item.session, base);
          frozen.push({ move_key: `${item.year}:${item.driverId}:${item.t0}`, year: item.year, move_year: item.year,
            observation_year: item.observationYear, horizon: item.horizon, kind: 'tm', driverId: item.driverId,
            t0: item.t0, ell: move.ell, weekend: t, observationIndex: item.observationIndex,
            raceId: future.info.raceId, round: future.info.round, session: item.session, a: item.driverId, b: other,
            y: item.o, w: item.w, source: observation.src, same_team: 1,
            ...predictReference(f, future.info.year, base), ...flatten(f) });
        }
      }
    }
  }
  const count = { race: 0, qual: 0 };
  for (const { ob, session, weight } of wk.replayObs) {
    const observationIndex = count[session]++;
    if (i < 20) continue;
    const base = ssBaseline(session, ssGap(session, maps, ob.x, ob.y),
      session === 'qual' ? 0 : pairHazard(wk.preQ, ob.x), session === 'qual' ? 0 : pairHazard(wk.preQ, ob.y), params);
    const f = getFeatures(forms, ob.x, ob.y, session, base);
    scoredRows.set(`${session}:${i}:${observationIndex}`, rowIndex);
    output.push({ row_index: rowIndex++, raceId: wk.info.raceId, year: wk.info.year, round: wk.info.round,
      weekend: i, observationIndex, session, a: String(ob.x.driverId), b: String(ob.y.driverId),
      y: ob.obs, w: weight, source: ob.source ?? 'qual', same_team: +(ob.x.constructorId === ob.y.constructorId),
      ...predictReference(f, wk.info.year, base), ...flatten(f) });
  }
  for (const model of Object.values(forms)) model.afterWeekend({ info: wk.info, rows: wk.rawRows, replayObs: wk.replayObs });
  if ((i + 1) % 100 === 0) console.log(`Exported form states through ${i + 1} weekends`);
}
for (const item of templates) {
  const row_index = scoredRows.get(`${item.session}:${item.weekendIndex}:${item.observationIndex}`);
  if (row_index === undefined) throw Error('Mover forecast row omitted');
  adaptive.push({ move_key: `${item.year}:${item.driverId}:${item.t0}`, move_year: item.year, horizon: item.horizon,
    kind: item.kind, row_index, session: item.session, observation_year: item.observationYear,
    eligibility_year: item.eligibilityYear, block_end: foldEnd(item.year), weekend: item.weekendIndex,
    observationIndex: item.observationIndex });
}
const files = { features: output.finish(), frozen: frozen.finish(), adaptive: adaptive.finish() };
if (await provenance() !== before) throw Error('Form inputs changed during export');
writeFileSync(`${directory}/metadata.json`, JSON.stringify({ referenceSourceHash: archive.sourceHash,
  referenceArchiveSha256: digest(archiveText), ratingsSha256, inputsSha256: before, files }, null, 2) + '\n');
console.log(JSON.stringify(files));
