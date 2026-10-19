// Measures what a first visit costs on a slow phone, the way docs/deployment.md, "Load time and traffic", describes it:
//   node tools/measure-load-time.mjs [chrome-path]
// Headless Chrome loads the site from the local server with the CPU slowed 4 times. The time until the ratings show is measured with the network at
// full speed (that is the parse and decode time); the download time is then computed from the brotli-compressed size of every file the page fetched,
// at 1.6 Mbit/s with 150 ms of latency per sequential round trip (slow 4G) and at 9 Mbit/s (ordinary 4G).
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { brotliCompressSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = process.argv[2] || process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HTTP_PORT = 8777;
const CDP_PORT = 9444;
const CPU_SLOWDOWN = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['tools/serve.mjs', String(HTTP_PORT)], { cwd: ROOT, stdio: 'ignore' });
const profile = await mkdtemp(join(tmpdir(), 'f1elo-measure-'));
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
);
process.on('exit', () => {
  server.kill();
  chrome.kill();
});

let target;
for (let i = 0; i < 50 && !target; i++) {
  try {
    target = (await (await fetch(`http://localhost:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page');
  } catch {
    /* Chrome is still starting */
  }
  if (!target) await sleep(200);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const waiting = new Map();
ws.addEventListener('message', (msg) => {
  const data = JSON.parse(msg.data);
  if (data.id && waiting.has(data.id)) waiting.get(data.id)(data);
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    waiting.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
// The page reports itself: when the ratings show, the time and the files fetched so far (the full history follows in the background).
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `for (const name of ['f1:ratings-ready', 'f1:model-ready'])
    window.addEventListener(name, () => {
      window.__shown ??= { seconds: performance.now() / 1000, files: performance.getEntriesByType('resource').map((entry) => entry.name) };
    });`,
});
const times = [];
let fetchedAtReady = [];
for (let run = 0; run < 3; run++) {
  await send('Page.navigate', { url: 'about:blank' });
  const started = Date.now();
  await send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/site/` });
  let shown;
  while (!(shown = await evaluate('window.__shown'))) {
    if (Date.now() - started > 120000) throw Error('the ratings did not show within 120 s');
    await sleep(50);
  }
  times.push(shown.seconds);
  console.log(
    shown.seconds,
    shown.files.filter((f) => f.includes('/data/')),
    await evaluate('document.getElementById("status").textContent'),
  );
  fetchedAtReady = shown.files
    .map((url) => new URL(url))
    .filter((url) => url.origin === `http://localhost:${HTTP_PORT}`)
    .map((url) => url.pathname);
}
const paths = [...new Set(['/site/', ...fetchedAtReady])]; // what had to arrive before the ratings showed
let compressed = 0;
const rows = [];
for (const path of paths) {
  const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path);
  const size = brotliCompressSync(await readFile(file)).length;
  compressed += size;
  rows.push([path, size]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [path, size] of rows.slice(0, 40)) console.log(`${(size / 1e6).toFixed(2).padStart(6)} MB  ${path}`);
const cpu = Math.min(...times);
const download = (megabitsPerSecond) => (compressed * 8) / (megabitsPerSecond * 1e6);
console.log(`requests ${paths.length}, brotli total ${(compressed / 1e6).toFixed(2)} MB`);
console.log(
  `CPU-bound time with the network at full speed (best of ${times.length}: ${times.map((t) => t.toFixed(1)).join(', ')}): ${cpu.toFixed(1)} s`,
);
console.log(`first visit, slow 4G (1.6 Mbit/s, 150 ms): about ${(cpu + download(1.6) + 0.15).toFixed(1)} s`);
console.log(`first visit, ordinary 4G (9 Mbit/s): about ${(cpu + download(9) + 0.15).toFixed(1)} s`);
process.exit(0);
