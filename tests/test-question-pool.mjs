// The questions of the front page (site/js/question-pool.js), from the same displayed ratings as the site: every one leads to a page the site has,
// none is worded twice or names a driver by a pronoun, the score orders each kind as intended (the big questions first, duels of the same era and
// a similar standing above pairs no one asks about, two poor drivers of the same years still asked about), and the draws keep the mix of kinds.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { centredRatings } from '../site/js/rating-reference.js';
import { withAnnualUncertainty } from '../site/js/retrospective-uncertainty.js';
import { INSIGHTS_DATA } from '../site/js/insights-data.js';
import { INSIGHT_PAGES } from '../site/js/insight-page-metadata.js';
import { ROUTES } from '../site/js/address.js';
import { drawQuestion, KIND_SHARE, questionPool, questionsWithoutRatings } from '../site/js/question-pool.js';
import { readRatings } from '../tools/driver-and-team-pages.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = async (name) => deserialize(await readFile(join(ROOT, 'data', name), 'utf8'));
const [retrospective, reference, filtered] = await Promise.all([
  read('retrospective.json'),
  read('rating-reference.json'),
  read('model.json'),
]);
const display = centredRatings(withAnnualUncertainty(retrospective.model), reference, retrospective.refitHash); // as model-loader.js
const pool = questionPool(display, filtered.driverProfiles, INSIGHTS_DATA.champions);
const ofKinds = (...kinds) => pool.filter((question) => kinds.includes(question.kind));
assert.ok(pool.length > 300, `a large pool (${pool.length})`);

// every question leads to a page the site has: a page of the site itself, a finding, or a page the build writes
const ratings = await readRatings(ROOT);
const written = new Set([
  ...ROUTES,
  '/drivers',
  '/teams',
  '/teammates',
  '/compare',
  '/seasons',
  ...Object.values(INSIGHT_PAGES).map((page) => `/insights/${page.slug}`),
  ...[...ratings.drivers.values()].map((driver) => driver.path),
  ...[...ratings.teams.values()].map((team) => team.path),
  ...[...ratings.pairs.values()].filter((pair) => pair.races.length >= 5).map((pair) => pair.path),
  ...ratings.comparisons.map((comparison) => comparison.path),
  ...ratings.seasons.map((season) => season.path),
]);
for (const question of pool)
  assert.ok(written.has(question.href.split('?')[0]), `${question.text} leads to ${question.href}, a page the site has`);
// a duel leads to the page of the two drivers (their teammates' page, or the page comparing them), a season to its page
for (const question of ofKinds('versus', 'worse'))
  assert.match(question.href, /^\/(compare|teammates)\/[a-z0-9-]+-vs-[a-z0-9-]+$/, `${question.text} has a page of its own`);
assert.ok(
  ofKinds('versus').some((question) => question.href.startsWith('/compare/')),
  'drivers who were not teammates are compared on a page',
);
const seasonQuestions = ofKinds('season');
assert.ok(seasonQuestions.length >= 30, `a question for each season (${seasonQuestions.length})`);
for (const question of seasonQuestions)
  assert.equal(question.href, `/seasons/${question.text.match(/\d{4}/)[0]}`, `${question.text} leads to the page of its season`);

// worded once each, about drivers by name
assert.equal(new Set(pool.map((question) => question.text)).size, pool.length, 'no question is worded twice');
for (const question of pool)
  assert.ok(!/\b(he|him|his|she|her|hers)\b/i.test(question.text), `${question.text} names drivers, not pronouns`);
const verstappen = pool.filter((question) => /\bVerstappen\b/.test(question.text));
for (const question of verstappen)
  assert.ok(
    /Jos Verstappen/.test(question.text) || /[?&][ab]=830\b|driver(s)?=830\b|max-verstappen/.test(question.href),
    `"Verstappen" alone is Max: ${question.text}`,
  );
assert.ok(
  pool.every(
    (question) =>
      !/\bSchumacher\b/.test(question.text) ||
      /(Mick|Ralf) Schumacher|[?&][ab]=30\b|driver(s)?=30\b|michael-schumacher/.test(question.href) ||
      /(Mick|Ralf) Schumacher/.test(question.text),
  ),
  '"Schumacher" alone is Michael',
);

