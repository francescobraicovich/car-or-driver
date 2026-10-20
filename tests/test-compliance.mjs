// The privacy notice is only true while the site behaves as it says. This checks the files, so the notice cannot drift from the site (the browser
// smoke test checks the running site: no request to another origin, no cookie, one stored value after a click). What is checked, and why, is in
// docs/compliance.md.
//   1. Nothing the site loads comes from another origin: no absolute address in a stylesheet, script, image, font or import, in the page, the
//      scripts or the stylesheet. (Links a visitor may follow are allowed; they leave the site only when clicked.)
//   2. The browser's storage is used in one place, theme.js, which writes one key, and only when the visitor presses the button.
//   3. The response headers forbid loading from another origin and send no referrer.
//   4. The third-party files that are served carry their licences and a notice naming the source.
//   5. Every citation in the Methodology has an entry, and every entry says who, when and where.
//   6. The published data files carry the licence notice; what is published contains neither the source tables nor the internal documents.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readDeployHeaders } from '../tools/deploy-headers.mjs';
import { deserialize } from '../packages/core/src/json-serialization.js';

const read = (file) => readFile(file, 'utf8');
const walk = async (directory) =>
  (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? walk(join(directory, e.name)) : [join(directory, e.name)],
      ),
    )
  ).flat();

