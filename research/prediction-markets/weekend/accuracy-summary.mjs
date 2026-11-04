/** Summarize fixed, independently rebuilt historical signals without fitting to outcomes. */
import { readFile } from 'node:fs/promises';
import { compareForm, summarizeScores } from './signals.mjs';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Supply one or more generated accuracy JSON files');
const years = {}, pooled = [], failures = [];
for (const file of files) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(data.races) || !Array.isArray(data.failures)) throw new Error('Invalid accuracy file');
  for (const race of data.races) {
    const year = race.qualifyingStart.slice(0, 4);
    (years[year] ??= []).push(race);
    pooled.push(race);
  }
  failures.push(...data.failures);
}
if (new Set(pooled.map((race) => race.raceId)).size !== pooled.length) throw new Error('Duplicate evaluated race');
const summarize = (rows) => ({ summary: summarizeScores(rows), pairedFormComparison: compareForm(rows) });
console.log(JSON.stringify({ description: 'Fixed head projections over chronological prior-race prefixes; historical model/data vintages are unverified. Positive paired difference means form worsened the score.',
  pooled: summarize(pooled), years: Object.fromEntries(Object.entries(years).map(([year, rows]) => [year, summarize(rows)])), failures }, null, 2));
