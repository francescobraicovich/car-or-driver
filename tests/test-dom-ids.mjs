// dom.js looks up every id it lists once at start-up; a missing one becomes null
// and throws the first time a handler touches it. Catch that here, not in a browser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(`${root}site/index.html`, 'utf8');
const dom = readFileSync(`${root}site/js/dom.js`, 'utf8');

const present = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const wanted = [...dom.slice(dom.indexOf('const IDS')).matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
const problems = [];
for (const id of wanted) if (!present.includes(id)) problems.push(`dom.js lists #${id} but site/index.html has no such element`);
for (const id of new Set(present)) if (present.filter((x) => x === id).length > 1) problems.push(`duplicate id #${id} in site/index.html`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`PASS dom ids: ${wanted.length} ids in dom.js all exist once in site/index.html`);