// 1. nothing is loaded from another origin
const html = await read('site/index.html');
for (const tag of html.match(/<(?:link|script|img|source|iframe|audio|video)\b[^>]*>/gi) ?? []) {
  const address = tag.match(/\b(?:src|href)="([^"]+)"/i)?.[1];
  if (address && /^(?:https?:)?\/\//i.test(address)) assert.fail(`site/index.html loads ${address} from another origin: ${tag}`);
}
const scripts = (await walk('site/js')).filter((file) => !/insights-data\.js$/.test(file));
for (const file of scripts) {
  const text = await read(file);
  const loading = text.match(
    /\b(?:fetch|import|importScripts|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(\s*[`'"](?:https?:)?\/\/[^`'"]+/g,
  );
  assert.equal(loading, null, `${file} loads something from another origin: ${loading}`);
  for (const match of text.matchAll(/\b(?:src|href)\s*=\s*[`'"]((?:https?:)?\/\/[^`'"]+)/g)) {
    if (!/^(?:https?:)?\/\/(?!www\.w3\.org)/.test(match[1])) continue;
    // a link inside the legal and Methodology text is something the visitor clicks; every other assignment would load
    assert.ok(/legal-content|methodology-content/.test(file), `${file} assigns ${match[1]} to a source or address`);
  }
}
for (const file of [...scripts.filter((f) => /legal-content|methodology-content/.test(f))]) {
  const text = await read(file);
  assert.equal(
    text.match(/<(?:script|img|iframe|link|source|audio|video)\b[^>]*(?:src|href)="(?:https?:)?\/\//gi),
    null,
    `${file} embeds a resource from another origin`,
  );
}
const css = await read('site/css/styles.css');
assert.equal(css.match(/@import|url\(\s*['"]?(?:https?:)?\/\//gi), null, 'the stylesheet loads nothing from another origin');
for (const file of ['site/vendor/fonts/fonts.css', 'site/vendor/katex/katex.min.css'])
  assert.equal((await read(file)).match(/@import|url\(\s*['"]?(?:https?:)?\/\//gi), null, `${file} loads nothing from another origin`);

// 2. storage
const storageUsers = [];
for (const file of scripts)
  if (/\b(?:localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open|navigator\.serviceWorker)\b/.test(await read(file)))
    storageUsers.push(relative('.', file));
assert.deepEqual(storageUsers, ['site/js/theme.js'], 'only theme.js may use the browser storage');
const theme = await read('site/js/theme.js');
assert.equal((theme.match(/localStorage\.setItem/g) ?? []).length, 1, 'one write');
assert.ok(
  theme.indexOf('localStorage.setItem') > theme.indexOf("addEventListener('click'"),
  'the write happens in the click handler, not at load',
);
assert.match(theme, /STORAGE_KEY = 'f1-theme'/);

// 3. headers
const headers = (await readDeployHeaders())['/*'];
const policy = headers['Content-Security-Policy'];
assert.match(policy, /default-src 'none'/);
assert.match(policy, /script-src 'self'(?:;|$)/);
assert.doesNotMatch(policy, /unsafe-eval|https?:|\*/, 'the policy names no other origin and allows no eval');
assert.equal(headers['Referrer-Policy'], 'no-referrer');
assert.equal(headers['X-Content-Type-Options'], 'nosniff');

// 4. third-party files and their licences
for (const file of ['inter-OFL-1.1.txt', 'space-grotesk-OFL-1.1.txt', 'lexend-giga-OFL-1.1.txt', 'katex-MIT.txt'])
  assert.ok(existsSync(`site/vendor/licenses/${file}`), `licence ${file}`);
const notice = await read('site/vendor/NOTICE.txt');
for (const word of ['Inter', 'Space Grotesk', 'Lexend Giga', 'KaTeX', 'SIL Open Font License', 'MIT'])
  assert.ok(notice.includes(word), `NOTICE.txt names ${word}`);
for (const file of await walk('site/vendor')) {
  if (/\.(woff2|js|css|txt)$/.test(file)) continue;
  assert.fail(`unexpected file in site/vendor: ${file}`);
}

// 5. citations
const methodology = await read('site/js/methodology-content.js');
const cited = new Set([...methodology.matchAll(/data-jump="ref-(\d+)"/g)].map((m) => m[1]));
const entries = new Map([...methodology.matchAll(/<li id="ref-(\d+)">([\s\S]*?)<\/li>/g)].map((m) => [m[1], m[2]]));
for (const number of cited) assert.ok(entries.has(number), `reference ${number} is cited but not listed`);
assert.ok(entries.size >= 15 && cited.size >= 8, `${entries.size} references, ${cited.size} cited in the text`);
for (const [number, text] of entries) {
  assert.match(text, /\((?:19|20)\d\d\)|Retrieved/, `reference ${number} gives a year`);
  assert.match(text, /doi\.org|https:\/\/|Princeton|Academic Press/, `reference ${number} says where to find it`);
}
for (const method of ['Bradley', 'Kalman', 'Fahrmeir', 'Brier', 'Gneiting', 'Tashman', 'Shapley', 'McFadden', 'Efron', 'Spearman'])
  assert.ok(
    [...entries.values()].some((text) => text.includes(method)),
    `${method} is in the reference list`,
  );
const insights = await read('site/js/insights-cards.js');
for (const author of [
  'Shapley 1953',
  'McFadden 1974',
  'Shrout and Fleiss 1979',
  'Cox 1958',
  'Efron 1979',
  'Spearman 1904',
  'Plackett 1975',
])
  assert.ok(insights.includes(author), `the Insights notes cite ${author}`);

// 6. what is published
for (const file of ['data/model.json', 'data/model-latest.json', 'data/export-rows.json']) {
  const { licence } = deserialize(await read(file));
  assert.equal(licence?.licence, 'CC BY-NC-SA 4.0', `${file} carries the licence`);
  assert.ok(licence.credit.includes('Jolpica') && licence.credit.includes('TracingInsights'), `${file} carries the credit`);
}
// the laps of each season carry the same licence and credit, and the outlines carry theirs: the credit, and the MIT licence text of their source
for (const file of (await readdir('data/race-laps')).filter((name) => name.endsWith('.json'))) {
  const { licence } = JSON.parse(await read(`data/race-laps/${file}`));
  assert.equal(licence?.licence, 'CC BY-NC-SA 4.0', `data/race-laps/${file} carries the licence`);
  assert.ok(licence.credit.includes('Jolpica') && licence.credit.includes('TracingInsights'), `data/race-laps/${file} carries the credit`);
}
const tracksCredit = JSON.parse(await read('site/assets/tracks.json')).credit;
assert.ok(
  /MIT/.test(tracksCredit) && /Bacinger/.test(tracksCredit) && /not approved or endorsed/i.test(tracksCredit),
  'the outlines carry their credit and the disclaimer',
);
const tracksLicence = await read('site/assets/tracks-licence.txt');
assert.ok(
  /Copyright \(c\) 2019-2025 Tomislav Bacinger/.test(tracksLicence) && /Permission is hereby granted/.test(tracksLicence),
  'the MIT licence text of the outlines is published with them',
);
assert.equal(tracksLicence, await read('data/source/f1-circuits/LICENSE.md'), "and is the source's own");
assert.ok((await read('site/js/legal-content.js')).includes('bacinger/f1-circuits'), 'the About page credits the source of the outlines');
try {
  const run = spawnSync(process.execPath, ['tools/build-pages.mjs', 'https://example.test/'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const published = (await walk('dist')).map((file) => relative('dist', file));
  assert.ok(!published.some((file) => file.endsWith('.csv')), 'the source tables are not published');
  assert.ok(published.includes('_headers'), 'the headers file is published');
  for (const file of ['site/assets/tracks.json', 'site/assets/tracks-licence.txt', 'data/race-laps/2026.json'])
    assert.ok(published.includes(file), `${file} is published`);
  assert.ok(
    !published.some((file) => file.startsWith('data/source/')),
    'the source files of the outlines are not published (their outlines are, in tracks.json)',
  );
  assert.ok(
    !published.some((file) => file.startsWith('docs/') || file.startsWith('research/') || file.startsWith('tests/')),
    'no internal documents are published',
  );
  const rules = await readDeployHeaders();
  const written = await read('dist/_headers');
  assert.ok(!written.includes('#'), 'the published _headers has no comments');
  for (const [name, value] of Object.entries(rules['/*']))
    assert.ok(written.includes(`  ${name}: ${value}`), `the published _headers carries ${name}`);
  assert.ok(!published.some((file) => /deployment|compliance|NOTICE\.md/.test(file)), 'no internal plan or compliance record is published');
} finally {
  await rm('dist', { recursive: true, force: true });
}
console.log(
  'PASS compliance: no request to another origin, one stored value on a click, strict headers, licences shipped, citations complete, only intended files published',
);
