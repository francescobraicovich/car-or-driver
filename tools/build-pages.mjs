// Assemble the deployable folder (dist/) for static hosting.
//
// The site imports ../packages/core and fetches the built ratings from ../data, so all three are copied
// side by side; research code, logs, fixtures, the source CSVs and the internal documents are left out. A root index.html
// redirects to site/, and the canonical/og:url tags are filled in from the URL
// given on the command line (the Pages URL).
//
//   node tools/build-pages.mjs [https://user.github.io/repo/]
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDeployHeaders } from './deploy-headers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const base = (process.argv[2] || '').replace(/\/?$/, '/');

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(join(ROOT, 'site'), join(DIST, 'site'), { recursive: true });
await cp(join(ROOT, 'packages/core'), join(DIST, 'packages/core'), { recursive: true });
await mkdir(join(DIST, 'data'));
for (const name of ['model-latest.json', 'model.json', 'export-rows.json', 'teammate-graph.json'])
  await cp(join(ROOT, 'data', name), join(DIST, 'data', name)); // the CSVs the model was computed from are not published
await cp(join(ROOT, 'data/race-laps'), join(DIST, 'data/race-laps'), { recursive: true }); // the laps of each season, for the racing dots
await writeFile(
  join(DIST, 'index.html'),
  '<!doctype html><meta charset="utf-8"><title>Car or Driver</title><meta http-equiv="refresh" content="0; url=./site/"><a href="./site/">Car or Driver</a>\n',
);

// Cloudflare Pages applies this file to every response. It is written from the parsed rules, without the comments, so the published file is exactly the policy.
const rules = await readDeployHeaders();
await writeFile(
  join(DIST, '_headers'),
  `${Object.entries(rules)
    .map(
      ([path, headers]) =>
        `${path}\n${Object.entries(headers)
          .map(([name, value]) => `  ${name}: ${value}`)
          .join('\n')}`,
    )
    .join('\n\n')}\n`,
);
const page = join(DIST, 'site/index.html');
const tags = base === '/' ? '' : `<link rel="canonical" href="${base}">\n<meta property="og:url" content="${base}">`;
const html = await readFile(page, 'utf8');
const marker = /<!-- CANONICAL_TAGS:[^>]*-->/;
if (!marker.test(html)) throw new Error('CANONICAL_TAGS marker missing from site/index.html');
await writeFile(page, html.replace(marker, tags));
console.log(`dist/ ready${tags ? `, canonical ${base}` : ' (no canonical URL given)'}`);
