import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';
import { moverReport } from '../stable-ratings/metrics.mjs';
import { evaluateGraph, compareGraphs, summarize } from './evaluation.mjs';

const directory = 'tmp/graph-evidence';
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
async function fingerprint() {
  const hash = createHash('sha256').update(JSON.stringify(await modelSourceHash()));
  for (const folder of ['research/graph-evidence', 'packages/eval/src', 'packages/research/node', 'data']) {
    for (const file of (await readdir(folder))
      .filter((file) => /\.(mjs|js|py|csv)$/.test(file) || file === 'protocol.md' || file === 'manifest.json')
      .sort())
      hash.update(`${folder}/${file}`).update(await readFile(`${folder}/${file}`));
  }
  hash.update(await readFile('research/stable-ratings/metrics.mjs'));
  return hash.digest('hex');
}
async function executeConfigurations(name, configurations) {
  const configurationPath = `${directory}/${name}-configurations.json`,
    resultPath = `${directory}/${name}-histories.json`;
  await writeFile(configurationPath, JSON.stringify(configurations));
  await new Promise((resolve, reject) => {
    const child = spawn('python3', ['research/graph-evidence/model.py', `${directory}/input.json`, configurationPath, resultPath], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(Error(`Graph solver exited ${code}`))));
  });
  return (await read(resultPath)).models;
}

const initialFingerprint = await fingerprint();
const [input, fitted, configurations, env] = await Promise.all([
  read(`${directory}/input.json`),
  read(`${directory}/histories.json`),
  read(`${directory}/configurations.json`),
  load(2026, true),
]);
if (input.fingerprint !== fitted.inputFingerprint) throw Error('Graph input fingerprints differ');
const dataHash = createHash('sha256');
for (const name of (await readdir('data')).filter((name) => name.endsWith('.csv') || name === 'manifest.json').sort())
  dataHash.update(name).update(await readFile(`data/${name}`));
if (dataHash.digest('hex') !== input.fingerprint) throw Error('Local data changed since graph export');
for (const [path, expected] of [
  [`${directory}/input.json`, fitted.inputHash],
  ['research/graph-evidence/model.py', fitted.solverHash],
]) {
  if (
    createHash('sha256')
      .update(await readFile(path))
      .digest('hex') !== expected
  )
    throw Error(`Stale graph histories: ${path}`);
}
const currentSource = await modelSourceHash();
if (JSON.stringify(currentSource) !== JSON.stringify(input.modelSource)) throw Error('Production source changed since export');
let parityCount = 0,
  maximumDifference = 0;
fitted.models.current.history.forEach((snapshot, index) => {
  for (const phase of ['pre', 'post'])
    snapshot[phase].levels.race.forEach((value, driverIndex) => {
      maximumDifference = Math.max(maximumDifference, Math.abs(value - input.reference[index][phase][driverIndex]));
      parityCount++;
    });
});
if (maximumDifference > 1e-5) throw Error(`Production graph parity failed: ${maximumDifference}`);
console.log(`Current-graph parity passed over ${parityCount} levels; maximum difference ${maximumDifference}`);

// Parameter selection is confined to the prespecified early chronological block.
const memoryTraining = Object.entries(fitted.models)
  .filter(([name]) => name.startsWith('memory_'))
  .map(([name, model]) => {
    const evaluation = evaluateGraph(env, model.history, { folds: [{ from: 2004, to: 2007 }] });
    return { name, loss: summarize(evaluation.forecasts).loss, options: configurations[name].options };
  })
  .sort((a, b) => a.loss - b.loss || a.name.localeCompare(b.name));
const memory = memoryTraining[0];
console.log(`Training-only memory selection: ${memory.name}`);
const currentConfigurations = {
  currentSessions: { evidence: 'legacy', options: { sessions: true } },
  ...Object.fromEntries(
    Object.entries(configurations)
      .filter(([name]) => name.startsWith('memory_'))
      .map(([name, configuration]) => [name, { ...configuration, evidence: 'legacy' }]),
  ),
};
const currentControls = await executeConfigurations('current-controls', currentConfigurations);
const currentMemoryTraining = Object.entries(currentControls)
  .filter(([name]) => name.startsWith('memory_'))
  .map(([name, model]) => {
    const evaluation = evaluateGraph(env, model.history, { folds: [{ from: 2004, to: 2007 }] });
    return { name, loss: summarize(evaluation.forecasts).loss, options: configurations[name].options };
  })
  .sort((a, b) => a.loss - b.loss || a.name.localeCompare(b.name));
const currentMemory = currentMemoryTraining[0];
console.log(`Training-only original-evidence memory selection: ${currentMemory.name}`);
const additional = await executeConfigurations('selected-memory', {
  memory: { evidence: 'joint', options: memory.options },
  currentMemory: { evidence: 'legacy', options: currentMemory.options },
});
Object.assign(fitted.models, additional, { currentSessions: currentControls.currentSessions });

