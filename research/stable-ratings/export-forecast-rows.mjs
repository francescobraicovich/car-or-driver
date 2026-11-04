// Export candidate features with forecasts from the archived pre-change heads.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { replayForecastLayer } from '../../packages/core/src/state-space/replay.js';
import { scoreHead, selectHeads } from '../../packages/core/src/forecast/inference.js';
import { buildPersistentCandidates } from './persistent-candidates.mjs';
import { buildRobustCandidates } from './robust-candidates.mjs';
import { buildTemperedCandidates } from './tempered-candidates.mjs';
import { buildTemporalCandidates } from '../temporal-graph/candidates.mjs';

const [destination, candidateName] = process.argv.slice(2);
if (!destination || !candidateName) throw Error('Usage: export-forecast-rows.mjs output.jsonl candidate-name');
const reference = JSON.parse(await readFile('research/stable-ratings/reference-forecast-heads.json', 'utf8'));
const heads = reference.heads;
if (reference.referenceSourceHash !== '928427f97ab9daf6' ||
  reference.referenceFileHash !== 'c81017edb1d24cdacc7bbd0cd9d1c2e2e31612bb5c083bfc175163660eab71e7' ||
  createHash('sha256').update(JSON.stringify(heads)).digest('hex') !== '9cd1d68ef12dcfada8e63a891a2e24e48e113c61a0a76dd0fa9fcd6f55471b94')
  throw Error('The archived forecast reference differs from the frozen baseline');
const env = await load(2026, true);
const temporal = ['previous-static', 'current-temporal', 'neutral-g0', 'neutral-static', 'neutral-temporal'].includes(candidateName);
const candidates = temporal ? buildTemporalCandidates(env) : candidateName.startsWith('tempered-') ? buildTemperedCandidates(env) :
  candidateName.startsWith('robust-') ? buildRobustCandidates(env) : buildPersistentCandidates(env);
if (!candidates[candidateName]) throw Error(`Unknown stable-rating candidate: ${candidateName}`);
const weekends = env.prep.weekends.slice(0, env.timeline.length);
const options = { lapPace: env.prep.data.lapPace, params: env.prep.model.params, heads, formOptions: { track: false } };
const referenceRows = [];
replayForecastLayer(weekends, { race: candidates.baseline.race.pre, qual: candidates.baseline.qual.pre }, {
  ...options,
  onRow: ({ info, session, ob, weight, predicted, features }) => {
    const bundle = selectHeads(heads, info.year);
    referenceRows.push({ raceId: info.raceId, session, a: ob.x.driverId, b: ob.y.driverId, y: ob.obs, weight,
      predicted: session === 'race' && bundle ? { ...predicted, grid: scoreHead(bundle.grid, features) } : predicted });
  },
});
let sequence = 0;
const rows = [];
const candidate = candidates[candidateName];
replayForecastLayer(weekends, { race: candidate.race.pre, qual: candidate.qual.pre }, {
  ...options,
  onRow: ({ info, weekend, session, ob, weight, features }) => {
    const reference = referenceRows[sequence++];
    if (reference.raceId !== info.raceId || reference.session !== session || reference.a !== ob.x.driverId ||
      reference.b !== ob.y.driverId || reference.y !== ob.obs || reference.weight !== weight) throw Error('Forecast observation identities differ');
    if (weekend < 20) return;
    rows.push({ raceId: info.raceId, year: info.year, session, a: ob.x.driverId, b: ob.y.driverId,
      y: ob.obs, w: weight, source: ob.source ?? 'qual', ...features, published: reference.predicted });
  },
});
if (sequence !== referenceRows.length) throw Error('Forecast observation coverage differs');
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
await writeFile(`${destination}.metadata.json`, `${JSON.stringify({ candidate: candidateName, rows: rows.length,
  referenceSourceHash: reference.referenceSourceHash, referenceFileHash: reference.referenceFileHash,
  protocol: `research/${temporal ? 'temporal-graph' : 'stable-ratings'}/protocol.md` }, null, 2)}\n`);
console.log(`Exported ${rows.length} causal forecast rows for ${candidateName}`);
