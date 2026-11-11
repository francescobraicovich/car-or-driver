import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { teammateGraphExam } from '../../packages/core/src/teammate-graph-exam.js';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';
import { jointEvidence } from './evidence.mjs';

const directory = 'tmp/graph-evidence';
await mkdir(directory, { recursive: true });
const fingerprint = createHash('sha256');
for (const name of (await readdir('data')).filter((name) => name.endsWith('.csv') || name === 'manifest.json').sort())
  fingerprint.update(name).update(await readFile(`data/${name}`));
const inputFingerprint = fingerprint.digest('hex');
const env = await load(2026, true);
const weekends = env.prep.weekends;
console.log('Building exact current graph reference');
const current = teammateGraphExam(weekends, { halfLifeYears: 3 });
const joint = jointEvidence(weekends, env.prep.data.lapPace).map((weekend, index) => ({
  ...weekend,
  forecastEntries: [
    ...new Set([...weekend.entries, ...weekends[index].replayObs.flatMap(({ ob }) => [String(ob.x.driverId), String(ob.y.driverId)])]),
  ],
}));
const legacy = current.map((snapshot, index) => ({
  ...joint[index],
  observations: snapshot.observations.map((observation) => ({
    ...observation,
    kind: 'binary',
    target: (observation.outcome + 1) / 2,
    session: observation.source === 'qual' ? 'qual' : 'race',
  })),
}));
const reference = current.map((snapshot, index) =>
  Object.fromEntries(
    ['pre', 'post'].map((phase) => [
      phase,
      (phase === 'pre' ? joint[index].forecastEntries : joint[index].entries).map((id) => snapshot[phase].levels.get(id) ?? 0),
    ]),
  ),
);
const configurations = {
  current: { evidence: 'legacy', options: { covariance: true } },
  joint: { evidence: 'joint', options: { covariance: true } },
  sessions: { evidence: 'joint', options: { sessions: true } },
  independentSessions: { evidence: 'joint', options: { sessions: true, coupling: 0 } },
  weekendResolution: { evidence: 'joint', options: { resolution: 'weekend' } },
};
for (const half_life of [3, null])
  for (const drift of [4, 8])
    for (const precision of [1, 2]) {
      const name = `memory_decay${half_life ?? 'none'}_drift${drift}_precision${precision}`;
      configurations[name] = { evidence: 'joint', through: 2007, options: { half_life, drift, precision } };
    }
await writeFile(
  `${directory}/input.json`,
  JSON.stringify({ fingerprint: inputFingerprint, modelSource: await modelSourceHash(), joint, legacy, reference }),
);
await writeFile(`${directory}/configurations.json`, JSON.stringify(configurations, null, 2));
console.log(`Exported ${weekends.length} weekends; data fingerprint ${inputFingerprint}`);
