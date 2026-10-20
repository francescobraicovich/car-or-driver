// Checks the deployed site against what the privacy notice says, because the tests run on a local server and a host can add things a local server
// never does (a cookie from a bot-protection feature, an injected script, a missing header). Run it after every deploy:
//   node tools/check-live-site.mjs https://driver-or-car.pages.dev/
// It fetches the home page, every file the page names, and the data files, and fails if any response sets a cookie, if the security headers are
// missing or different from tools/deploy-headers.txt, or if the page loads or embeds anything from another origin or from the host's own scripts
// (/cdn-cgi/). It also tells you what it cannot see: scripts that run in a browser; open the site once with the browser's developer tools
// (Application: Cookies and Local storage empty; Network: only your own domain) as the last check.
import { readDeployHeaders } from './deploy-headers.mjs';

const base = new URL(process.argv[2] ?? '', 'https://invalid.example/');
if (!process.argv[2]) {
  console.error('usage: node tools/check-live-site.mjs https://your-domain/');
  process.exit(2);
}
const home = new URL('site/', base);
const expected = (await readDeployHeaders())['/*'];
const problems = [];

async function get(url, attempts = 6) {
  for (let i = 1; ; i++) {
    try {
      const response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
      if (response.ok || i >= attempts) return response;
    } catch (error) {
      if (i >= attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10000)); // a new deployment can take a moment to reach every server
  }
}

function checkResponse(url, response) {
  const where = url.pathname;
  if (!response.ok) return problems.push(`${where}: HTTP ${response.status}`);
  if (response.headers.get('set-cookie'))
    problems.push(`${where}: the response sets a cookie (${response.headers.get('set-cookie').split('=')[0]})`);
  for (const [name, value] of Object.entries(expected)) {
    const got = response.headers.get(name);
    if (got !== value) problems.push(`${where}: header ${name} is ${got === null ? 'missing' : `"${got}"`}, expected "${value}"`);
  }
}

const homeResponse = await get(home);
checkResponse(home, homeResponse);
const html = await homeResponse.text();

for (const tag of html.match(/<(?:link|script|img|iframe|source)\b[^>]*>/gi) ?? []) {
  const address = tag.match(/\b(?:src|href)="([^"]+)"/i)?.[1];
  if (address && new URL(address, home).origin !== home.origin) problems.push(`the page loads ${address} from another origin: ${tag}`);
  if (/^<script\b/i.test(tag) && !/\bsrc=/.test(tag) && !/ld\+json/.test(tag)) problems.push(`the page contains an inline script: ${tag}`);
}
if (/\/cdn-cgi\//.test(html))
  problems.push(
    "the page contains a script or link from the host's /cdn-cgi/ path (an injected feature such as email obfuscation or analytics)",
  );
if (/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>/i.test(html)) problems.push('the page has an inline script');

const files = new Set(
  [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map((m) => m[1]).filter((address) => !/^(?:[a-z]+:|\/\/|#)/i.test(address)),
);
for (const extra of [
  '../data/model-latest.json',
  '../data/model.json',
  '../data/export-rows.json',
  '../data/race-laps/2026.json',
  './assets/tracks.json',
  './assets/tracks-licence.txt',
  './vendor/NOTICE.txt',
])
  files.add(extra);
for (const address of files) {
  const url = new URL(address, home);
  checkResponse(url, await get(url));
}

if (problems.length) {
  console.error([...new Set(problems)].join('\n'));
  console.error(`FAIL live site: ${new Set(problems).size} problem(s) at ${home.href}`);
  process.exit(1);
}
console.log(
  `PASS live site: ${files.size + 1} responses from ${home.origin} set no cookie and carry the policy headers; the page loads nothing from another origin`,
);
