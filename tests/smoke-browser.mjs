// Browser smoke test: boots the real site in headless Chrome and checks that the
// default model builds, the tables render and nothing throws.
//
//   node tests/smoke-browser.mjs [chrome-path]
//
// Needs Chrome/Chromium (not part of `npm test`, which is Node-only). Starts its
// own static server, so nothing else needs to be running.
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = process.argv[2] || process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HTTP_PORT = 8765;
const CDP_PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['tools/serve.mjs', String(HTTP_PORT)], { cwd: ROOT, stdio: 'ignore' });
const profile = await mkdtemp(join(tmpdir(), 'f1elo-chrome-'));
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
);
const cleanup = () => {
  server.kill();
  chrome.kill();
};
process.on('exit', cleanup);

let target;
for (let i = 0; i < 50 && !target; i++) {
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch {
    /* chrome still starting */
  }
  if (!target) await sleep(200);
}
if (!target) {
  console.error('FAIL could not reach Chrome DevTools');
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const waiting = new Map();
const problems = [];
const requests = []; // every address the page asked for, to prove it never contacts another origin
ws.addEventListener('message', (msg) => {
  const data = JSON.parse(msg.data);
  if (data.id && waiting.has(data.id)) {
    waiting.get(data.id)(data);
    waiting.delete(data.id);
    return;
  }
  if (data.method === 'Network.requestWillBeSent') requests.push(data.params.request.url);
  if (data.method === 'Runtime.exceptionThrown')
    problems.push(`exception: ${data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text}`);
  if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error')
    problems.push(`console: ${data.params.entry.text} ${data.params.entry.url || ''}`);
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    waiting.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.enable');
// start from empty browser storage, so that what the site stores by itself is all that is found later
await send('Storage.clearDataForOrigin', { origin: `http://localhost:${HTTP_PORT}`, storageTypes: 'all' });
await send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/site/` });

for (let i = 0; i < 120; i++) {
  await sleep(1000);
  const status = (await evaluate("document.getElementById('status')?.textContent || ''")) || '';
  if ((await evaluate("document.body.dataset.ready === '1'")) || /failed|Could not/.test(status)) break;
}

const ready = await evaluate("document.body.dataset.ready === '1'");
const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail });
check('model built', ready);

// The site is five pages: Ratings, History, Head to head, Insights, Methodology (Methodology is also linked from the footer)
check(
  'the navigation has exactly Ratings, History, Head to head, Insights and Methodology',
  JSON.stringify(
    await evaluate("[...document.querySelectorAll('#workspaceLinks a')].map((a) => a.querySelector('.label-full').textContent)"),
  ) === JSON.stringify(['Ratings', 'History', 'Head to head', 'Insights', 'Methodology']),
);
check(
  'there is no Home / Research switch and no research page',
  (await evaluate(
    "['modeSimple', 'modeGeek', 'labChart', 'advanced', 'backtest', 'scatter', 'mappingPanel'].every((id) => !document.getElementById(id))",
  )) && (await evaluate('document.body.dataset.mode === undefined')),
);
check(
  'the footer links to Methodology',
  await evaluate("[...document.querySelectorAll('.workspace-footer a')].some((a) => a.getAttribute('href') === '#/methodology')"),
);

// The front page: a red drawing with a white two-line title and a square cursor. Pointing at the car or the hands (or at the matching word) opens a
// box, turns the rest black and white, shows the blue version inside the box, lights the word and shows the ratings; clicking the picture keeps them
// open; the keyboard does the same; nothing wobbles under reduced motion
check('the front page is the default page', (await evaluate('document.body.dataset.page')) === 'home');
check(
  'the front page is not hidden behind the loading screen',
  (await evaluate("getComputedStyle(document.getElementById('veil')).display")) === 'none',
);
const rectangleOfSelector = (selector) =>
  evaluate(
    `(() => { const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
  );
const rectangleOf = (id) => rectangleOfSelector(`#${id}`);
const wordOf = (subject) => rectangleOfSelector(`#stageTitle .title-core .word-${subject}`); // the copies behind the title carry the same classes
const opacityOf = (selector) => evaluate(`getComputedStyle(document.querySelector('${selector}')).opacity`);
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const click = async (x, y) => {
  await mouse('mouseMoved', x, y);
  await mouse('mousePressed', x, y);
  await mouse('mouseReleased', x, y);
};
const press = async (key, code, keyCode, text) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
};
const stageState = () => evaluate("(() => { const s = document.getElementById('stage'); return [s.dataset.state, s.dataset.subject]; })()");
const isState = async (state, subject) => JSON.stringify(await stageState()) === JSON.stringify([state, subject]);
const ledgerRows = () => evaluate("[...document.querySelectorAll('#stageLedgerList .ledger-row')].map((row) => row.textContent)");
const centreOf = (r) => [r.x + r.width / 2, r.y + r.height / 2];
const car = await rectangleOf('hotspotCar');
const hands = await rectangleOf('hotspotDriver');
check(
  'the car and the hands have areas on the screen',
  car.width > 44 && car.height > 44 && hands.width > 44 && hands.height > 44 && car.x + car.width < hands.x,
);
check(
  'the red drawing is all that shows to begin with',
  (await evaluate("getComputedStyle(document.querySelector('.layer-mono')).opacity")) === '0' && (await isState('idle', '')),
);
const wordDriver = await wordOf('driver');
const wordCar = await wordOf('car');
check(
  'the title reads Driver or Car, in white, on two lines',
  (await evaluate("document.getElementById('stageTitle').getAttribute('aria-label')")) === 'Driver or Car' &&
    (await evaluate("getComputedStyle(document.getElementById('stageTitle')).color")) === 'rgb(255, 255, 255)' &&
    wordDriver.y + wordDriver.height <= wordCar.y + 2,
  JSON.stringify({ wordDriver, wordCar }),
);
check(
  'nothing of the ratings or of the lines to the words shows before something is pointed at',
  (await evaluate("document.getElementById('stageLedger').hidden")) && (await opacityOf('#stageWordFrame')) === '0',
);
await mouse('mouseMoved', ...centreOf(car));
await sleep(900);
check(
  'pointing at the car turns the picture black and white and shows the box on the car',
  (await isState('peek', 'car')) && (await opacityOf('.layer-mono')) === '1' && (await opacityOf('.layer-blue')) === '1',
);
const box = await rectangleOf('stageFrame');
check(
  'the box has opened around the car (it wobbles a few pixels, not more)',
  Math.abs(box.x - car.x) < 14 &&
    Math.abs(box.y - car.y) < 14 &&
    Math.abs(box.width - car.width) < 20 &&
    Math.abs(box.height - car.height) < 20,
  JSON.stringify({ box, car }),
);
const hoverRows = await ledgerRows();
check(
  'pointing at the car, without a click, shows the list of cars with their error bars',
  !(await evaluate("document.getElementById('stageLedger').hidden")) && hoverRows.length >= 8 && hoverRows.every((row) => /±\d+/.test(row)),
  `${hoverRows.length} rows`,
);
check(
  'the ratings say they are not yet kept open, and do not offer keys that only work once they are',
  /click the picture to keep this open/.test(await evaluate("document.getElementById('stageLedgerPin').textContent")) &&
    !/j and k/.test(await evaluate("document.getElementById('stageLedgerDetail').textContent")),
);
check(
  'only the word CAR stays lit: the other words are dimmed',
  (await opacityOf('#stageTitle .title-core .word-car')) === '1' &&
    (await opacityOf('#stageTitle .title-core .word-driver')) !== '1' &&
    (await opacityOf('#stageTitle .title-core .word-or')) !== '1',
);
const wordFrame = await rectangleOf('stageWordFrame');
check(
  'the word CAR is boxed',
  (await opacityOf('#stageWordFrame')) === '1' &&
    Math.abs(wordFrame.x - (wordCar.x - 14)) < 10 &&
    Math.abs(wordFrame.y - (wordCar.y - 6)) < 10 &&
    Math.abs(wordFrame.width - (wordCar.width + 28)) < 14,
  JSON.stringify({ wordFrame, wordCar }),
);
const connector = await evaluate("document.getElementById('stageConnectorLine').getAttribute('points').trim().split(/\\s+/).length");
check('a line joins the word to the car', connector >= 2 && (await opacityOf('#stageConnectorEnd')) === '1', `${connector} points`);
await mouse('mouseMoved', 8, 300);
await sleep(500);
check('moving away closes it again when nothing was clicked', await isState('idle', ''));
await mouse('mouseMoved', ...centreOf(wordDriver));
await sleep(700);
const wordRows = await ledgerRows();
check(
  'pointing at the word DRIVER does the same for the drivers',
  (await isState('peek', 'driver')) &&
    wordRows.length > 15 &&
    (await opacityOf('#stageTitle .title-core .word-driver')) === '1' &&
    (await opacityOf('#stageTitle .title-core .word-car')) !== '1',
  `${wordRows.length} rows`,
);
await click(...centreOf(hands));
await sleep(500);
check(
  'clicking the hands keeps the list of drivers open',
  (await isState('open', 'driver')) &&
    /kept open/.test(await evaluate("document.getElementById('stageLedgerPin').textContent")) &&
    /j and k/.test(await evaluate("document.getElementById('stageLedgerDetail').textContent")) &&
    (await evaluate("document.getElementById('hotspotDriver').getAttribute('aria-pressed')")) === 'true',
);
const ledgerBox = await rectangleOf('stageLedger');
const bottomRow = await rectangleOfSelector('.stage-bottom');
check(
  'the list stops above the line of text at the bottom of the screen',
  ledgerBox.y + ledgerBox.height <= bottomRow.y + 1,
  JSON.stringify({ ledgerBox, bottomRow }),
);
await mouse('mouseMoved', 8, 300);
await sleep(500);
check('moving away leaves the list open', await isState('open', 'driver'));
await mouse('mouseMoved', ...centreOf(car));
await sleep(500);
check(
  'pointing at the car while the drivers are kept open shows the cars for as long as the pointer is there',
  await isState('open', 'car'),
);
await mouse('mouseMoved', 8, 300);
await sleep(500);
check('and then goes back to the drivers', await isState('open', 'driver'));
await click(...centreOf(hands));
await sleep(400);
check('clicking the hands again lets go of them', await isState('peek', 'driver'));
await click(8, 300);
await sleep(400);
check('pressing on the picture, away from the car and the hands, lets go of the ratings', await isState('idle', ''));
await click(...centreOf(car));
await sleep(400);
await mouse('mouseMoved', 8, 300);
await press('Escape', 'Escape', 27);
await sleep(500);
check(
  'Escape closes the ratings and the picture goes back to red',
  (await isState('idle', '')) && (await opacityOf('.layer-mono')) === '0',
);
for (let i = 0; i < 12 && (await evaluate('document.activeElement?.id')) !== 'hotspotDriver'; i++) await press('Tab', 'Tab', 9);
check('Tab reaches the hands', (await evaluate('document.activeElement?.id')) === 'hotspotDriver');
check('with the focus on the hands the list of drivers shows and the box is open', await isState('peek', 'driver'));
await press('Enter', 'Enter', 13, '\r');
await sleep(500);
check(
  'Enter on the hands keeps the list of drivers open and moves into it',
  (await isState('open', 'driver')) &&
    (await evaluate("document.activeElement?.classList.contains('ledger-row')")) &&
    (await evaluate("document.querySelectorAll('#stageLedgerList .ledger-row').length")) > 15,
);
await press('j', 'KeyJ', 74, 'j');
check('j moves down the list', (await evaluate('document.activeElement?.dataset.index')) === '1');
check(
  'a list row is read as a sentence, not as bars and arrows',
  await evaluate(
    "[...document.querySelectorAll('#stageLedgerList .ledger-row')].every((row) => /^\\d+, .+, rating \\d+/.test(row.getAttribute('aria-label')) && !/[█░▲▼±]/.test(row.getAttribute('aria-label')))",
  ),
);
await press('Escape', 'Escape', 27);
await sleep(300);
check(
  'Escape from the list closes it and puts the focus back on the hands',
  (await stageState())[0] !== 'open' && (await evaluate('document.activeElement?.id')) === 'hotspotDriver',
);
await evaluate('document.activeElement.blur()');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await mouse('mouseMoved', 8, 300);
await sleep(300);
await mouse('mouseMoved', ...centreOf(car));
await sleep(600);
const still = await rectangleOf('stageFrame');
check(
  'under reduced motion the box does not wobble: it is exactly on the car',
  Math.abs(still.x - car.x) < 1.5 && Math.abs(still.y - car.y) < 1.5 && Math.abs(still.width - car.width) < 1.5,
  JSON.stringify({ still, car }),
);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await mouse('mouseMoved', 8, 300);
await sleep(300);

// Ratings: ranked chart, Cars switch, timeline play
await evaluate("location.hash = '#/ratings'");
await sleep(1000);
check('ratings chart draws a row per driver', (await evaluate("document.querySelectorAll('#ratingsChart .rankrow').length")) > 10);
// uncertainty bars: a whisker (three lines) behind every dot, and the control can switch them off
const barLines = () => evaluate("document.querySelectorAll('#ratingsChart .rankrow line[stroke-linecap=round]').length");
check('uncertainty bars are drawn for the ratings', (await barLines()) >= 3 * 10);
await evaluate("document.getElementById('ratingsSd').click()");
await sleep(200);
check(
  'uncertainty bars can be switched off',
  (await evaluate("document.getElementById('ratingsSd').getAttribute('aria-pressed')")) === 'false',
);
await evaluate("document.getElementById('ratingsSd').click()");
await sleep(200);
await evaluate("document.getElementById('ratingsLayerForm').click()");
await sleep(300);
check(
  'recent-form toggle adds a second dot per driver',
  (await evaluate("document.querySelectorAll('#ratingsChart .rankrow circle').length")) >=
    2 * (await evaluate("document.querySelectorAll('#ratingsChart .rankrow').length")),
);
await evaluate("document.getElementById('ratingsLayerRating').click()");
await sleep(200);
check(
  'rating can be hidden, form stays',
  (await evaluate("document.getElementById('ratingsLayerForm').getAttribute('aria-pressed')")) === 'true',
);
await evaluate("document.getElementById('ratingsLayerRating').click()");
await evaluate("document.getElementById('ratingsLayerForm').click()");
await sleep(200);
await evaluate("document.getElementById('ratingsCars').click()");
await sleep(300);
check('Cars view retitles the chart', /^Car ratings/.test((await evaluate("document.getElementById('ratingsTitle').textContent")) || ''));
// The CSV download fetches its rows (a separate file) and offers a file of the right name and a plausible size
await evaluate(
  'window.__csv = null; const create = URL.createObjectURL; URL.createObjectURL = (blob) => { window.__csv = { size: blob.size }; return create(blob); }; HTMLAnchorElement.prototype.click = function () { if (window.__csv) window.__csv.name = this.download; };',
);
await evaluate("document.getElementById('ratingsExport').click()");
await sleep(2500);
const csv = await evaluate('window.__csv');
check(
  'Download CSV offers driver_or_car_ratings_since_2000_CC-BY-NC-SA-4.0.csv with the rows of every weekend',
  csv?.name === 'driver_or_car_ratings_since_2000_CC-BY-NC-SA-4.0.csv' && csv.size > 1_000_000,
  JSON.stringify(csv),
);
await evaluate("document.getElementById('ratingsDrivers').click()");
await evaluate(
  "(() => { const s = document.getElementById('ratingsScrub'); s.value = 0; s.dispatchEvent(new Event('input', { bubbles: true })); })()",
);
await sleep(300);
await evaluate("document.getElementById('ratingsPlay').click()");
await sleep(700);
const moved = await evaluate("+document.getElementById('ratingsScrub').value");
await evaluate("document.getElementById('ratingsPlay').click()");
check('play advances the timeline', moved > 0, `index ${moved}`);

// History: lines, chips, table twin
await evaluate("location.hash = '#/history'");
await sleep(1200);
check(
  'history draws one line per chip',
  (await evaluate("document.querySelectorAll('#driverChart polyline').length")) >=
    (await evaluate("document.querySelectorAll('#historyChips .chip').length")) &&
    (await evaluate("document.querySelectorAll('#historyChips .chip').length")) >= 3,
);
await evaluate("document.getElementById('historyTableView').click()");
await sleep(300);
check('history table lists seasons', (await evaluate("document.querySelectorAll('#historyTable tbody tr').length")) > 10);
// A renamed team is one car: Racing Point became Aston Martin, and the list offers one line that spans both
await evaluate("document.getElementById('historyChartView').click()");
await evaluate("document.getElementById('historyCars').click()");
await sleep(400);
const offered = (query) =>
  evaluate(`(() => {
    const input = document.querySelector('#historyChips .adder input');
    input.value = '${query}';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('#historyChips .adder-list button')].map((b) => b.textContent);
  })()`);
const aston = await offered('Aston');
const racing = await offered('Racing Point');
check(
  'a renamed team is one car in History',
  aston.length === 1 && /20(0|1)\d.20\d\d$/.test(aston[0]) && racing.length === 0,
  JSON.stringify([aston, racing]),
);
await evaluate("document.getElementById('historyDrivers').click()");

// Comparing: two drivers selected on Ratings become exactly two lines in History, and the two sides of Head to head
await evaluate("location.hash = '#/ratings'");
await sleep(800);
const pickRow = (position) =>
  evaluate(`document.querySelectorAll('#ratingsChart .rankrow')[${position}].dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
const pickedNames = await evaluate(
  "[...document.querySelectorAll('#ratingsChart .rankrow')].slice(0, 2).map((row) => row.querySelector('text:nth-of-type(2)').textContent)",
);
await pickRow(0);
await pickRow(1);
check(
  'selecting two rows shows the selection bar with both names',
  (await evaluate("document.getElementById('ratingsSelection').hidden")) === false &&
    (await evaluate("document.getElementById('ratingsSelectionNames').textContent")).startsWith('2 selected'),
);
check(
  'Head to head is offered only for exactly two drivers',
  (await evaluate("document.getElementById('ratingsCompareHeadToHead').disabled")) === false,
);
await evaluate("document.getElementById('ratingsCompareHistory').click()");
await sleep(800);
const chipNames = await evaluate("[...document.querySelectorAll('#historyChips .chip')].map((chip) => chip.textContent.replace('×', ''))");
check(
  'Compare in history opens History with exactly the selected drivers',
  chipNames.length === 2 && JSON.stringify(chipNames.slice().sort()) === JSON.stringify(pickedNames.slice().sort()),
  JSON.stringify({ chipNames, pickedNames }),
);
await evaluate("location.hash = '#/ratings'");
await sleep(600);
await evaluate("document.getElementById('ratingsCompareHeadToHead').click()");
await sleep(800);
const sides = await evaluate(
  "['headToHeadA', 'headToHeadB'].map((id) => document.getElementById(id).selectedOptions[0].textContent.split(' · ')[0])",
);
check(
  'Head to head from Ratings sets driver A and driver B',
  JSON.stringify(sides.slice().sort()) === JSON.stringify(pickedNames.slice().sort()),
  JSON.stringify({ sides, pickedNames }),
);
await evaluate("location.hash = '#/ratings'");
await sleep(300);
await evaluate("document.getElementById('ratingsClearSelection').click()");

// Head to head and Methodology
await evaluate("location.hash = '#/head-to-head'");
await sleep(1200);
check(
  'head to head shows a probability',
  /\d+%/.test((await evaluate("document.querySelector('.head-to-head-figures')?.textContent || ''")) || ''),
);
// What-if: choose a career moment for driver B and wet conditions
await evaluate(
  "(() => { const w = document.getElementById('headToHeadWhenB'); w.value = 'prime'; w.dispatchEvent(new Event('change', { bubbles: true })); const c = document.getElementById('headToHeadWet'); c.value = 'wet'; c.dispatchEvent(new Event('change', { bubbles: true })); })()",
);
await sleep(400);
check(
  'what-if matchup shows its parts and a probability',
  /\d+%/.test((await evaluate("document.querySelector('.head-to-head-figures')?.textContent || ''")) || '') &&
    (await evaluate("document.querySelectorAll('.head-to-head-parts tbody tr').length")) >= 3,
);
await evaluate("location.hash = '#/insights'");
await sleep(1500);
check(
  'insights shows its findings with a drawn chart in each',
  (await evaluate("document.querySelectorAll('#insightsBody article.insight').length")) === 20 &&
    (await evaluate("[...document.querySelectorAll('#insightsBody article.insight')].every((a) => a.querySelector('svg, table'))")) &&
    !(await evaluate("/undefined|NaN/.test(document.getElementById('insightsBody').textContent)")),
);
await evaluate("location.hash = '#/methodology'");
await sleep(1200);
check(
  'methodology fills the accuracy figure',
  /\d+%/.test((await evaluate("document.getElementById('methodologyAccuracy')?.textContent || ''")) || ''),
);
check(
  'methodology scores the ratings alone against a coin flip',
  /^0\.\d{3}/.test((await evaluate("document.getElementById('methodologyRatingsValue')?.textContent || ''")) || '') &&
    /^0\.693/.test((await evaluate("document.getElementById('methodologyCoinValue')?.textContent || ''")) || '') &&
    (await evaluate("document.querySelectorAll('#methodologyRatingsChart polyline').length")) >= 2,
);
check(
  'methodology draws the odds curve, the error bar by experience and one rating with its band',
  (await evaluate("document.querySelectorAll('#methodologyOddsChart polyline').length")) === 1 &&
    (await evaluate("document.querySelectorAll('#methodologyUncertaintyChart polygon').length")) === 1 &&
    (await evaluate("document.querySelectorAll('#methodologyTimelineChart polygon').length")) === 1,
);
check(
  'the Methodology page does not mention Elo',
  !(await evaluate("/\\bElo\\b/i.test(document.getElementById('methodology').textContent)")),
);
check(
  'methodology has its eight parts, the overview diagram, the settings tables and no unfilled placeholders',
  (await evaluate("document.querySelectorAll('#methodologyBody .method-part').length")) === 8 &&
    (await evaluate("document.querySelectorAll('#methodologyBody .flow-stage').length")) >= 6 &&
    (await evaluate("document.querySelectorAll('#methodologyParams tbody tr').length")) >= 24 &&
    (await evaluate("document.querySelectorAll('#methodologyScoring tbody tr:not(.group)').length")) === 21 &&
    (await evaluate("document.querySelectorAll('#methodologyWindows tr').length")) === 4 &&
    !(await evaluate("/\\{\\{|undefined|NaN/.test(document.getElementById('methodologyBody').textContent)")),
);
// Formulas are typeset by KaTeX, which the site serves itself.
await sleep(3000);
const mathTotal = await evaluate("document.querySelectorAll('#methodologyBody .math').length");
const mathDone = await evaluate("document.querySelectorAll('#methodologyBody .math.typeset .katex').length");
const mathBad = await evaluate("document.querySelectorAll('#methodologyBody .katex-error').length");
check(
  'every formula is typeset without errors',
  mathTotal > 50 && mathDone === mathTotal && mathBad === 0,
  `${mathDone}/${mathTotal}, ${mathBad} errors`,
);

// The chosen weekend survives a reload, and hashes from the old site land on the pages that replaced them
await evaluate("location.hash = '#/ratings'");
await sleep(500);
await evaluate(
  "(() => { const s = document.getElementById('ratingsSeason'); s.value = '2015'; s.dispatchEvent(new Event('change', { bubbles: true })); })()",
);
await sleep(500);
const chosen = await evaluate("document.getElementById('ratingsTitle').textContent");
const hash = await evaluate('location.hash');
check('choosing a season puts the weekend in the URL', /^#\/ratings\?v=1&.*race=/.test(hash) && /2015/.test(chosen), `${hash} / ${chosen}`);
await send('Page.reload');
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  if (await evaluate("document.body.dataset.ready === '1'")) break;
}
await sleep(500);
check(
  'the weekend is still the same after a reload',
  (await evaluate("document.getElementById('ratingsTitle')?.textContent")) === chosen,
  await evaluate("document.getElementById('ratingsTitle')?.textContent"),
);
const landing = async (hash) => {
  await evaluate(`location.hash = '${hash}'`);
  await sleep(500);
  return evaluate("document.body.dataset.page + ' ' + document.querySelectorAll('.workspace-page:not([hidden])').length");
};
for (const [from, to] of [
  ['#/simple/ratings', 'ratings'],
  ['#/simple/history?v=1&mode=simple', 'history'],
  ['#/geek/explore', 'history'],
  ['#/geek/weekend', 'ratings'],
  ['#/geek/data', 'ratings'],
  ['#/geek/models', 'methodology'],
  ['#/how-it-works', 'methodology'],
  ['#/predictor', 'head-to-head'],
]) {
  const got = await landing(from);
  check(`the old address ${from} opens ${to}`, got === `${to} 1`, got);
}

// Compliance (see docs/compliance.md): the site talks only to its own origin, sets no cookies, stores nothing until the visitor presses the theme
// button (and then one value, which the Privacy page lets them remove), and its legal pages are there
const ownOrigin = `http://localhost:${HTTP_PORT}/`;
const foreign = requests.filter((url) => !url.startsWith(ownOrigin) && !url.startsWith('data:'));
check(
  'the site requested nothing from another origin',
  foreign.length === 0,
  `${requests.length} requests; ${foreign.slice(0, 3).join(' ')}`,
);
check(
  'the site set no cookies',
  (await send('Network.getAllCookies')).result.cookies.length === 0 && (await evaluate('document.cookie')) === '',
);
check(
  'nothing is stored in the browser before the theme button is pressed',
  (await evaluate('localStorage.length + sessionStorage.length')) === 0,
  await evaluate('JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage)])'),
);
await evaluate("document.getElementById('themeToggle').click()");
check(
  'pressing the theme button stores one value, f1-theme',
  JSON.stringify(await evaluate('Object.keys(localStorage)')) === JSON.stringify(['f1-theme']),
);
await evaluate("location.hash = '#/privacy'");
await sleep(800);
check(
  "the Privacy page names the controller's regulator, the host and the stored value, and has the forget button",
  await evaluate(
    "(() => { const text = document.getElementById('privacyBody').textContent; return ['Garante', 'Information Commissioner', 'Cloudflare', 'f1-theme', 'no cookies'].every((word) => text.includes(word)) && !!document.getElementById('forgetTheme'); })()",
  ),
);
await evaluate("document.getElementById('forgetTheme').click()");
check('the forget button removes the stored theme', (await evaluate('localStorage.length')) === 0);
await evaluate("location.hash = '#/about'");
await sleep(800);
check(
  'the About page credits the data sources and gives the licence',
  await evaluate(
    "(() => { const text = document.getElementById('aboutBody').textContent; return ['TracingInsights', 'Jolpica', 'Ergast', 'CC BY-NC-SA 4.0', 'non-commercial', 'Inter', 'KaTeX'].every((word) => text.includes(word)); })()",
  ),
);
check(
  'no link outside the navigation carries an icon',
  (await evaluate("document.querySelectorAll('main a svg, footer a svg').length")) === 0,
);
check(
  'the footer links to Methodology, Privacy and About',
  JSON.stringify(await evaluate("[...document.querySelectorAll('.workspace-footer a')].map((a) => a.getAttribute('href'))")) ===
    JSON.stringify(['#/methodology', '#/privacy', '#/about']),
);

// A phone: no page scrolls sideways, and the five pages are a tab bar fixed to the bottom of the screen
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await sleep(500);
check(
  'on a phone the navigation is fixed to the bottom of the screen',
  (await evaluate("getComputedStyle(document.getElementById('workspaceLinks')).position")) === 'fixed',
);
for (const page of ['home', 'ratings', 'history', 'head-to-head', 'insights', 'methodology', 'privacy', 'about']) {
  await evaluate(`location.hash = '#/${page}'`);
  await sleep(1200);
  const [scroll, inner] = await evaluate('[document.documentElement.scrollWidth, window.innerWidth]');
  check(`on a phone ${page} does not scroll sideways`, scroll <= inner, `${scroll} wide in ${inner}`);
}
await send('Emulation.clearDeviceMetricsOverride');

for (const c of checks) console.log(`${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
const ok = checks.every((c) => c.pass) && problems.length === 0;
if (problems.length) console.error(problems.join('\n'));
console.log(ok ? 'PASS browser smoke test' : 'FAIL browser smoke test');
cleanup();
process.exit(ok ? 0 : 1);