const definitions = {
  current: { model: 'current' },
  joint: { model: 'joint' },
  currentUncertainty: { model: 'current', uncertainty: true },
  jointUncertainty: { model: 'joint', uncertainty: true },
  sessions: { model: 'sessions' },
  currentSessions: { model: 'currentSessions' },
  independentSessions: { model: 'independentSessions' },
  memory: { model: 'memory' },
  currentMemory: { model: 'currentMemory' },
  weekendResolution: { model: 'weekendResolution' },
};
const evaluations = {};
const monitoring = {};
for (const [name, definition] of Object.entries(definitions)) {
  console.log(`Scoring ${name}`);
  evaluations[name] = evaluateGraph(env, fitted.models[definition.model].history, definition);
  monitoring[name] = evaluateGraph(env, fitted.models[definition.model].history, { ...definition, folds: [{ from: 2026, to: 2026 }] });
}
const comparisons = {};
for (const name of Object.keys(definitions).filter((name) => name !== 'current')) {
  console.log(`Paired validation ${name}`);
  comparisons[name] = { current: compareGraphs(evaluations.current, evaluations[name]) };
  if (name !== 'joint' && name !== 'currentUncertainty') comparisons[name].joint = compareGraphs(evaluations.joint, evaluations[name]);
}

// Only combine independently validated extensions. Diagnostic arms cannot be selected.
const base = comparisons.joint.current.pass ? 'joint' : 'current';
const eligible = base === 'joint' ? ['jointUncertainty', 'sessions', 'memory'] : ['currentUncertainty', 'currentSessions', 'currentMemory'];
const selectedExtensions = eligible.filter((name) => comparisons[name][base]?.pass && comparisons[name].current.pass);
let selected =
  [...selectedExtensions].sort(
    (a, b) => comparisons[a].current.movers.pooled.primary.candidate - comparisons[b].current.movers.pooled.primary.candidate,
  )[0] ?? base;
if (selectedExtensions.length) {
  const options = {
    ...(selectedExtensions.includes('memory') ? memory.options : selectedExtensions.includes('currentMemory') ? currentMemory.options : {}),
    sessions: selectedExtensions.some((name) => name === 'sessions' || name === 'currentSessions'),
    covariance: selectedExtensions.some((name) => name.endsWith('Uncertainty')),
  };
  const combined = await executeConfigurations('combined', { combined: { evidence: base === 'joint' ? 'joint' : 'legacy', options } });
  fitted.models.combined = combined.combined;
  definitions.combined = { model: 'combined', uncertainty: options.covariance };
  evaluations.combined = evaluateGraph(env, combined.combined.history, definitions.combined);
  monitoring.combined = evaluateGraph(env, combined.combined.history, { ...definitions.combined, folds: [{ from: 2026, to: 2026 }] });
  comparisons.combined = {
    current: compareGraphs(evaluations.current, evaluations.combined),
    joint: compareGraphs(evaluations.joint, evaluations.combined),
  };
  if (comparisons.combined.current.pass && comparisons.combined[base].pass) selected = 'combined';
}

const compact = (evaluation) => {
  const { forecasts: _forecasts, movers: _movers, ...summary } = evaluation;
  const primary = moverReport(evaluation, evaluation, { bootstrap: { B: 0 } }).pooled.primary;
  return { ...summary, primaryMoverLoss: primary.candidate, primaryMoverCount: primary.moves };
};
const summaries = Object.fromEntries(Object.entries(evaluations).map(([name, evaluation]) => [name, compact(evaluation)]));
if ((await fingerprint()) !== initialFingerprint) throw Error('Sources or data changed during evaluation');
const report = {
  fingerprint: initialFingerprint,
  inputFingerprint: input.fingerprint,
  modelSource: input.modelSource,
  runtime: fitted.runtime,
  protocol: 'research/graph-evidence/protocol.md',
  parity: { count: parityCount, maximumDifference },
  memoryTraining,
  currentMemoryTraining,
  researchBaseline: 'joint',
  validatedSelection: selected,
  selectedExtensions,
  configurations,
  models: summaries,
  monitoring: Object.fromEntries(
    Object.entries(monitoring).map(([name, evaluation]) => [name, { folds: evaluation.folds, pooled: evaluation.pooled }]),
  ),
  comparisons,
  limitations: [
    'Retrospective historical selection; 2026 monitoring only.',
    'Tempered composite likelihood and Hessian uncertainty are approximations, not demonstrated coverage.',
    'Teammate-only graph evaluation; production cars and complete forecast heads have not been refitted.',
    'Bootstrap intervals do not account for all model selection.',
  ],
};
await writeFile('research/graph-evidence/results.json', `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  'research/graph-evidence/selection.json',
  `${JSON.stringify({ researchBaseline: 'joint', validatedSelection: selected, selectedExtensions, fingerprint: initialFingerprint, productionChanged: false }, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      selected,
      selectedExtensions,
      models: Object.fromEntries(
        Object.entries(summaries).map(([name, value]) => [
          name,
          { mover: value.primaryMoverLoss, race: value.pooled.race.loss, qualifying: value.pooled.qual.loss },
        ]),
      ),
    },
    null,
    2,
  ),
);
