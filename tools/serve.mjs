// Zero-dependency static server for local development.
//
// Serves the site at the root of the address space, with the model it imports (packages/core/) and the data (data/) at their repository paths,
// exactly as they are deployed (tools/site-addresses.mjs). The pages (/ratings, /methodology/full, …) are the front page, and addresses under
// /site/, where the site used to be, move to the root, as they do live. Given the folder of the built site instead (dist), it serves that folder as
// Cloudflare Pages does: /ratings is ratings.html, and an address with no file gets 404.html with the status 404.
//   node tools/serve.mjs [port] [dist]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDeployHeaders } from './deploy-headers.mjs';
import { repositoryFile } from './site-addresses.mjs';
import { isPagePath } from '../site/js/address.js';
import { GENERATED_FILES } from './generated-files.mjs';
import { readRatings } from './driver-and-team-pages.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HEADERS = (await readDeployHeaders())['/*']; // the live site's headers, so local runs and tests meet the same policy
const PORT = +(process.argv[2] || process.env.PORT || 8000);
const BUILT = process.argv[3] ? join(ROOT, process.argv[3]) : null; // the folder of the built site, if it is the one served
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

let ratings = null; // the ratings the computed files come from (tools/generated-files.mjs), read on first use

/** The file of the built site at an address, as Cloudflare Pages finds it, or null. */
async function builtFile(pathname) {
  for (const candidate of [pathname, `${pathname.replace(/\/+$/, '')}.html`, join(pathname, 'index.html')]) {
    const file = normalize(join(BUILT, candidate));
    if (!file.startsWith(BUILT)) return null;
    if (
      await stat(file).then(
        (found) => found.isFile(),
        () => false,
      )
    )
      return file;
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/site' || url.pathname.startsWith('/site/')) {
    res.writeHead(301, { Location: `${url.pathname.slice('/site'.length) || '/'}${url.search}` }).end();
    return;
  }
  if (BUILT) {
    const file = await builtFile(decodeURIComponent(url.pathname));
    const found = file ?? join(BUILT, '404.html');
    res
      .writeHead(file ? 200 : 404, { ...HEADERS, 'Content-Type': TYPES[extname(found)] || 'application/octet-stream' })
      .end(await readFile(found));
    return;
  }
  if (url.pathname in GENERATED_FILES) {
    ratings ??= readRatings(ROOT); // (read once, at the first request for a computed file)
    res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES['.json'] }).end(GENERATED_FILES[url.pathname](await ratings));
    return;
  }
  const page = isPagePath(url.pathname.replace(/\/+$/, '') || '/'); // a page of the site is the front page with something over it
  let file = normalize(repositoryFile(page ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}/`));
