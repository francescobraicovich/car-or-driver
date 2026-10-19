// Score a search candidate against the shipped backbone on a held-out window.
//
//   node packages/research/node/gate-backbone.mjs research/backbone/search-2008_2011.json [--from 2012] [--to 2015]
//
// Read the pre-registered protocol (research/backbone/protocol-*.json) BEFORE
// running this: the gate window is spent by looking at it. Windows reaching
// 2016+ are the terminal window and need --terminal.
import { readFile } from 'node:fs/promises';
import { loadData } from './common.mjs';
import { TUNED_ELO as INCUMBENT } from '../../core/src/presets/tuned-elo.js';
import { EXAM_KEYS } from '../../core/src/exam.js';
import { createScorer } from '../../core/src/tuning.js';

const arg = (k, dflt) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? dflt : process.argv[i + 1];
};
const file = process.argv[2];
if (!file || file.startsWith('--')) throw Error('usage: gate-backbone.mjs <search-result.json> [--from Y] [--to Y] [--terminal]');
const from = +arg('from', 2012);
const to = +arg('to', 2015);
if (to > 2015 && !process.argv.includes('--terminal')) throw Error('2016+ is the terminal window; pass --terminal to open it');

const candidate = JSON.parse(await readFile(file, 'utf8')).best.params;
for (const k of EXAM_KEYS) if (candidate[k] !== INCUMBENT[k]) throw Error(`candidate changes exam key ${k}`);

const score = createScorer(await loadData('data'), { fromYear: from, toYear: to, burnIn: 20, objective: 'full' });
const inc = score(INCUMBENT);
const cand = score(candidate);
console.log(`window ${from}-${to}   incumbent ${inc.toFixed(6)}   candidate ${cand.toFixed(6)}   delta ${(cand - inc).toFixed(6)}`);
console.log(cand < inc ? 'GATE PASSES (candidate < incumbent)' : 'GATE FAILS (candidate >= incumbent)');