// the order the score gives, within each kind (the feed draws a kind first, then a question of it by its score)
const rank = (kind, pattern) => ofKinds(kind).findIndex((question) => pattern.test(question.text));
assert.equal(rank('insight', /^Who is the best F1 driver of all time\?$/), 0, 'the best driver of all time is the most wanted finding');
assert.ok(
  rank('versus', /^Who is better: (Hamilton or Alonso|Alonso or Hamilton)\?$/) < 5,
  'two legends of one era are among the most wanted duels',
);
assert.ok(
  rank('versus', /^Who is better: (Verstappen or Leclerc|Leclerc or Verstappen)\?$/) >= 0,
  'two of the best drivers of one era are asked about',
);
assert.ok(rank('versus', /Senna/) < 15, 'a legend is compared across eras');
const matched = rank('versus', /^Who is better: (Hamilton or Alonso|Alonso or Hamilton)\?$/);
const mismatched = rank('versus', /^Who is better: (Hamilton or Albon|Albon or Hamilton)\?$/);
assert.ok(
  mismatched < 0 || mismatched > matched + 50,
  `drivers of a similar standing make the better duel (Hamilton and Albon: ${mismatched})`,
);
assert.ok(
  rank('worse', /^Who is worse: (Mazepin or Latifi|Latifi or Mazepin)\?$/) < 5,
  'two poor drivers of the same years, Latifi and Mazepin, are among the most wanted of their kind',
);
const lastSeason = new Map([...ratings.drivers.values()].map((driver) => [driver.surname, driver.last]));
const obscure = pool.filter(
  (question) =>
    /Latifi/.test(question.text) &&
    [...lastSeason].some(([surname, last]) => last <= 2000 && new RegExp(`\\b${surname}\\b`).test(question.text)),
);
assert.deepEqual(obscure, [], 'no question pairs Latifi with a driver of the 1990s');
assert.ok(
  pool.some((question) => question.kind === 'graph' && question.href === '/graph?v=1&driver=852' && /Tsunoda/.test(question.text)),
  'a question on how Tsunoda compares with every teammate opens the Graph on Tsunoda',
);

// before the ratings arrive the feed has the findings and the present
assert.ok(
  questionsWithoutRatings().every((question) => pool.some((other) => other.text === question.text)),
  'the first questions are in the pool',
);

// the draws: never a topic on the screen; the kinds in their mix, and a kind crowding the screen less often; within a kind, the more wanted more often
let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const onScreen = new Set(pool.slice(0, 5).map((question) => question.topic));
for (let i = 0; i < 200; i++)
  assert.ok(!onScreen.has(drawQuestion(pool, onScreen, random).topic), 'a topic on the screen is not drawn again');
assert.ok(Math.abs(Object.values(KIND_SHARE).reduce((sum, share) => sum + share, 0) - 1) < 1e-9, 'the mix of kinds adds up to the whole');
const draws = 20000;
const counts = new Map();
const kinds = new Map();
for (let i = 0; i < draws; i++) {
  const question = drawQuestion(pool, new Set(), random);
  counts.set(question.text, (counts.get(question.text) ?? 0) + 1);
  kinds.set(question.kind, (kinds.get(question.kind) ?? 0) + 1);
}
for (const [kind, share] of Object.entries(KIND_SHARE))
  assert.ok(Math.abs((kinds.get(kind) ?? 0) / draws - share) < 0.015, `${kind} questions are drawn in their share of the mix (${share})`);
let crowded = 0;
for (let i = 0; i < 4000; i++) if (drawQuestion(pool, new Set(), random, ['versus', 'versus', 'versus']).kind === 'versus') crowded++;
assert.ok(crowded / 4000 < KIND_SHARE.versus / 3, `a kind already crowding the screen comes far less often (${crowded / 4000})`);
const best = counts.get('Who is the best F1 driver of all time?') ?? 0;
const least = ofKinds('insight').at(-1);
assert.ok(
  best > 1.5 * (counts.get(least.text) ?? 0),
  `the best of all time is drawn more often (${best}) than the least wanted finding (${counts.get(least.text) ?? 0})`,
);

console.log(
  `PASS question pool: ${pool.length} questions, each leading to a page the site has; the score orders each kind as intended and the draws keep the mix`,
);
