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
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.enable');
// start from empty browser storage, so that what the site stores by itself is all that is found later
await send('Storage.clearDataForOrigin', { origin: `http://localhost:${HTTP_PORT}`, storageTypes: 'all' });
await send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/site/` });

for (let i = 0; i < 120; i++) {
  await sleep(1000);
  const status = (await evaluate("document.querySelector('.stage-tagline')?.textContent || ''")) || '';
  if ((await evaluate("document.body.dataset.ready === '1'")) || /failed|Could not/.test(status)) break;
}

const ready = await evaluate("document.body.dataset.ready === '1'");
const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail });
check('model built', ready);

// The site is the front page and what opens over it: the links at its top are Ratings, History, Versus, Graph, Insights and Method, and the links at its foot
// are Privacy, About and the source. Nothing of the old pages (header, loading screen, status line, footer, share button, theme button) is left.
check(
  'the links at the top of the front page are exactly ratings, history, versus, graph, insights and method',
  JSON.stringify(await evaluate("[...document.querySelectorAll('.stage-top a')].map((a) => a.textContent)")) ===
    JSON.stringify(['ratings', 'history', 'versus', 'graph', 'insights', 'method']),
);
check(
  'nothing of the old pages is left: no header, loading screen, status line, footer, share button or theme button',
  await evaluate(
    "['veil', 'status', 'statusPill', 'workspaceLinks', 'shareView', 'shareURL', 'themeToggle'].every((id) => !document.getElementById(id)) && !document.querySelector('.site-nav, .workspace-footer, .workspace-status, .workspace-page') && document.body.dataset.surface === undefined",
  ),
);
check(
  'there is no Home / Research switch and no research page',
  (await evaluate(
    "['modeSimple', 'modeGeek', 'labChart', 'advanced', 'backtest', 'scatter', 'mappingPanel'].every((id) => !document.getElementById(id))",
  )) && (await evaluate('document.body.dataset.mode === undefined')),
);
check(
  'the foot of the front page links to Privacy, About and the source',
  JSON.stringify(await evaluate("[...document.querySelectorAll('.stage-footer-links a')].map((a) => a.getAttribute('href'))")) ===
    JSON.stringify(['#/privacy', '#/about', 'https://github.com/francescobraicovich/car-or-driver']),
);

// The front page: a red drawing with a white two-line title and a square cursor. Pointing at the car or the hands (or at the matching word) opens a
// box, turns the rest black and white, shows the blue version inside the box, lights the word and shows the ratings; clicking the picture keeps them
// open; the keyboard does the same; nothing wobbles under reduced motion
check('the front page is the default page', (await evaluate('document.body.dataset.page')) === 'home');
const rectangleOfSelector = (selector) =>
  evaluate(
    `(() => { const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
  );
const rectangleOf = (id) => rectangleOfSelector(`#${id}`);
const wordOf = (subject) => rectangleOfSelector(`#stageTitle .title-core .word-${subject}`); // the copies behind the title carry the same classes
const opacityOf = (selector) => evaluate(`getComputedStyle(document.querySelector('${selector}')).opacity`);
// the title is drawn once for each way it can look, and the style sheet shows one of them (by its clip): which are shown now
const shownLooks = () =>
  evaluate(
    "[...document.querySelectorAll('#stageTitle .title-variant')].filter((v) => !getComputedStyle(v).clipPath.startsWith('inset(100%')).map((v) => v.className.replace('title-variant ', '')).join(' + ')",
  );
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
const chartRows = () => evaluate("document.querySelectorAll('#ratingsList .ledger-row').length");
const panelTitle = () => evaluate("document.getElementById('ratingsTitle').textContent");
const centreOf = (r) => [r.x + r.width / 2, r.y + r.height / 2];
// A short window, where the ratings are a sheet that can reach the pictures: pointing at the car must stay open (the sheet used to cover the spot,
// so the pointer left the car, the sheet closed, and it opened again).
const shortCar = await rectangleOf('hotspotCar');
check('a narrow window lays the ratings out as a sheet', (await evaluate("document.getElementById('stage').dataset.layout")) === 'sheet');
await mouse('mouseMoved', ...centreOf(shortCar));
const sampled = [];
for (let i = 0; i < 8; i++) {
  await sleep(150);
  sampled.push(JSON.stringify(await stageState()));
}
check(
  'pointing at the car in a short window is stable: it does not open and close by itself',
  sampled.every((state) => state === JSON.stringify(['peek', 'car'])),
  sampled.join(' '),
);
check(
  'in a narrow window the track is not shown',
  (await evaluate("getComputedStyle(document.getElementById('stageTrack')).display")) === 'none',
);
await mouse('mouseMoved', 8, 20);
await sleep(300);
// The rest at the size of a laptop screen, where the ratings are a column beside the pictures.
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(700);
check('a wide window lays the ratings out as a column', (await evaluate("document.getElementById('stage').dataset.layout")) === 'wide');
const car = await rectangleOf('hotspotCar');
const hands = await rectangleOf('hotspotDriver');
check(
  'the car and the hands have areas on the screen',
  car.width > 44 && car.height > 44 && hands.width > 44 && hands.height > 44 && car.x + car.width < hands.x,
);
check(
  'the red drawing is all that shows to begin with',
  (await evaluate("getComputedStyle(document.querySelector('.layer-mono')).opacity")) === '0' &&
    (await isState('idle', '')) &&
    (await shownLooks()) === 'ink-light',
);
const wordDriver = await wordOf('driver');
const wordCar = await wordOf('car');
check(
  'the title reads Car or Driver, in white, on two lines',
  (await evaluate("document.getElementById('stageTitle').getAttribute('aria-label')")) === 'Car or Driver' &&
    (
      await evaluate(
        "[...document.querySelectorAll('#stageTitle .title-core .title-line')].map((line) => line.textContent.replace(/\\s+/g, ' ').trim())",
      )
    )?.join('|') === 'CAR OR|DRIVER' &&
    (await evaluate(
      "[document.title, document.querySelector('meta[property=\\\"og:title\\\"]')?.content, document.querySelector('meta[name=\\\"twitter:title\\\"]')?.content].join('|')",
    )) === 'Car or Driver|Car or Driver|Car or Driver' &&
    (await evaluate("getComputedStyle(document.getElementById('stageTitle')).color")) === 'rgb(255, 255, 255)' &&
    wordCar.y + wordCar.height <= wordDriver.y + 2,
  JSON.stringify({ wordDriver, wordCar }),
);
const bottomLinks = await evaluate(
  "(() => { const width = document.getElementById('stage').getBoundingClientRect().width; const boxes = [...document.querySelectorAll('.stage-footer-links a')].map((a) => a.getBoundingClientRect()); return { names: [...document.querySelectorAll('.stage-footer-links a')].map((a) => a.textContent.toLowerCase()), width, left: boxes[0].left, middle: (boxes[1].left + boxes[1].right) / 2, right: boxes[2].right }; })()",
);
check(
  'the bottom row is privacy at the left, about in the middle and source at the right, and has no sentence',
  JSON.stringify(bottomLinks.names) === JSON.stringify(['privacy', 'about', 'source']) &&
    bottomLinks.left < 90 &&
    Math.abs(bottomLinks.middle - bottomLinks.width / 2) < 2 &&
    bottomLinks.right > bottomLinks.width - 90 &&
    (await evaluate("document.querySelector('.stage-tagline').textContent.trim()")) === '' &&
    (await evaluate("[...document.querySelectorAll('.stage-bottom p.sr-only')].every((p) => p.getBoundingClientRect().width <= 1)")), // the sentence is for screen readers only
  JSON.stringify(bottomLinks),
);
check(
  'nothing darkens the top and the bottom of the front page',
  await evaluate(
    "['.stage-top', '.stage-bottom'].map((s) => getComputedStyle(document.querySelector(s), '::before').content).every((c) => c === 'none' || c === 'normal')",
  ),
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
const hoverRows = await chartRows();
check(
  'pointing at the car, without a click, shows the ratings panel with the cars ranked',
  !(await evaluate("document.getElementById('stageLedger').hidden")) && hoverRows >= 8 && /^Car ratings/.test(await panelTitle()),
  `${hoverRows} rows`,
);
const hint = await rectangleOfSelector('#stageFrame .stage-frame-hint');
const boxNow = await rectangleOf('stageFrame');
check(
  'under the blue box it says "click to open", and it moves with the box; the panel has no Close button yet',
  (await opacityOf('.stage-frame-hint')) === '1' &&
    /^click to open$/i.test(await evaluate("document.querySelector('.stage-frame-hint').textContent")) &&
    hint.y >= boxNow.y + boxNow.height - 1 &&
    Math.abs(hint.x - boxNow.x) < 6 &&
    (await evaluate("document.getElementById('stageLedgerClose').hidden")),
  JSON.stringify({ hint, boxNow }),
);
check(
  'the box on the word and the line to the picture are blue like the box on the picture',
  (await evaluate("getComputedStyle(document.getElementById('stageWordFrame')).borderTopColor")) ===
    (await evaluate("getComputedStyle(document.getElementById('stageFrame')).borderTopColor")) &&
    (await evaluate("getComputedStyle(document.getElementById('stageConnectorLine')).stroke")) ===
      (await evaluate("getComputedStyle(document.getElementById('stageFrame')).borderTopColor")),
);
check(
  'only the word CAR stays lit: the other words are dimmed',
  (await shownLooks()) === 'ink-dark title-streaks + ink-dark lit-car' &&
    (await opacityOf('#stageTitle .lit-car .word-car')) === '1' &&
    (await opacityOf('#stageTitle .lit-car .word-driver')) !== '1' &&
    (await opacityOf('#stageTitle .lit-car .word-or')) !== '1',
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
await sleep(1000); // the grace period (0.6 s) in which the pointer could be on its way to the panel
check('moving away closes it again when nothing was clicked', await isState('idle', ''));
await mouse('mouseMoved', ...centreOf(wordDriver));
await sleep(700);
const wordRows = await chartRows();
check(
  'pointing at the word DRIVER does the same for the drivers',
  (await isState('peek', 'driver')) &&
    wordRows > 15 &&
    /^Driver ratings/.test(await panelTitle()) &&
    (await shownLooks()) === 'ink-dark title-streaks + ink-dark lit-driver' &&
    (await opacityOf('#stageTitle .lit-driver .word-driver')) === '1' &&
    (await opacityOf('#stageTitle .lit-driver .word-car')) !== '1',
  `${wordRows} rows`,
);
await click(...centreOf(hands));
await sleep(500);
check(
  'clicking the hands keeps the list of drivers open',
  (await isState('open', 'driver')) &&
    (await opacityOf('.stage-frame-hint')) === '0' &&
    !(await evaluate("document.getElementById('stageLedgerClose').hidden")) &&
    (await evaluate("document.getElementById('hotspotDriver').getAttribute('aria-pressed')")) === 'true',
);
check(
  'the ratings explain their default scale in one line',
  (await evaluate("document.getElementById('ratingsGuideLine').textContent")) ===
    'Estimated pace after this weekend · higher is faster · 1,000 is the average of this grid',
);
await evaluate("document.getElementById('ratingsGuideToggle').click()");
check(
  'How to read this opens an explanation and reports its state',
  (await evaluate("document.getElementById('ratingsGuideToggle').getAttribute('aria-expanded')")) === 'true' &&
    !(await evaluate("document.getElementById('ratingsGuideDetail').hidden")) &&
    (await evaluate("document.getElementById('ratingsGuideText').textContent.includes('each driver would be in the same car')")),
);
await evaluate("document.getElementById('ratingsCars').click()");
check(
  'the car explanation separates car pace from the driver',
  await evaluate("document.getElementById('ratingsGuideText').textContent.includes('each car would be with the same driver')"),
);
await evaluate("document.getElementById('ratingsDrivers').click()");
await evaluate("document.getElementById('ratingsGuideToggle').click()");
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
await sleep(1000);
check('pressing on the picture, away from the car and the hands, lets go of the ratings', await isState('idle', ''));
// From the picture to the panel: the pointer travels to it, the panel stays, and using its slider keeps it open even when the button is let go outside.
await mouse('mouseMoved', ...centreOf(car));
await sleep(500);
const panelBox = await rectangleOf('stageLedger');
check(
  'the panel is a column clear of the car and the hands',
  panelBox.x + panelBox.width + 16 <= car.x && panelBox.x + panelBox.width + 16 <= hands.x,
  JSON.stringify({ panelBox, car, hands }),
);
const scrub = await rectangleOf('ratingsScrub');
await mouse('mouseMoved', scrub.x + scrub.width * 0.2, scrub.y - 40);
await sleep(900);
check(
  'moving from the car to the panel keeps the ratings of the cars open',
  (await isState('peek', 'car')) && /^Car ratings/.test(await panelTitle()),
);
const weekendBefore = await evaluate("document.getElementById('ratingsNow').textContent");
await mouse('mouseMoved', scrub.x + scrub.width * 0.3, scrub.y + scrub.height / 2);
await mouse('mousePressed', scrub.x + scrub.width * 0.3, scrub.y + scrub.height / 2);
await mouse('mouseMoved', scrub.x + scrub.width * 0.7, scrub.y + scrub.height / 2);
await mouse('mouseMoved', scrub.x + scrub.width * 0.7, 30); // above the panel: the weekend stays where the thumb was
await mouse('mouseReleased', scrub.x + scrub.width * 0.7, 30);
await sleep(900);
check(
  'dragging the weekend slider changes the weekend and keeps the panel open when the button is let go outside it',
  (await isState('open', 'car')) && (await evaluate("document.getElementById('ratingsNow').textContent")) !== weekendBefore,
  `${weekendBefore} -> ${await evaluate("document.getElementById('ratingsNow').textContent")}`,
);
check('the address is the Ratings page while the panel is kept open', (await evaluate('location.hash')).startsWith('#/ratings?'));
await evaluate(
  "(() => { const slider = document.getElementById('ratingsScrub'); slider.value = slider.max; slider.dispatchEvent(new Event('input')); })()",
); // back to the latest weekend, which the checks below assume
await click(8, 300);
await sleep(400);
check('letting go of the panel puts the address back to the front page', (await evaluate('location.hash')) === '#/');
// the choice made in the panel stands even though the pointer came to it from a picture: point at the car, go into the panel, press Drivers, then Cars
const pressInPanel = async (id) => {
  const box = await rectangleOf(id);
  await mouse('mouseMoved', ...centreOf(box));
  await mouse('mousePressed', ...centreOf(box));
  await mouse('mouseReleased', ...centreOf(box));
  await sleep(600);
};
// From the hands to the panel the pointer passes over the car (it is in between): crossing it must not switch the ratings to the cars
const glide = async (from, to, steps = 20) => {
  for (let step = 1; step <= steps; step++) {
    await mouse('mouseMoved', from[0] + ((to[0] - from[0]) * step) / steps, from[1] + ((to[1] - from[1]) * step) / steps);
    await sleep(20);
  }
};
const handsCentre = centreOf(hands);
for (const kept of [false, true]) {
  await mouse('mouseMoved', ...handsCentre);
  await sleep(500);
  if (kept) {
    await click(...handsCentre);
    await sleep(400);
  }
  const panelAt = await rectangleOf('stageLedger');
  await glide(handsCentre, [panelAt.x + panelAt.width / 2, handsCentre[1]]);
  await sleep(800);
  check(
    `going from the hands to the panel, across the car, keeps the drivers (${kept ? 'drivers kept open' : 'nothing kept open'})`,
    (await isState(kept ? 'open' : 'peek', 'driver')) &&
      /^Driver ratings/.test(await panelTitle()) &&
      !(await evaluate("document.getElementById('ratingsLayerForm').disabled")),
    JSON.stringify([await stageState(), await panelTitle()]),
  );
  if (!kept) {
    // the first press in the panel keeps the drivers open, and the form toggle works from there
    await pressInPanel('ratingsLayerForm');
    check(
      'pressing the form toggle with the mouse shows recent form in red on the drivers',
      (await isState('open', 'driver')) && (await evaluate("document.querySelectorAll('#ratingsList .bar-form').length")) >= 5,
      JSON.stringify([await stageState(), await evaluate("document.querySelectorAll('#ratingsList .bar-form').length")]),
    );
    await pressInPanel('ratingsLayerForm');
  }
  await click(8, 300);
  await sleep(500);
}
// From the car to the timing table of the race: the table holds the preview as the panel does, and pressing on it keeps it open
await mouse('mouseMoved', ...centreOf(car));
await sleep(1200); // the lap times of the season are fetched the first time
const tableBox = await rectangleOfSelector('#stageTrackTable li:nth-child(3)');
await glide(centreOf(car), centreOf(tableBox), 24);
await sleep(1000);
check(
  'going from the car to the timing table of the race keeps the ratings of the cars open (the table is part of what is open)',
  (await isState('peek', 'car')) && !(await evaluate("document.getElementById('stageTrack').hidden")),
  JSON.stringify(await stageState()),
);
await mouse('mousePressed', ...centreOf(tableBox));
await mouse('mouseReleased', ...centreOf(tableBox));
await sleep(300);
check('and pressing on it keeps them open', await isState('open', 'car'));
await click(8, 300);
await sleep(1000);
await mouse('mouseMoved', ...centreOf(car));
await sleep(500);
const scrubAgain = await rectangleOf('ratingsScrub');
await mouse('mouseMoved', scrubAgain.x + scrubAgain.width * 0.2, scrubAgain.y - 40);
await sleep(700);
await pressInPanel('ratingsDrivers');
check(
  'pressing Drivers in the panel, after pointing at the car, shows the drivers',
  (await isState('open', 'driver')) && /^Driver ratings/.test(await panelTitle()),
);
await pressInPanel('ratingsCars');
check(
  'pressing Cars in the panel shows the cars',
  (await isState('open', 'car')) && /^Car ratings/.test(await panelTitle()) && (await chartRows()) <= 14,
  JSON.stringify([await stageState(), await panelTitle(), await chartRows()]),
);
await click(8, 300);
await sleep(400);

await click(...centreOf(car));
await sleep(400);
await mouse('mouseMoved', 8, 300);
await press('Escape', 'Escape', 27);
await sleep(1000); // the grace period before what was pointed at closes, and then the picture fades back to red
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
  'Enter on the hands keeps the ratings of the drivers open and moves into the panel',
  (await isState('open', 'driver')) &&
    (await evaluate("document.getElementById('stageLedger').contains(document.activeElement)")) &&
    (await chartRows()) > 15,
);
check(
  'the rows of the chart are reached with the keyboard and each reads as a sentence',
  await evaluate(
    "[...document.querySelectorAll('#ratingsList .ledger-row')].every((row) => row.getAttribute('tabindex') === '0' && /Rank \\d+/.test(row.getAttribute('aria-label')))",
  ),
);
await press('Escape', 'Escape', 27);
await sleep(300);
check(
  'Escape from the panel closes it and puts the focus back on the hands',
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
await sleep(900);

// Ratings: the ranked list, error, recent form, Cars switch, timeline play
await evaluate("location.hash = '#/ratings'");
await sleep(1000);
check('ratings list has a row per driver', (await evaluate("document.querySelectorAll('#ratingsList .ledger-row').length")) > 10);
const listFits = await evaluate(
  "(() => { const list = document.getElementById('ratingsList'); const panel = document.getElementById('stageLedger'); return [list.scrollHeight <= list.clientHeight + 1, panel.scrollHeight <= panel.clientHeight + 1]; })()",
);
check(
  'every row of the ratings is visible at once, without scrolling the list or the panel',
  listFits.every(Boolean),
  JSON.stringify(listFits),
);
// the most that has been rated at one weekend (24) on a laptop 600 high: still every row, still no scrolling
await evaluate(
  "import('/site/js/state.js').then(({ state }) => { const sizes = state.model.snaps.map((snap) => snap.drivers.length); window.__crowded = sizes.indexOf(Math.max(...sizes)); })",
);
await sleep(300);
const crowded = await evaluate('window.__crowded');
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 600, deviceScaleFactor: 1, mobile: false });
await sleep(700);
await evaluate(
  `(() => { const slider = document.getElementById('ratingsScrub'); slider.value = ${crowded}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`,
);
await sleep(500);
const crowdedFits = await evaluate(
  "(() => { const list = document.getElementById('ratingsList'); const panel = document.getElementById('stageLedger'); return [list.querySelectorAll('.ledger-row').length, list.scrollHeight <= list.clientHeight + 1, panel.scrollHeight <= panel.clientHeight + 1]; })()",
);
check(
  'even the fullest weekend (24 drivers) shows every row without scrolling on a laptop 600 high',
  crowdedFits[0] >= 24 && crowdedFits[1] && crowdedFits[2],
  JSON.stringify(crowdedFits),
);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(700);
await evaluate(
  "(() => { const slider = document.getElementById('ratingsScrub'); slider.value = slider.max; slider.dispatchEvent(new Event('input', { bubbles: true })); })()",
);
await sleep(400);
const firstRow = await rectangleOfSelector('#ratingsList .ledger-row');
await mouse('mouseMoved', ...centreOf(firstRow));
await sleep(300);
check(
  'the row under the pointer inverts: light text on dark',
  (await evaluate("getComputedStyle(document.querySelector('#ratingsList .ledger-row')).backgroundColor")) === 'rgb(7, 8, 11)' &&
    (await evaluate("getComputedStyle(document.querySelector('#ratingsList .ledger-row .name')).color")) === 'rgb(238, 240, 243)' &&
    (await evaluate("getComputedStyle(document.querySelector('#ratingsList .ledger-row .change')).color")) === 'rgb(238, 240, 243)',
);
// the card that opens on the row under the pointer: who, age, team, rank and the paces, in the panel's own style
const card = await evaluate(
  `(() => { const card = document.getElementById('ratingCard'); const style = getComputedStyle(card); const box = card.getBoundingClientRect(); const panel = document.getElementById('stageLedger').getBoundingClientRect();
    return { hidden: card.hidden, forename: card.querySelector('.card-forename')?.textContent, surname: card.querySelector('.card-surname')?.textContent, facts: card.querySelector('.card-facts')?.textContent,
      labels: [...card.querySelectorAll('dt')].map((dt) => dt.textContent), values: [...card.querySelectorAll('dd')].map((dd) => dd.textContent),
      blur: style.backdropFilter, left: box.left, panelRight: panel.right, tooltip: !!document.getElementById('chartValueTooltip') && !document.getElementById('chartValueTooltip').hidden }; })()`,
);
check(
  'the row under the pointer opens a card with the name, surname, team, age, rank, pace, quali pace and pace with form',
  card.hidden === false &&
    card.forename === 'Max' &&
    card.surname === 'Verstappen' &&
    /^Red Bull · age \d\d$/.test(card.facts) &&
    JSON.stringify(card.labels) === JSON.stringify(['Rank', 'Pace', 'Quali pace', 'Pace with form']) &&
    card.values.every((value) => /\d/.test(value)) &&
    /blur/.test(card.blur) &&
    card.left >= card.panelRight &&
    !card.tooltip,
  JSON.stringify(card),
);
// the race at the bottom right: the circuit of the weekend, the real race replayed on it at ten times the pace (a dot for each driver), the lap counter and
// the live timing table
const trackState = () =>
  evaluate(
    `(() => { const dots = [...document.querySelectorAll('#stageTrackDots circle')]; const box = document.getElementById('stageTrack');
      const table = [...document.querySelectorAll('#stageTrackTable li')];
      const place = (li) => { const m = /translate\\(([-\\d.]+)px, ([-\\d.]+)px\\)/.exec(li.style.transform); return m ? [Number(m[1]), Number(m[2])] : [0, 0]; };
      return { hidden: box.hidden, name: document.getElementById('stageTrackName').textContent, lap: document.getElementById('stageTrackLap').textContent, ids: dots.map((d) => d.dataset.id).sort(),
        first: dots.length ? [Number(dots[0].getAttribute('cx')), Number(dots[0].getAttribute('cy'))] : null, pause: document.getElementById('stageTrackPause').textContent,
        rows: [...document.querySelectorAll('#ratingsList .ledger-row')].map((row) => row.dataset.id).sort(), path: document.getElementById('stageTrackLine').getAttribute('d').length,
        box: (() => { const r = box.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
        order: table.map((li) => [li.dataset.id, ...place(li)]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([id]) => id),
        codes: table.map((li) => li.querySelector('.code').textContent), gaps: Object.fromEntries(table.map((li) => [li.dataset.id, li.querySelector('.gap').textContent])),
        tableShown: !document.getElementById('stageTrackTable').hidden, raceTime: Number(box.dataset.raceTime), raceId: box.dataset.raceId,
        hotDots: dots.filter((d) => d.classList.contains('hot')).length, hotRows: table.filter((li) => li.classList.contains('hot')).map((li) => li.dataset.id),
        linked: [...document.querySelectorAll('#ratingsList .ledger-row.linked')].map((row) => row.dataset.id) }; })()`,
  );
await mouse('mouseMoved', 8, 300);
await sleep(600);
const raceOne = await trackState();
check(
  'the race of the weekend is at the bottom right, with its name and the lap counter, a dot for each driver and a row of the timing table for each',
  !raceOne.hidden &&
    raceOne.name === 'Singapore GP · 2026' &&
    /^lap \d+ \/ 62$/.test(raceOne.lap) &&
    raceOne.path > 500 &&
    JSON.stringify(raceOne.ids) === JSON.stringify(raceOne.rows) &&
    raceOne.order.length === raceOne.ids.length &&
    raceOne.tableShown &&
    raceOne.codes.every((code) => /^[A-Z]{3}$/.test(code)) &&
    raceOne.box[0] > 700 &&
    raceOne.box[1] > 450,
  JSON.stringify({ ...raceOne, order: raceOne.order.length, gaps: 0 }),
);
const gridOrder = raceOne.order;
check(
  'the cars wait on the grid for the lights',
  Math.abs(raceOne.raceTime) < 0.01 || raceOne.raceTime < 30,
  `race time ${raceOne.raceTime}`,
);
await sleep(2800); // the cars are on the grid for two seconds
const underway = await trackState();
await sleep(700);
const raceTwo = await trackState();
check(
  'the dots race: they have moved round the track',
  Math.hypot(raceTwo.first[0] - underway.first[0], raceTwo.first[1] - underway.first[1]) > 20 && raceTwo.raceTime > underway.raceTime + 3,
  JSON.stringify([underway.first, raceTwo.first, underway.raceTime, raceTwo.raceTime]),
);
let lapNow = 1;
for (let waited = 0; waited < 20000 && lapNow < 3; waited += 500) {
  await sleep(500);
  lapNow = Number(/^lap (\d+)/.exec((await trackState()).lap)[1]);
}
check('and the lap counter advances (a lap takes about nine seconds at ten times the pace)', lapNow >= 3, `lap ${lapNow}`);
// the places in the table are the places of the real race: pause it where it is, and work out the order from the lap times of the season file
await evaluate("document.getElementById('stageTrackPause').click()");
await sleep(300);
const paused = await trackState();
const expected = await evaluate(
  `(async () => {
    const season = await (await fetch('../data/race-laps/2026.json')).json();
    const race = season.races['${paused.raceId}'];
    const time = ${paused.raceTime};
    const cars = race.entries.map(([id, , grid, out, , centiseconds]) => {
      const lap = centiseconds.map((value) => value / 100);
      let start = 0;
      let u = null;
      for (let k = 0; k < lap.length; k++) {
        if (time < start + lap[k]) {
          const from = k === 0 ? -(grid > 0 ? grid : race.entries.length + 1) * 0.002 : k;
          u = from + ((k + 1 - from) * (time - start)) / lap[k];
          break;
        }
        start += lap[k];
      }
      return { id: String(id), u: u ?? lap.length, lap, retired: Boolean(out) && u === null };
    });
    const racing = cars.filter((car) => !car.retired).sort((a, b) => b.u - a.u);
    const [leader, second] = racing; // the gap of the car in second place: the time since the leader was where it is now
    let reached = 0;
    let at = 0;
    for (let k = 0; k < leader.lap.length; k++) {
      if (second.u <= k + 1) {
        at = reached + (k === 0 ? ((second.u + 0.002) / 1.002) : second.u - k) * leader.lap[k];
        break;
      }
      reached += leader.lap[k];
    }
    return { order: racing.map((car) => car.id), gap: time - at };
  })()`,
);
check(
  'the table has the places of the real race at that moment, from the lap times of the season file (the first ten)',
  JSON.stringify(paused.order.slice(0, 10)) === JSON.stringify(expected.order.slice(0, 10)),
  JSON.stringify([paused.order.slice(0, 10), expected.order.slice(0, 10), paused.raceTime]),
);
const secondGap = Number(/^\+(\d+\.\d)$/.exec(paused.gaps[paused.order[1]])?.[1]);
check(
  'and the gap of the car in second place is the time since the leader was where it is (the table says +' +
    secondGap +
    ', the lap times say ' +
    expected.gap.toFixed(1) +
    ')',
  Math.abs(secondGap - expected.gap) < 0.25 && paused.gaps[paused.order[0]] === '—',
);
check('the order has changed since the start: the cars have passed each other', JSON.stringify(paused.order) !== JSON.stringify(gridOrder));
await evaluate("document.getElementById('stageTrackPause').click()");
await sleep(300);
// the dot, and the row of the table, of the row of the ratings under the pointer turn red; the dot larger
const thirdRow = await rectangleOfSelector('#ratingsList li:nth-child(3) .ledger-row');
await mouse('mouseMoved', ...centreOf(thirdRow));
await sleep(300);
const dots = await evaluate(
  `(() => { const id = document.querySelector('#ratingsList li:nth-child(3) .ledger-row').dataset.id; const dot = (d) => ({ hot: d.classList.contains('hot'), r: Number(d.getAttribute('r')), fill: getComputedStyle(d).fill });
    const others = [...document.querySelectorAll('#stageTrackDots circle')].filter((d) => d.dataset.id !== id).map(dot);
    const row = document.querySelector('#stageTrackTable li[data-id="' + id + '"]');
    return { mine: dot(document.querySelector('#stageTrackDots circle[data-id="' + id + '"]')), others, row: row.classList.contains('hot'), rowBackground: getComputedStyle(row).backgroundColor, otherRows: [...document.querySelectorAll('#stageTrackTable li.hot')].length }; })()`,
);
check(
  'pointing at a row of the ratings turns its dot FA1802 and larger, and lights its row of the timing table; nothing else changes',
  dots.mine.hot &&
    dots.mine.fill === 'rgb(250, 24, 2)' &&
    dots.mine.r > 1.4 * Math.max(...dots.others.map((d) => d.r)) &&
    dots.others.every((d) => !d.hot && d.fill !== 'rgb(250, 24, 2)') &&
    dots.row &&
    dots.otherRows === 1 &&
    /250, 24, 2/.test(dots.rowBackground),
  JSON.stringify(dots),
);
await mouse('mouseMoved', 8, 300);
await sleep(300);
check(
  'and they go back when the pointer leaves the row',
  (await evaluate("document.querySelectorAll('#stageTrackDots circle.hot').length")) === 0 &&
    (await evaluate("document.querySelectorAll('#stageTrackTable li.hot').length")) === 0,
);
// the other way: a row of the timing table lights its dot and the row of the ratings
const tableRow = await rectangleOfSelector('#stageTrackTable li:nth-child(4)');
await mouse('mouseMoved', ...centreOf(tableRow));
await sleep(300);
const fromTable = await trackState();
check(
  'pointing at a row of the timing table turns its dot red and lights the row of the ratings of that driver',
  fromTable.hotDots === 1 &&
    fromTable.hotRows.length === 1 &&
    fromTable.linked.length === 1 &&
    fromTable.linked[0] === fromTable.hotRows[0],
  JSON.stringify([fromTable.hotDots, fromTable.hotRows, fromTable.linked]),
);
await mouse('mouseMoved', 8, 300);
await sleep(300);
check('and the row of the ratings goes back', (await trackState()).linked.length === 0);
// pause and play
await evaluate("document.getElementById('stageTrackPause').click()");
const frozen = await trackState();
await sleep(500);
check(
  'the pause button stops the race',
  frozen.pause === 'play' && JSON.stringify((await trackState()).first) === JSON.stringify(frozen.first),
);
await evaluate("document.getElementById('stageTrackPause').click()");
await sleep(500);
check('and play starts it again', JSON.stringify((await trackState()).first) !== JSON.stringify(frozen.first));
// the speed: the visitor chooses how many times faster than the real race it goes
const speedButtons = await evaluate(
  "[...document.querySelectorAll('#stageTrackSpeeds button')].map((button) => [button.textContent, button.getAttribute('aria-pressed')])",
);
check(
  'six speeds to choose from (1, 2, 5, 10, 30 and 50 times), and 10 is the one chosen to begin with',
  JSON.stringify(speedButtons.map(([name]) => name)) === JSON.stringify(['1×', '2×', '5×', '10×', '30×', '50×']) &&
    JSON.stringify(speedButtons.filter(([, pressed]) => pressed === 'true').map(([name]) => name)) === JSON.stringify(['10×']),
  JSON.stringify(speedButtons),
);
const chooseSpeed = async (speed) => {
  await evaluate(`document.querySelector('#stageTrackSpeeds button[data-speed="${speed}"]').click()`);
  await sleep(500);
};
const pace = async () => {
  const before = await trackState();
  await sleep(1500);
  return ((await trackState()).raceTime - before.raceTime) / 1.5; // seconds of race for each second on the screen
};
const paces = {};
for (const speed of [10, 1, 5, 50]) {
  const justBefore = await trackState();
  await chooseSpeed(speed);
  const justAfter = await trackState();
  paces[speed] = await pace();
  if (speed === 1)
    check(
      'changing the speed does not move the race: it stays where it was (a few seconds of race time, not a jump)',
      Math.abs(justAfter.raceTime - justBefore.raceTime) < 12,
      `${justBefore.raceTime} then ${justAfter.raceTime}`,
    );
}
check(
  'the race goes at the speed chosen: 1, 5, 10 and 50 seconds of race for each second on the screen (within a third)',
  Object.entries(paces).every(([speed, measured]) => Math.abs(measured / Number(speed) - 1) < 0.34),
  JSON.stringify(paces),
);
check(
  'and only the speed chosen is marked',
  JSON.stringify(
    await evaluate(
      "[...document.querySelectorAll('#stageTrackSpeeds button')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)",
    ),
  ) === JSON.stringify(['50×']),
);
await chooseSpeed(10);

// the cars: still a dot for each driver; the row of a team lights both of its drivers
await evaluate("document.getElementById('ratingsCars').click()");
await sleep(600);
const cars = await trackState();
check(
  'with the cars shown there is still a dot for each driver, and a row of the ratings for each team',
  cars.ids.length === raceOne.ids.length && cars.rows.length >= 9 && cars.rows.length <= 14 && !cars.hidden,
  `${cars.ids.length} dots, ${cars.rows.length} rows`,
);
const teamRow = await rectangleOfSelector('#ratingsList li:nth-child(2) .ledger-row');
await mouse('mouseMoved', ...centreOf(teamRow));
await sleep(300);
const team = await trackState();
check(
  'pointing at a team lights both of its drivers: two dots, two rows of the table',
  team.hotDots === 2 && team.hotRows.length === 2,
  JSON.stringify([team.hotDots, team.hotRows]),
);
await mouse('mouseMoved', 8, 300);
await sleep(300);
// (and the card of a team has its name and its paces, and no age: a team's id can be the id of a driver)
const teamCard = await evaluate(
  `(() => { const row = document.querySelector('#ratingsList .ledger-row'); row.dispatchEvent(new Event('pointerenter')); const card = document.getElementById('ratingCard');
    return { hidden: card.hidden, name: card.querySelector('.card-surname')?.textContent, facts: card.querySelector('.card-facts')?.textContent ?? null, labels: [...card.querySelectorAll('dt')].map((dt) => dt.textContent) }; })()`,
);
check(
  'the card of a team has its name and its paces, no age and no pace with form',
  !teamCard.hidden &&
    teamCard.name === 'Mercedes' &&
    teamCard.facts === null &&
    JSON.stringify(teamCard.labels) === JSON.stringify(['Rank', 'Pace', 'Quali pace']),
  JSON.stringify(teamCard),
);
await evaluate("document.querySelector('#ratingsList .ledger-row').dispatchEvent(new Event('pointerleave'))");
await evaluate("document.getElementById('ratingsDrivers').click()");
await sleep(300);
// a circuit with no outline (Korea) shows no race; the ratings are as usual
await evaluate(
  "import('/site/js/state.js').then(({ state }) => { window.__korea = state.model.snaps.findIndex((snap) => snap.year === 2012 && /Korean/.test(snap.name)); window.__monaco = state.model.snaps.findIndex((snap) => snap.year === 2024 && /Monaco/.test(snap.name)); })",
);
await sleep(300);
const korea = await evaluate('window.__korea');
await evaluate(
  `(() => { const slider = document.getElementById('ratingsScrub'); slider.value = ${korea}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`,
);
await sleep(700);
check(
  'a weekend at a circuit with no outline (Korea 2012) shows no race, and the ratings are there',
  (await trackState()).hidden && (await chartRows()) > 10,
);
await evaluate(
  `(() => { const slider = document.getElementById('ratingsScrub'); slider.value = ${korea - 1}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`,
);
await sleep(900);
const earlier = await trackState();
check(
  'another weekend, another race (the 2012 Japanese Grand Prix, at Suzuka)',
  !earlier.hidden && /^Japanese GP · 2012$/.test(earlier.name) && earlier.order.length >= 20,
  JSON.stringify(earlier.name),
);
// a red flag: the Monaco Grand Prix of 2024 was stopped on the first lap; the cars stand on the grid for the stoppage, which takes a few seconds
await evaluate(
  `(() => { const slider = document.getElementById('ratingsScrub'); slider.value = window.__monaco; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`,
);
let sawRedFlag = false;
let before = null;
for (let waited = 0; waited < 9000 && !sawRedFlag; waited += 150) {
  await sleep(150);
  const now = await trackState();
  if (/red flag/.test(now.lap)) {
    sawRedFlag = true;
    before = now;
  }
}
check(
  'the red flag of the 2024 Monaco Grand Prix is shown as such, and the cars stand still',
  sawRedFlag && before.name === 'Monaco GP · 2024',
  JSON.stringify(before?.lap),
);
if (sawRedFlag) {
  await sleep(500);
  const during = await trackState();
  check(
    'while it lasts the cars stay where they are',
    /red flag/.test(during.lap) ? JSON.stringify(during.first) === JSON.stringify(before.first) : true,
  );
}
let afterFlag = false;
for (let waited = 0; waited < 8000 && !afterFlag; waited += 250) {
  await sleep(250);
  afterFlag = !/red flag/.test((await trackState()).lap);
}
check('and the race goes on after it', afterFlag);
await evaluate(
  "(() => { const slider = document.getElementById('ratingsScrub'); slider.value = slider.max; slider.dispatchEvent(new Event('input', { bubbles: true })); })()",
);
await sleep(500);
await mouse('mouseMoved', 8, 300);
// the error is printed beside each rating, and the control can switch it off
const deviations = () =>
  evaluate(
    "[...document.querySelectorAll('#ratingsList .ledger-row .deviation')].filter((cell) => /^±\\d+$/.test(cell.textContent)).length",
  );
check(
  'the error is printed beside the ratings',
  (await deviations()) >= 10 && (await evaluate("document.getElementById('ratingsList').classList.contains('with-sd')")),
);
await evaluate("document.getElementById('ratingsSd').click()");
await sleep(200);
check(
  'the error can be switched off',
  (await evaluate("document.getElementById('ratingsSd').getAttribute('aria-pressed')")) === 'false' &&
    !(await evaluate("document.getElementById('ratingsList').classList.contains('with-sd')")),
);
await evaluate("document.getElementById('ratingsSd').click()");
await sleep(200);
const barBox = await rectangleOfSelector('#ratingsList .ledger-row .bar');
const nameGap = await evaluate(
  "(() => { const row = document.querySelector('#ratingsList .ledger-row'); const range = document.createRange(); range.selectNodeContents(row.querySelector('.name')); return row.querySelector('.rating').getBoundingClientRect().left - range.getBoundingClientRect().right; })()",
);
check(
  'the bars are wide, and the rating is close to the end of the name (measured from the text, not the column)',
  barBox.width >= 150 && nameGap < 45,
  JSON.stringify({ barWidth: barBox.width, nameGap }),
);
const mean = await evaluate(
  "(() => { const list = document.getElementById('ratingsList'); const bar = list.querySelector('.bar'); const line = getComputedStyle(bar, '::after'); return [parseFloat(list.style.getPropertyValue('--mean')), line.width, line.content]; })()",
);
check('a vertical line marks the average', mean[0] > 0 && mean[0] < 100 && mean[1] === '2px' && mean[2] !== 'none', JSON.stringify(mean));
check('no orange shows while recent form is off', (await evaluate("document.querySelectorAll('#ratingsList .bar-form').length")) === 0);
const ratingsOff = await evaluate("[...document.querySelectorAll('#ratingsList .ledger-row .rating')].map((cell) => cell.textContent)");
await evaluate("document.getElementById('ratingsLayerForm').click()");
await sleep(300);
const ratingsOn = await evaluate("[...document.querySelectorAll('#ratingsList .ledger-row .rating')].map((cell) => cell.textContent)");
check(
  'the recent-form toggle shows the ratings with recent form',
  (await evaluate("document.getElementById('ratingsLayerForm').getAttribute('aria-pressed')")) === 'true' &&
    ratingsOn.length === ratingsOff.length &&
    JSON.stringify(ratingsOn) !== JSON.stringify(ratingsOff),
);
const formBars = await evaluate(
  "(() => { const bars = [...document.querySelectorAll('#ratingsList .bar-form')]; return [bars.length, bars.filter((bar) => bar.classList.contains('loss')).length, bars.every((bar) => parseFloat(bar.style.width) > 0), getComputedStyle(bars.find((bar) => !bar.classList.contains('loss'))).backgroundColor]; })()",
);
check(
  'with recent form the shift is stacked on the bars in FA1802: solid where it adds, an outline where it takes away',
  formBars[0] >= 5 && formBars[1] >= 1 && formBars[1] < formBars[0] && formBars[2] && formBars[3] === 'rgb(250, 24, 2)',
  JSON.stringify(formBars),
);
await evaluate("document.getElementById('ratingsLayerForm').click()");
await sleep(200);
await evaluate("document.getElementById('ratingsCars').click()");
await sleep(300);
check('Cars view retitles the chart', /^Car ratings/.test((await evaluate("document.getElementById('ratingsTitle').textContent")) || ''));
check(
  'the panel has no Download CSV, Copy link or About these numbers',
  (await evaluate("['ratingsExport', 'ratingsShare', 'ratingsNote'].every((id) => !document.getElementById(id))")) &&
    !/Download|Copy link|About these numbers/.test(await evaluate("document.getElementById('stageLedger').textContent")),
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
check('play advances the timeline at about the pace of its steps', moved >= 4, `index ${moved}`);

// The date beside the slider is as wide for every weekend, and so is the slider: neither changes length as the weekends go by
const dates = await evaluate(
  `(async () => {
    const slider = document.getElementById('ratingsScrub');
    const now = document.getElementById('ratingsNow');
    const samples = [];
    for (let index = 0; index <= +slider.max; index += 17) {
      slider.value = index;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      samples.push({ text: now.textContent, now: now.getBoundingClientRect().width, slider: slider.getBoundingClientRect().width, overflow: now.scrollWidth > now.clientWidth });
    }
    return { count: samples.length, lengths: [...new Set(samples.map((sample) => sample.text.length))].length, nowWidths: [...new Set(samples.map((sample) => sample.now))], sliderWidths: [...new Set(samples.map((sample) => sample.slider))], overflow: samples.filter((sample) => sample.overflow).length };
  })()`,
);
check(
  'the date and the slider keep one width over dates of different lengths',
  dates.count >= 25 && dates.lengths >= 2 && dates.nowWidths.length === 1 && dates.sliderWidths.length === 1 && dates.overflow === 0,
  JSON.stringify(dates),
);

// The bar-chart race: the rows stay from one weekend (or one rating) to the next, glide to their new places, their bars grow, a driver who joins
// fades in, the average line glides; the order in the document follows when they have settled; nothing glides under reduced motion
const slideTo = (index) =>
  evaluate(
    `(() => { const slider = document.getElementById('ratingsScrub'); slider.value = ${index}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
const changeMetric = (metric) =>
  evaluate(
    `(() => { const select = document.getElementById('ratingsMetric'); select.value = '${metric}'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
const order = () =>
  evaluate(
    "(() => { const items = [...document.querySelectorAll('#ratingsList > li')]; return { document: items.map((item) => item.firstElementChild.dataset.id), screen: [...items].sort((a, b) => a.style.order - b.style.order).map((item) => item.firstElementChild.dataset.id) }; })()",
  );
await slideTo(300);
await sleep(700);
const identity = await evaluate(
  "(() => { window.rowsBefore = new Map([...document.querySelectorAll('#ratingsList > li')].map((item) => [item.firstElementChild.dataset.id, item])); return window.rowsBefore.size; })()",
);
const glided = await evaluate(
  `(() => {
    const select = document.getElementById('ratingsMetric');
    const before = new Map([...document.querySelectorAll('#ratingsList .bar-base')].map((bar) => [bar.closest('.ledger-row').dataset.id, bar.getBoundingClientRect().width]));
    select.value = 'qual';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const items = [...document.querySelectorAll('#ratingsList > li')];
    const gliding = items.filter((item) => getComputedStyle(item).transform !== 'none').length;
    const mean = getComputedStyle(document.getElementById('ratingsList')).transitionProperty;
    const kept = items.filter((item) => window.rowsBefore.get(item.firstElementChild.dataset.id) === item).length;
    return { gliding, mean, kept, total: items.length, before: [...before.values()].length };
  })()`,
);
check(
  'changing the rating keeps the rows, and the rows whose place changes glide to it',
  glided.gliding >= 3 && glided.kept === glided.total && glided.kept >= identity - 2,
  JSON.stringify({ glided, identity }),
);
check('the line at the average glides as well', glided.mean.includes('--mean'), glided.mean);
await sleep(700);
const settled = await order();
check(
  'once the rows have glided the order in the document is the order on the screen',
  JSON.stringify(settled.document) === JSON.stringify(settled.screen),
);
const barsGrow = await evaluate(
  `(async () => {
    const widths = () => [...document.querySelectorAll('#ratingsList .bar-base')].map((bar) => bar.getBoundingClientRect().width);
    const before = widths();
    const slider = document.getElementById('ratingsScrub');
    slider.value = 299;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const start = widths();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const middle = widths();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const end = widths();
    const index = start.map((_, i) => i).filter((i) => Math.abs(end[i] - before[i]) > 8);
    return { moved: index.length, started: index.every((i) => Math.abs(start[i] - before[i]) < 2), halfway: index.filter((i) => Math.min(before[i], end[i]) + 1 < middle[i] && middle[i] < Math.max(before[i], end[i]) - 1).length };
  })()`,
);
check(
  'the bars grow to their new lengths rather than jumping',
  barsGrow.moved === 0 || (barsGrow.started && barsGrow.halfway >= 1),
  JSON.stringify(barsGrow),
);
await slideTo(0);
await sleep(700);
const joining = await evaluate(
  `(() => {
    const slider = document.getElementById('ratingsScrub');
    const ids = new Set([...document.querySelectorAll('#ratingsList .ledger-row')].map((row) => row.dataset.id));
    slider.value = 300;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const items = [...document.querySelectorAll('#ratingsList > li')];
    const fresh = items.filter((item) => !ids.has(item.firstElementChild.dataset.id));
    return { fresh: fresh.length, faint: fresh.filter((item) => getComputedStyle(item).opacity === '0').length, left: [...ids].filter((id) => !document.querySelector('#ratingsList .ledger-row[data-id="' + id + '"]')).length };
  })()`,
);
check(
  'a driver who joins fades in, and one who leaves is gone',
  joining.fresh >= 1 && joining.faint === joining.fresh && joining.left >= 1,
  JSON.stringify(joining),
);
await sleep(700);
check(
  'and everyone is shown once it has settled',
  (await evaluate("[...document.querySelectorAll('#ratingsList > li')].every((item) => getComputedStyle(item).opacity === '1')")) &&
    (await evaluate("document.querySelectorAll('#ratingsList > li').length")) === (await chartRows()),
);
// keyboard focus stays on its row when the rows are put in order in the document
await evaluate(
  "window.focusedId = document.querySelector('#ratingsList > li:nth-child(5) .ledger-row'); window.focusedId.focus(); window.focusedId = window.focusedId.dataset.id;",
);
await changeMetric('race');
await sleep(800);
check(
  'a row with the focus keeps it when the rows settle in a new order',
  (await evaluate('document.activeElement.dataset.id')) === (await evaluate('window.focusedId')),
);
await evaluate('document.activeElement.blur()');
// while the weekends go by, a still pointer is not met by a card, and the race on the page waits for the weekend they stop at
await slideTo(100);
await sleep(1500);
const raceBefore = await evaluate("document.getElementById('stageTrack').dataset.raceId");
await evaluate("document.getElementById('ratingsPlay').click()");
await sleep(400);
const during = await evaluate(
  "(() => { document.querySelector('#ratingsList .ledger-row').dispatchEvent(new Event('pointerenter')); return [document.getElementById('ratingCard')?.hidden ?? true, document.getElementById('stageTrack').hidden]; })()",
);
await evaluate("document.getElementById('ratingsPlay').click()");
check(
  'while the weekends go by no card opens on a row and the race is put away',
  during[0] === true && during[1] === true,
  JSON.stringify(during),
);
await sleep(900);
check(
  'and the race comes back for the weekend they stopped at',
  (await evaluate("document.getElementById('stageTrack').hidden")) === false &&
    (await evaluate("document.getElementById('stageTrack').dataset.raceId")) !== raceBefore,
  raceBefore,
);
const restingGap = await evaluate(
  "(() => { const row = document.querySelector('#ratingsList .ledger-row'); const range = document.createRange(); range.selectNodeContents(row.querySelector('.name')); return [row.querySelector('.rating').getBoundingClientRect().left - range.getBoundingClientRect().right, row.querySelector('.bar').getBoundingClientRect().width]; })()",
);
check(
  'when the play stops the columns are as wide as the weekend needs again: the rating is close to the name, and the bars are wide',
  restingGap[0] < 45 && restingGap[1] >= 150,
  JSON.stringify(restingGap),
);
// holding the slider is the same: while it is held the columns are as wide as the widest name seen, and when it is let go they fit again and the race comes back
const held = await evaluate(
  `(async () => {
    const slider = document.getElementById('ratingsScrub');
    const list = document.getElementById('ratingsList');
    const go = (index) => { slider.value = index; slider.dispatchEvent(new Event('input', { bubbles: true })); return parseInt(list.style.getPropertyValue('--name')); };
    // the width each of the last hundred weekends needs by itself (not more: the page puts every weekend in the address, and the browser ignores changes of the address after about two hundred in ten seconds)
    const first = Math.max(0, +slider.max - 99);
    const at = Array.from({ length: +slider.max + 1 - first }, (_, index) => go(first + index));
    const steps = 7;
    const found = at.findIndex((_, index) => index + steps < at.length && Math.max(...at.slice(index, index + steps + 1)) > at[index + steps]);
    const start = found < 0 ? -1 : first + found;
    go(start);
    await new Promise((resolve) => setTimeout(resolve, 700));
    slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    let during = 0;
    for (let index = start; index <= start + steps; index++) during = go(index);
    window.dispatchEvent(new PointerEvent('pointerup'));
    await new Promise((resolve) => setTimeout(resolve, 800));
    const after = parseInt(list.style.getPropertyValue('--name'));
    return { start, needed: at[found + steps], during, after, track: !document.getElementById('stageTrack').hidden };
  })()`,
);
check(
  'while the slider is held the columns keep the widest name seen, and when it is let go they fit the weekend again and the race comes back',
  held.start >= 0 && held.during > held.needed && held.after === held.needed && held.track === true,
  JSON.stringify(held),
);
// nothing glides under reduced motion, and the document is in order at once
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await sleep(100);
await changeMetric('combined');
const steady = await evaluate(
  "(() => { const items = [...document.querySelectorAll('#ratingsList > li')]; return { gliding: items.filter((item) => getComputedStyle(item).transform !== 'none').length, ordered: items.every((item, i) => Number(item.style.order) === i) }; })()",
);
check(
  'under reduced motion the rows do not glide and are in order at once',
  steady.gliding === 0 && steady.ordered,
  JSON.stringify(steady),
);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await slideTo(+(await evaluate('document.getElementById("ratingsScrub").max')));
await sleep(700);

// History: lines, chips, table twin
await evaluate("location.hash = '#/methodology'");
await sleep(1200);
{
  // the race runs only on the front page: on another page it is hidden and still
  const cx = () => evaluate("document.querySelector('#stageTrackDots circle')?.getAttribute('cx')");
  const before = await cx();
  await sleep(500);
  check(
    'on another page the track is hidden and the race is not running',
    (await evaluate("document.getElementById('stageTrack').hidden")) && before === (await cx()),
  );
}
await evaluate("location.hash = '#/history'");
await sleep(1200);
check(
  'history draws one line per chip',
  (await evaluate("document.querySelectorAll('#driverChart polyline').length")) >=
    (await evaluate("document.querySelectorAll('#historyChips .series-chip').length")) &&
    (await evaluate("document.querySelectorAll('#historyChips .series-chip').length")) >= 3,
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
    const input = document.querySelector('#historyChips .series-picker input');
    input.value = '${query}';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('#historyChips .series-picker-list button')].map((b) => b.textContent);
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
  evaluate(`document.querySelectorAll('#ratingsList .ledger-row')[${position}].dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
const pickedNames = await evaluate(
  "[...document.querySelectorAll('#ratingsList .ledger-row')].slice(0, 2).map((row) => row.querySelector('.name').textContent)",
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
const chipNames = await evaluate(
  "[...document.querySelectorAll('#historyChips .series-chip')].map((chip) => chip.textContent.replace('×', ''))",
);
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
  'what-if matchup shows its two facts and a probability',
  /\d+%/.test((await evaluate("document.querySelector('.head-to-head-figures')?.textContent || ''")) || '') &&
    (await evaluate("document.querySelectorAll('.head-to-head-facts > div').length")) === 2,
);
// The history and the head to head are views over the ratings, in the panel: a button in the panel opens each, the view covers the panel exactly, Back
// (and the first Escape) returns to the same weekend with the focus on the button that opened it, the next Escape closes the panel
await evaluate("location.hash = '#/ratings'");
await sleep(900);
const ledgerState = () =>
  evaluate(
    "JSON.stringify({ view: document.getElementById('stageLedger').dataset.view, page: document.body.dataset.page, stage: document.getElementById('stage').dataset.state, hash: location.hash.split('?')[0], focus: document.activeElement.id || document.activeElement.className })",
  );
const weekendTitle = () => evaluate("document.getElementById('ratingsTitle').textContent");
const panelBeforeViews = await rectangleOfSelector('#stageLedger');
const weekendBeforeViews = await weekendTitle();
const entriesBefore = await evaluate('history.length');
await evaluate("document.getElementById('ratingsOpenHistory').click()");
await sleep(900);
const entriesOpen = await evaluate('history.length');
const historyBox = await rectangleOfSelector('#historyView');
const panelWithView = await rectangleOfSelector('#stageLedger');
const inHistory = JSON.parse(await ledgerState());
check(
  'the History button in the panel opens the history over the ratings, kept open as a page of the front page',
  inHistory.view === 'history' && inHistory.page === 'history' && inHistory.stage === 'open' && inHistory.hash === '#/history',
  JSON.stringify(inHistory),
);
check(
  'the history covers the panel (which keeps its place and width, and has a height of its own while a view is open) and the ratings are out of sight under it',
  Math.abs(historyBox.x - panelWithView.x - 1) <= 1.5 &&
    Math.abs(historyBox.width - panelWithView.width + 2) <= 2.5 &&
    Math.abs(historyBox.height - panelWithView.height + 2) <= 2.5 &&
    Math.abs(panelWithView.x - panelBeforeViews.x) <= 1.5 &&
    Math.abs(panelWithView.width - panelBeforeViews.width) <= 1.5 &&
    (await evaluate("getComputedStyle(document.getElementById('ratingsHost')).visibility")) === 'hidden',
  JSON.stringify({ panelBeforeViews, panelWithView, historyBox }),
);
check(
  'the history shows a line and a chip for each driver, and fits the panel without scrolling',
  (await evaluate("document.querySelectorAll('#driverChart polyline').length")) >= 2 &&
    (await evaluate("document.querySelectorAll('#historyChips .series-chip').length")) >= 2 &&
    (await evaluate(
      "(() => { const body = document.querySelector('#historyView .ledger-view-body'); return body.scrollHeight <= body.clientHeight + 1; })()",
    )),
);
check(
  "the lines wear the same colour as their chips, and they are the panel's own colours",
  await (async () => {
    const colours = await evaluate(
      "(() => { const chip = getComputedStyle(document.querySelector('#historyChips .series-chip i')).backgroundColor; const line = getComputedStyle(document.querySelector('#driverChart polyline[stroke^=\"var(--s\"]')).stroke; return [chip, line]; })()",
    );
    return colours[0] === 'rgb(250, 24, 2)' && colours[1] === colours[0];
  })(),
);
check(
  'the history has an "i" that explains the rating and how to read the chart, and draws the average of the field as a line (for the ratings, not for the probabilities)',
  (await evaluate(
    "document.getElementById('historyInfo').dataset.info.includes('1,000') && document.getElementById('historyInfo').dataset.info.length > 60",
  )) &&
    (await evaluate('document.querySelectorAll(\'#driverChart line[stroke="var(--ink)"]\').length')) === 1 &&
    (await (async () => {
      await evaluate(
        "(() => { const select = document.getElementById('historyMetric'); select.value = 'clean'; select.dispatchEvent(new Event('change', { bubbles: true })); })()",
      );
      await sleep(300);
      const without = await evaluate('document.querySelectorAll(\'#driverChart line[stroke="var(--ink)"]\').length');
      await evaluate(
        "(() => { const select = document.getElementById('historyMetric'); select.value = 'combined'; select.dispatchEvent(new Event('change', { bubbles: true })); })()",
      );
      await sleep(300);
      return without === 0;
    })()),
);
const chartPlot = await rectangleOfSelector('#driverChart');
await mouse('mouseMoved', chartPlot.x + chartPlot.width * 0.7, chartPlot.y + chartPlot.height * 0.5);
await sleep(300);
check(
  "a tooltip on the chart is in the panel's metal",
  await evaluate(
    "(() => { const tip = document.getElementById('chartValueTooltip'); return !tip.hidden && tip.classList.contains('metal') && tip.querySelectorAll('.tip-row').length >= 1; })()",
  ),
);
await mouse('mouseMoved', 8, 300);
await evaluate("document.querySelector('#historyView .ledger-back').click()");
await sleep(700);
const backFromHistory = JSON.parse(await ledgerState());
check(
  "opening a view is a step forward in the browser's history and Back in the panel is a step back (so the browser's back button does not return to the view)",
  entriesOpen === entriesBefore + 1 && (await evaluate('history.length')) === entriesOpen,
  JSON.stringify({ entriesBefore, entriesOpen, after: await evaluate('history.length') }),
);
check(
  'Back returns to the ratings of the same weekend, with the focus on the button that opened the history',
  backFromHistory.view === 'ratings' &&
    backFromHistory.hash === '#/ratings' &&
    backFromHistory.stage === 'open' &&
    backFromHistory.focus === 'ratingsOpenHistory' &&
    (await weekendTitle()) === weekendBeforeViews,
  JSON.stringify(backFromHistory),
);
await evaluate("document.getElementById('ratingsOpenHeadToHead').click()");
await sleep(1200);
const styleOf = (selector, property) => evaluate(`getComputedStyle(document.querySelector('${selector}')).${property}`);
check(
  'the Versus button opens the head to head with a forecast, a bar in the colours of the two lines, and no scrolling',
  JSON.parse(await ledgerState()).view === 'head-to-head' &&
    /\d+%/.test((await evaluate("document.querySelector('.head-to-head-figures')?.textContent || ''")) || '') &&
    (await styleOf('.head-to-head-bar i:first-child', 'backgroundColor')) ===
      (await styleOf('#headToHeadChart polyline[stroke^="var(--s"]', 'stroke')) &&
    (await evaluate(
      "getComputedStyle(document.querySelector('.head-to-head-bar i:last-child')).backgroundColor === getComputedStyle([...document.querySelectorAll('#headToHeadChart polyline[stroke^=\"var(--s\"]')].find((line) => line.getAttribute('stroke') === 'var(--s2)')).stroke",
    )) &&
    (await evaluate(
      "(() => { const body = document.querySelector('#headToHeadView .ledger-body, #headToHeadView .ledger-view-body'); return body.scrollHeight <= body.clientHeight + 1; })()",
    )),
);
// What explains a row is behind an "i" (and the views carry the figures and the names and little else): pointing at one, or focusing it, opens its
// note beside it inside the stage; Escape closes the note and nothing else; the steps of the forecast are rows with a bar split between the two drivers
const stepIcon = "document.querySelectorAll('#headToHeadView .head-to-head-steps li .info')[1]";
const bars = await evaluate(
  "(() => [...document.querySelectorAll('#headToHeadView .head-to-head-steps li .head-to-head-step-bar')].map((bar) => [bar.children.length, getComputedStyle(bar.children[0]).backgroundColor, getComputedStyle(bar.children[1]).backgroundColor]))()",
);
const resultText = await evaluate("document.getElementById('headToHeadOut').innerText.length");
check(
  'the head to head shows the figures, the names and bars for each step of the forecast, with the explanations behind icons',
  bars.length >= 2 &&
    bars.every((bar) => bar[0] === 2 && bar[1] === 'rgb(250, 24, 2)' && bar[2] === 'rgb(9, 26, 156)') &&
    resultText < 520 &&
    (await evaluate(
      "[...document.querySelectorAll('#headToHeadView .info:not([hidden])')].length >= 6 && [...document.querySelectorAll('#headToHeadView .info:not([hidden])')].every((icon) => icon.dataset.info.length > 10 && icon.getAttribute('aria-label') === icon.dataset.info)",
    )),
  JSON.stringify({ bars, resultText }),
);
const iconAt = await evaluate(
  `(() => { const r = ${stepIcon}.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
);
await mouse('mouseMoved', iconAt[0], iconAt[1]);
await sleep(350);
const noteOpen = JSON.parse(
  await evaluate(
    `JSON.stringify((() => { const tip = document.getElementById('infoTip'); const stage = document.getElementById('stage').getBoundingClientRect(); const r = tip.getBoundingClientRect(); return { shown: !tip.hidden, inside: r.left >= stage.left && r.right <= stage.right && r.top >= stage.top && r.bottom <= stage.bottom, text: tip.textContent === ${stepIcon}.dataset.info, described: ${stepIcon}.getAttribute('aria-describedby') === 'infoTip', floating: getComputedStyle(tip).pointerEvents === 'none' }; })())`,
  ),
);
check('pointing at an "i" opens its note beside it, inside the stage', Object.values(noteOpen).every(Boolean), JSON.stringify(noteOpen));
await press('Escape', 'Escape', 27);
await sleep(250);
check(
  'Escape closes the note and nothing else: the view is still open',
  (await evaluate("document.getElementById('infoTip').hidden")) && JSON.parse(await ledgerState()).view === 'head-to-head',
);
await mouse('mouseMoved', 8, 300);
await sleep(200);
await evaluate(`${stepIcon}.focus()`);
await sleep(250);
check(
  'focusing an "i" with the keyboard opens its note too, and moving on closes it',
  (await evaluate("!document.getElementById('infoTip').hidden")) &&
    (await evaluate("(document.activeElement.blur(), document.getElementById('infoTip').hidden)")),
);
// Head to head: the same car is the standard setting, Prime puts a driver at his peak, the rating and the date of each driver are beside his chance, and
// dragging along the plot sets the date of both: the race at the bottom right goes to that Grand Prix with the two drivers lit in their colours
await mouse('mouseMoved', 8, 300);
// (the checks above left driver B at his prime and the conditions wet: start from the standard setting)
await evaluate(
  "(() => { for (const s of ['A', 'B']) { const when = document.getElementById('headToHeadWhen' + s); when.value = 'latest'; when.dispatchEvent(new Event('change', { bubbles: true })); } const wet = document.getElementById('headToHeadWet'); wet.value = 'dry'; wet.dispatchEvent(new Event('change', { bubbles: true })); })()",
);
await sleep(500);
const headToHeadState = () =>
  evaluate(`JSON.stringify({
    sameCar: document.getElementById('headToHeadSameCar').getAttribute('aria-pressed'),
    car: document.getElementById('headToHeadCarName').textContent,
    figures: [...document.querySelectorAll('.head-to-head-figure')].map((figure) => ({ chance: figure.querySelector('b').textContent, rating: figure.querySelector('em').textContent, date: figure.querySelector('small').textContent })),
    weekend: document.getElementById('ratingsNow').textContent,
    race: document.getElementById('stageTrack').dataset.raceId,
    raceShown: !document.getElementById('stageTrack').hidden,
    lines: document.querySelectorAll('#headToHeadChart polyline[stroke^="var("]').length, // (not the dark edges under them)
    markers: [document.querySelectorAll('#headToHeadChart line[stroke="var(--s1)"]').length, document.querySelectorAll('#headToHeadChart line[stroke="var(--s2)"]').length],
    steps: [...document.querySelectorAll('.head-to-head-steps li > span:first-child')].map((label) => label.firstChild.textContent),
    lit: [...document.querySelectorAll('#stageTrackDots circle')].filter((dot) => dot.classList.contains('versus-a') || dot.classList.contains('versus-b')).map((dot) => getComputedStyle(dot).fill),
    litRows: document.querySelectorAll('#stageTrackTable li.versus-a, #stageTrackTable li.versus-b').length,
    prime: [document.getElementById('headToHeadPrimeA').getAttribute('aria-pressed'), document.getElementById('headToHeadPrimeB').getAttribute('aria-pressed')],
    carFields: [...document.querySelectorAll('#headToHeadView [id^="headToHeadCarField"]')].map((field) => field.hidden),
  })`);
const standard = JSON.parse(await headToHeadState());
check(
  'the same car is the standard setting: it is on, the shared car is named once, the car pickers are not offered, and the plot is there with a marker for each driver',
  standard.sameCar === 'true' &&
    standard.car.length > 3 &&
    standard.carFields.every(Boolean) &&
    standard.lines === 2 &&
    standard.markers[0] >= 1 &&
    standard.markers[1] >= 1,
  JSON.stringify(standard),
);
check(
  'beside each chance are the rating the forecast takes and the date of the weekend it is from, and the two drivers are lit in the race in the colours of A and of B',
  standard.figures.length === 2 &&
    standard.figures.every(
      (figure) => /^\d+%$/.test(figure.chance) && /^\d{3,4}$/.test(figure.rating) && /^\d{1,2} \w{3} \d{4}$/.test(figure.date),
    ) &&
    standard.lit.join() === 'rgb(250, 24, 2),rgb(9, 26, 156)' &&
    standard.litRows === 2,
  JSON.stringify(standard),
);
// Prime: B's peak is a different date, the race goes to that weekend, and the same button brings him back to his latest
await evaluate("document.getElementById('headToHeadPrimeB').click()");
await sleep(900);
const primed = JSON.parse(await headToHeadState());
check(
  'Prime puts a driver at his peak: his date changes (the other stays), the race goes to that weekend, and pressing it again brings him back to his latest',
  primed.prime.join() === 'false,true' &&
    primed.figures[1].date !== standard.figures[1].date &&
    primed.figures[0].date === standard.figures[0].date &&
    primed.weekend === primed.figures[1].date &&
    primed.race !== standard.race &&
    primed.markers[0] >= 1 &&
    (await (async () => {
      await evaluate("document.getElementById('headToHeadPrimeB').click()");
      await sleep(700);
      const back = JSON.parse(await headToHeadState());
      return back.prime.join() === 'false,false' && back.figures[1].date === standard.figures[1].date && back.race === standard.race;
    })()),
  JSON.stringify({ standard: standard.figures, primed: primed.figures, weekend: primed.weekend }),
);
// dragging along the plot: both drivers go to the date, the race waits while it moves and then goes to that Grand Prix; the address is told once
const dragPlot = await rectangleOfSelector('#headToHeadChart');
const dragY = dragPlot.y + dragPlot.height * 0.5;
const entriesBeforeDrag = await evaluate('history.length');
await mouse('mouseMoved', dragPlot.x + dragPlot.width * 0.85, dragY);
await mouse('mousePressed', dragPlot.x + dragPlot.width * 0.85, dragY);
for (const share of [0.8, 0.7, 0.62]) {
  await mouse('mouseMoved', dragPlot.x + dragPlot.width * share, dragY, { buttons: 1 });
  await sleep(60);
}
const dragging = JSON.parse(await headToHeadState());
const addressMidDrag = await evaluate('location.hash');
await mouse('mouseReleased', dragPlot.x + dragPlot.width * 0.62, dragY);
await sleep(1500);
const dragged = JSON.parse(await headToHeadState());
check(
  'dragging along the plot sets the date of both drivers, and the race (put away while it moves) goes to that Grand Prix with the two drivers lit in their colours',
  dragging.figures[0].date === dragging.figures[1].date &&
    dragging.figures[0].date !== standard.figures[0].date &&
    dragging.raceShown === false &&
    dragged.raceShown === true &&
    dragged.race !== standard.race &&
    dragged.weekend === dragged.figures[0].date &&
    dragged.lit.join() === 'rgb(250, 24, 2),rgb(9, 26, 156)' &&
    dragged.litRows === 2,
  JSON.stringify({ dragging, dragged }),
);
check(
  "the address is told once, when the drag ends (the browser would ignore it after a few hundred), and the browser's history does not grow",
  !addressMidDrag.includes(`race=${dragged.race}`) &&
    (await evaluate('location.hash')).includes(`race=${dragged.race}`) &&
    (await evaluate('history.length')) === entriesBeforeDrag,
  JSON.stringify({ addressMidDrag: addressMidDrag.slice(-24), now: (await evaluate('location.hash')).slice(-24) }),
);
// the plot is not drawn again while it is dragged: the chart element under the pointer stays, and the markers moved
check('the markers moved with the drag (both at the dragged date, side by side)', dragged.markers[0] >= 1 && dragged.markers[1] >= 1);
// Same car off, with both drivers at their latest: each in his own car again, and the forecast with recent form for the current grid
await evaluate(
  "(() => { for (const s of ['A', 'B']) { const when = document.getElementById('headToHeadWhen' + s); when.value = 'latest'; when.dispatchEvent(new Event('change', { bubbles: true })); } })()",
);
await sleep(300);
await evaluate("document.getElementById('headToHeadSameCar').click()");
await sleep(700);
const own = JSON.parse(await headToHeadState());
check(
  'with the same car off the cars are offered again, and the forecast with recent form is back at the latest weekends',
  own.sameCar === 'false' && own.carFields.every((hidden) => !hidden) && own.car === '' && own.steps.includes('With recent form'),
  JSON.stringify(own),
);
await evaluate("document.getElementById('headToHeadSameCar').click()");
await sleep(300);
// one driver at two moments (his peak against his latest): one line with the two markers, and two dates
const keepB = await evaluate("document.getElementById('headToHeadB').value");
await evaluate(
  "(() => { const b = document.getElementById('headToHeadB'); b.value = document.getElementById('headToHeadA').value; b.dispatchEvent(new Event('change', { bubbles: true })); })()",
);
await evaluate("document.getElementById('headToHeadPrimeB').click()");
await sleep(800);
const twoMoments = JSON.parse(await headToHeadState());
check(
  'the same driver at his peak and at his latest is one line with two markers, and two dates',
  twoMoments.lines === 1 &&
    twoMoments.figures[0].date !== twoMoments.figures[1].date &&
    twoMoments.markers[0] >= 1 &&
    twoMoments.markers[1] >= 1,
  JSON.stringify(twoMoments),
);
await evaluate("document.getElementById('headToHeadPrimeB').click()");
await evaluate(
  `(() => { const b = document.getElementById('headToHeadB'); b.value = '${keepB}'; b.dispatchEvent(new Event('change', { bubbles: true })); })()`,
);
await sleep(500);
await press('Escape', 'Escape', 27);
await sleep(600);
const afterFirstEscape = JSON.parse(await ledgerState());
check(
  'the first Escape goes back to the ratings from the head to head, the next closes the panel',
  afterFirstEscape.view === 'ratings' && afterFirstEscape.stage === 'open' && afterFirstEscape.focus === 'ratingsOpenHeadToHead',
  JSON.stringify(afterFirstEscape),
);
check(
  'Back puts the ratings and the race where they were when the view was opened, after a date was dragged',
  (await evaluate("document.getElementById('ratingsNow').textContent")) === standard.weekend &&
    (await evaluate("document.getElementById('stageTrack').dataset.raceId")) === standard.race,
  JSON.stringify({ standard: standard.weekend, now: await evaluate("document.getElementById('ratingsNow').textContent") }),
);
check(
  'going back from the head to head puts the colours out in the race',
  (await evaluate(
    "document.querySelectorAll('#stageTrackDots .versus-a, #stageTrackDots .versus-b, #stageTrackTable .versus-a, #stageTrackTable .versus-b').length",
  )) === 0,
);
await press('Escape', 'Escape', 27);
await sleep(500);
check(
  'and the ratings are no longer kept open (the keyboard is put back on the picture, which previews them)',
  JSON.parse(await ledgerState()).stage !== 'open' && (await evaluate('location.hash')) === '#/',
);
await evaluate("location.hash = '#/history'");
await sleep(900);
await evaluate("document.getElementById('stageLedgerClose').click()");
await sleep(500);
check(
  'the cross closes the panel and its view at once: the address is the front page',
  JSON.parse(await ledgerState()).stage !== 'open' &&
    (await evaluate('location.hash')) === '#/' &&
    JSON.parse(await ledgerState()).view === 'ratings',
  await ledgerState(),
);
// the cars: the history opens on the cars, the head to head (of drivers) is not offered, and the panel is as tall as a view needs
await evaluate("location.hash = '#/ratings'");
await sleep(600);
await evaluate("document.getElementById('ratingsCars').click()");
await sleep(500);
const carsLedgerBox = await rectangleOfSelector('#stageLedger');
await evaluate("document.getElementById('ratingsOpenHistory').click()");
await sleep(900);
const carsHistoryLedgerBox = await rectangleOfSelector('#stageLedger');
check(
  'from the cars the history opens on the cars, in a panel that is not shorter than it needs',
  (await evaluate("document.getElementById('historyCars').getAttribute('aria-pressed')")) === 'true' &&
    (await evaluate("document.querySelectorAll('#historyChips .series-chip').length")) >= 3 &&
    carsHistoryLedgerBox.height >= Math.min(carsLedgerBox.height, 560) &&
    carsHistoryLedgerBox.height >= 560,
  JSON.stringify({ carsLedgerBox, carsHistoryLedgerBox }),
);
await evaluate("document.querySelector('#historyView .ledger-back').click()");
await sleep(500);
check('and the head to head is not offered for the cars', await evaluate("document.getElementById('ratingsOpenHeadToHead').disabled"));
await evaluate("document.getElementById('ratingsDrivers').click()");
await sleep(400);
await evaluate("location.hash = '#/ratings'");

// The Insights: a card in the middle of the front page (the picture is grey, no panel is open), a slide show: the contents first, then a slide for each
// finding with its chart, sliding; a list of the slides beside the card, the ticks under its title, the arrows and the keys move along it; the slide is in
// the address
await evaluate("location.hash = '#/insights'");
await sleep(1500);
const insightsState = () =>
  evaluate(`JSON.stringify({
    page: document.body.dataset.page,
    mode: document.getElementById('stage').dataset.mode,
    state: document.getElementById('stage').dataset.state,
    panelShown: !document.getElementById('stageLedger').hidden,
    position: document.getElementById('insightsPosition').textContent,
    name: document.getElementById('insightsName').textContent,
    open: [...document.querySelectorAll('#insightsCard .deck-slide')].map((slide) => !slide.inert).map((open, index) => (open ? index : -1)).filter((index) => index >= 0),
    transform: document.getElementById('insightsTrack').style.transform,
    current: [...document.querySelectorAll('#insightsList button[aria-current="true"], #insightsTicks button[aria-current="true"]')].map((button) => button.dataset.slide),
    hash: location.hash.split('?')[0],
    slide: (location.hash.match(/slide=([a-z0-9-]*)/) || [])[1] ?? null,
  })`);
const insightsAtStart = JSON.parse(await insightsState());
const insightsBox = await rectangleOfSelector('#insightsCard');
const stageBox = await rectangleOfSelector('#stage');
check(
  'the Insights are a card in the middle of the front page, over the grey picture, with no panel open and no pointing at the pictures',
  insightsAtStart.page === 'insights' &&
    insightsAtStart.mode === 'deck' &&
    insightsAtStart.state === 'open' &&
    !insightsAtStart.panelShown &&
    Math.abs(insightsBox.x + insightsBox.width / 2 - (stageBox.x + stageBox.width / 2)) <= 1.5 &&
    insightsBox.y > 60 &&
    insightsBox.y + insightsBox.height < stageBox.y + stageBox.height &&
    (await evaluate("getComputedStyle(document.getElementById('hotspotCar')).visibility")) === 'hidden',
  JSON.stringify({ insightsAtStart, insightsBox }),
);
check(
  'the first slide is the contents: the twenty findings under five topics, and a slide for each after it, all drawn',
  insightsAtStart.position === '1 / 21' &&
    (await evaluate("document.querySelectorAll('#insightsCard .deck-contents button[data-slide]').length")) === 20 &&
    (await evaluate("document.querySelectorAll('#insightsCard .deck-contents h3').length")) === 5 &&
    (await evaluate("document.querySelectorAll('article.insight').length")) === 20 &&
    (await evaluate(
      "[...document.querySelectorAll('article.insight')].every((card) => card.querySelector('svg, table') && card.querySelector('.info'))",
    )) &&
    !(await evaluate("/undefined|NaN/.test(document.getElementById('insightsCard').textContent)")),
);
check(
  'in every chart of the card what is drawn stays inside its svg, and a chart is not shorter than it was drawn for (no chart spills over the plate under it)',
  await evaluate(`[...document.querySelectorAll('.deck-card [data-chart] svg')].every((svg) => {
    const box = svg.getBBox();
    return box.y + box.height <= svg.height.baseVal.value + 2 && svg.parentElement.getBoundingClientRect().bottom + 1 >= svg.getBoundingClientRect().bottom;
  })`),
);
// jumping from the contents, and sliding there
await evaluate('document.querySelector(\'#insightsCard .deck-contents button[data-slide="12"]\').click()');
await sleep(900);
const jumped = JSON.parse(await insightsState());
check(
  'a finding on the contents slide takes the card there (the track slides, the others are put out of reach, the address names it)',
  jumped.position === '13 / 21' &&
    jumped.open.join() === '12' &&
    jumped.transform === 'translateX(-1200%)' &&
    jumped.current.join() === '12,12' &&
    jumped.hash === '#/insights' &&
    jumped.slide === 'ageing',
  JSON.stringify(jumped),
);
check(
  'slides slide (an animation, not a cut), and the same under reduced motion is a cut',
  (await evaluate("getComputedStyle(document.getElementById('insightsTrack')).transitionDuration")) !== '0s' &&
    (await (async () => {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await sleep(100);
      const still = await evaluate("getComputedStyle(document.getElementById('insightsTrack')).transitionDuration");
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      return still === '0s';
    })()),
);
// the arrows, the keys, the list and the ticks
await evaluate("document.getElementById('insightsNext').click()");
await sleep(700);
const afterNext = JSON.parse(await insightsState());
await press('ArrowLeft', 'ArrowLeft', 37);
await sleep(500);
await press('ArrowLeft', 'ArrowLeft', 37);
await sleep(500);
const afterKeys = JSON.parse(await insightsState());
await press('Home', 'Home', 36);
await sleep(600);
const atHome = JSON.parse(await insightsState());
await press('End', 'End', 35);
await sleep(600);
const atEnd = JSON.parse(await insightsState());
check(
  'Next, the arrow keys, Home and End move along the slides',
  afterNext.position === '14 / 21' &&
    afterKeys.position === '12 / 21' &&
    atHome.position === '1 / 21' &&
    atEnd.position === '21 / 21' &&
    (await evaluate("document.getElementById('insightsNext').disabled")),
  JSON.stringify({ afterNext: afterNext.position, afterKeys: afterKeys.position, atHome: atHome.position, atEnd: atEnd.position }),
);
const list = JSON.parse(
  await evaluate(`JSON.stringify({
    shown: getComputedStyle(document.getElementById('insightsList')).display !== 'none',
    buttons: document.querySelectorAll('#insightsList button').length,
    topics: document.querySelectorAll('#insightsList h3').length,
    right: document.getElementById('insightsList').getBoundingClientRect().right,
    cardLeft: document.getElementById('insightsCard').getBoundingClientRect().left,
  })`),
);
await evaluate('document.querySelector(\'#insightsList button[data-slide="5"]\').click()');
await sleep(700);
const fromList = JSON.parse(await insightsState());
await evaluate('document.querySelector(\'#insightsTicks button[data-slide="9"]\').click()');
await sleep(700);
const fromTicks = JSON.parse(await insightsState());
check(
  'the list of slides beside the card (five topics, the contents and the twenty findings, clear of the card) and the ticks under its title move to a slide',
  list.shown &&
    list.buttons === 21 &&
    list.topics === 5 &&
    list.right < list.cardLeft &&
    fromList.position === '6 / 21' &&
    fromList.current.join() === '5,5' &&
    fromTicks.position === '10 / 21',
  JSON.stringify({ list, fromList: fromList.position, fromTicks: fromTicks.position }),
);
const topicHeads = JSON.parse(
  await evaluate(`JSON.stringify({
    heads: [...document.querySelectorAll('#insightsList h3')].map((head) => ({ rule: getComputedStyle(head).borderTopWidth, weight: getComputedStyle(head).fontWeight, marker: getComputedStyle(head, '::before').width })),
    guide: [...document.querySelectorAll('#insightsList ol')].map((items) => getComputedStyle(items).borderLeftWidth),
    marked: [...document.querySelectorAll('#insightsList section[data-current] h3')].map((head) => head.textContent),
  })`),
);
check(
  'the topics in the list of slides are headings of their own (a rule over each, bold, a square before it, the findings set in under it with a guide) and the topic of the slide shown is marked',
  topicHeads.heads.length === 5 &&
    topicHeads.heads.every((head) => head.rule === '2px' && Number(head.weight) >= 700 && head.marker === '7px') &&
    topicHeads.guide.every((width) => width === '1px') &&
    topicHeads.marked.join() === 'Champions and stars',
  JSON.stringify(topicHeads),
);
await mouse('mouseMoved', 8, 300);
const insightsInfo = await evaluate("document.querySelector('#insightsCard .deck-slide:not([inert]) .insight-title .info').dataset.info");
check(
  'what a finding rests on is behind the "i" beside its title: how much weight it carries, and how it was computed',
  /^(Direct|Model-based): .* How it is computed: /.test(insightsInfo) && !/</.test(insightsInfo),
  insightsInfo.slice(0, 120),
);
// the card is metal, and the lines in it are in the palette of the History and the Head to head
check(
  "the charts in the card are in the palette of the panel (a bar is red or blue), on the panel's metal",
  (await evaluate(
    "(() => { const fills = new Set([...document.querySelectorAll('#insight-explained-share rect')].map((rect) => getComputedStyle(rect).fill)); return fills.has('rgb(250, 24, 2)') && fills.has('rgb(9, 26, 156)'); })()",
  )) && (await evaluate("getComputedStyle(document.getElementById('insightsCard')).backdropFilter")) !== 'none',
);
await press('Escape', 'Escape', 27);
await sleep(700);
check(
  'Escape closes the card: the address is the front page',
  (await evaluate('location.hash')) === '#/' &&
    (await evaluate("getComputedStyle(document.getElementById('insightsCard')).display")) === 'none',
);
await evaluate("location.hash = '#/insights'");
await sleep(400);
await click(stageBox.x + 8, stageBox.y + stageBox.height / 2);
await sleep(300);
check('clicking outside the Insights card closes it', (await evaluate('location.hash')) === '#/');
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
  !(await evaluate("/\\bElo\\b/i.test(document.getElementById('methodologyCard').textContent)")),
);
check(
  'the methodology explains the published method without release history',
  !(await evaluate(
    "/previous published|original reference|first version|earlier filter|old model/i.test(document.getElementById('methodologyCard').textContent)",
  )),
);
check(
  'the driver/car split and teammate network react to their controls',
  await evaluate(`(() => {
    const split = document.querySelector('#methodologySplitLab input');
    const graph = document.querySelector('#methodologyCareerGraph input');
    const before = document.querySelector('#methodologySplitLab [data-value="a"]').textContent;
    split.value = '25'; split.dispatchEvent(new Event('input', { bubbles: true }));
    graph.value = '1'; graph.dispatchEvent(new Event('input', { bubbles: true }));
    return before !== document.querySelector('#methodologySplitLab [data-value="a"]').textContent
      && document.querySelector('#methodologySplitLab [data-value="package-a"]').textContent === '+100'
      && document.querySelector('#methodologyCareerGraph .method-lab-reading').textContent.includes('through 1 link')
      && document.querySelectorAll('#methodologyCareerGraph .method-network-link.active').length === 1;
  })()`),
);
check(
  'methodology has its eight parts, the overview diagram, the settings tables and no unfilled placeholders',
  (await evaluate("document.querySelectorAll('#methodologyCard .method-part').length")) === 8 &&
    (await evaluate("document.querySelectorAll('#methodologyTrack .deck-slide').length")) === 9 &&
    (await evaluate("document.querySelectorAll('#methodologyCard .flow-stage').length")) >= 6 &&
    (await evaluate("document.querySelectorAll('#methodologyParams tbody tr').length")) >= 24 &&
    (await evaluate("document.querySelectorAll('#methodologyScoring tbody tr:not(.group)').length")) === 21 &&
    (await evaluate("document.querySelectorAll('#methodologyWindows tr').length")) === 4 &&
    !(await evaluate("/\\{\\{|undefined|NaN/.test(document.getElementById('methodologyCard').textContent)")),
);
// the Methodology is a card of slides: the contents and a slide for each of the eight parts; a link in the text that names a part (or a reference)
// leads to its slide, and the slide is in the address
check(
  'the Methodology is a card of slides with a list of its parts, and the links in the text lead to the slide of the part or of the reference',
  await (async () => {
    const position = () => evaluate("document.getElementById('methodologyPosition').textContent");
    const first = await position();
    await evaluate('document.querySelector(\'#methodologyCard .deck-contents button[data-slide="3"]\').click()');
    await sleep(700);
    const third = await position();
    const centered = await evaluate(`(() => {
      const slide = document.querySelector('#methodologyCard .deck-slide:not([inert])');
      const text = slide.querySelector('.deck-text');
      const s = slide.getBoundingClientRect(), t = text.getBoundingClientRect();
      return Math.abs((t.left + t.right) / 2 - (s.left + s.right) / 2) < 2;
    })()`);
    const slide = await evaluate('(location.hash.match(/slide=([a-z0-9-]*)/) || [])[1]');
    await evaluate('document.querySelector(\'#methodologyCard [data-jump="method-forecasts"]\').click()');
    await sleep(700);
    const linked = await position();
    await evaluate('document.querySelector(\'#methodologyCard [data-jump^="ref-"]\').click()');
    await sleep(900);
    const reference = await evaluate(
      "JSON.stringify({ position: document.getElementById('methodologyPosition').textContent, shown: !document.getElementById('methodologyCard').querySelector('.deck-slide:not([inert]) .references') ? null : true })",
    );
    return (
      first === '1 / 9' &&
      third === '4 / 9' &&
      centered &&
      slide === 'method-ratings' &&
      linked === '5 / 9' &&
      JSON.parse(reference).position === '9 / 9' &&
      JSON.parse(reference).shown === true &&
      (await evaluate("document.querySelectorAll('#methodologyList button').length")) === 9
    );
  })(),
);
// Formulas are typeset by KaTeX, which the site serves itself.
await sleep(3000);
const mathTotal = await evaluate("document.querySelectorAll('#methodologyCard .math').length");
const mathDone = await evaluate("document.querySelectorAll('#methodologyCard .math.typeset .katex').length");
const mathBad = await evaluate("document.querySelectorAll('#methodologyCard .katex-error').length");
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
  return evaluate('document.body.dataset.page');
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
  check(`the old address ${from} opens ${to}`, got === to, got);
}

// Compliance (see docs/compliance.md): the site talks only to its own origin, sets no cookies, stores nothing in the browser, and its legal pages are there
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
for (const hash of ['#/', '#/ratings', '#/history', '#/head-to-head', '#/graph', '#/insights', '#/methodology', '#/privacy', '#/about']) {
  await evaluate(`location.hash = '${hash}'`);
  await sleep(700);
}
check(
  'nothing is stored in the browser after every page has been opened',
  (await evaluate('localStorage.length + sessionStorage.length')) === 0 &&
    (await evaluate('indexedDB.databases().then((list) => list.length)')) === 0,
  await evaluate('JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage)])'),
);
await evaluate("location.hash = '#/privacy'");
await sleep(800);
check(
  "the Privacy page names the controller's regulator and the host, says there are no cookies, and no longer has a theme to forget",
  await evaluate(
    "(() => { const text = document.getElementById('privacyCard').textContent; return ['Garante', 'Information Commissioner', 'Cloudflare', 'no cookies'].every((word) => text.includes(word)) && !text.includes('f1-theme') && !document.getElementById('forgetTheme'); })()",
  ),
);
await evaluate("location.hash = '#/about'");
await sleep(800);
check(
  'the About page credits the data sources and gives the licence',
  await evaluate(
    "(() => { const text = document.getElementById('aboutCard').textContent; return ['TracingInsights', 'Jolpica', 'Ergast', 'CC BY-NC-SA 4.0', 'non-commercial', 'Inter', 'KaTeX'].every((word) => text.includes(word)) && !text.includes('Space Grotesk'); })()",
  ),
);
const legalDeck = async (hash) => {
  await evaluate(`location.hash = '${hash}'`);
  await sleep(900);
  return evaluate(
    `(() => { const page = document.body.dataset.page; const card = document.getElementById(page + 'Card'); return JSON.stringify({ mode: document.getElementById('stage').dataset.mode, slides: card.querySelectorAll('.deck-slide').length, list: document.querySelectorAll('#' + page + 'List button').length, position: document.getElementById(page + 'Position').textContent, shown: card.querySelector('.deck-slide:not([inert])')?.getAttribute('aria-label') }); })()`,
  );
};
const privacyDeck = JSON.parse(await legalDeck('#/privacy'));
check(
  'Privacy is a card of slides: the contents with the summary, then ten sections',
  privacyDeck.mode === 'deck' && privacyDeck.slides === 11 && privacyDeck.list === 11 && privacyDeck.position === '1 / 11',
  JSON.stringify(privacyDeck),
);
check(
  'the Privacy contents carry the summary of the notice',
  await evaluate("document.getElementById('privacyCard').querySelector('.deck-slide:not([inert])').textContent.includes('In short')"),
);
const aboutDeck = JSON.parse(await legalDeck('#/about?v=1&slide=credits'));
check(
  'About opens at the credits when the address names them',
  aboutDeck.mode === 'deck' && aboutDeck.slides === 10 && aboutDeck.position === '5 / 10' && /Data sources/.test(aboutDeck.shown),
  JSON.stringify(aboutDeck),
);
check(
  'no link outside the navigation carries an icon',
  (await evaluate("document.querySelectorAll('main a svg, footer a svg').length")) === 0,
);

// A phone: no page scrolls sideways
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await sleep(500);
for (const page of ['home', 'ratings', 'history', 'head-to-head', 'graph', 'insights', 'methodology', 'privacy', 'about']) {
  await evaluate(`location.hash = '#/${page}'`);
  await sleep(1200);
  const [scroll, inner] = await evaluate('[document.documentElement.scrollWidth, window.innerWidth]');
  check(`on a phone ${page} does not scroll sideways`, scroll <= inner, `${scroll} wide in ${inner}`);
}
await evaluate("location.hash = '#/graph'");
await sleep(400);
const phoneGraph = JSON.parse(
  await evaluate(`(() => {
  const box = (selector) => { const { x, y, width, height, right, bottom } = document.querySelector(selector).getBoundingClientRect(); return { x, y, width, height, right, bottom }; };
  return JSON.stringify({ title: box('.graph-head h2'), picker: box('#graphDriver'), plot: box('#graphPlot'), detail: box('#graphDetail') });
})()`),
);
check(
  'on a phone the picker stays beside the title and the driver card stacks below the graph',
  phoneGraph.picker.x > phoneGraph.title.x && phoneGraph.plot.height > 250 && phoneGraph.detail.y > phoneGraph.plot.bottom,
  JSON.stringify(phoneGraph),
);
await evaluate("location.hash = '#/methodology'");
await sleep(350);
await evaluate('document.querySelector(\'#methodologyCard .deck-contents button[data-slide="3"]\').click()');
await sleep(450);
check(
  'the teammate network fits the methodology card vertically on a phone',
  await evaluate(`(() => {
    const graph = document.getElementById('methodologyCareerGraph');
    const svg = graph.querySelector('svg');
    return svg.viewBox.baseVal.height > svg.viewBox.baseVal.width
      && svg.getBoundingClientRect().width <= graph.getBoundingClientRect().width + 1
      && graph.scrollWidth <= graph.clientWidth + 1;
  })()`),
);
// On a phone the Insights are a card across the screen, with no list beside it, and a swipe turns the slide
await evaluate("location.hash = '#/insights'");
await sleep(1200);
const phoneCard = await rectangleOfSelector('#insightsCard');
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 500 }] });
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 230, y: 503 }] });
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: 505 }] });
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(900);
check(
  'on a phone the Insights are a card across the screen, without the list of slides, and a swipe turns to the next slide',
  phoneCard.x >= 0 &&
    phoneCard.x + phoneCard.width <= 375 &&
    phoneCard.width > 300 &&
    (await evaluate("getComputedStyle(document.getElementById('insightsList')).display")) === 'none' &&
    (await evaluate("document.getElementById('insightsPosition').textContent")) === '2 / 21',
  JSON.stringify({ phoneCard, position: await evaluate("document.getElementById('insightsPosition').textContent") }),
);
// On a phone the ratings are a sheet: a tap on the car keeps it open, it stays clear of both pictures and above the text at the bottom
await evaluate("location.hash = '#/'");
await sleep(900);
check('on a phone the ratings are laid out as a sheet', (await evaluate("document.getElementById('stage').dataset.layout")) === 'sheet');
const phoneCar = await rectangleOf('hotspotCar');
const [tapX, tapY] = centreOf(phoneCar);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tapX, y: tapY }] });
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(900);
const sheet = await rectangleOf('stageLedger');
const phoneBottomRow = await rectangleOfSelector('.stage-bottom');
check(
  'tapping the car keeps its ratings open in a sheet that is tall enough to use and above the text at the bottom',
  (await isState('open', 'car')) && sheet.height >= 300 && sheet.y >= 60 && sheet.y + sheet.height <= phoneBottomRow.y + 1,
  JSON.stringify({ sheet, phoneBottomRow }),
);
await evaluate("document.getElementById('stageLedgerClose').click()");
await sleep(300);
check('the Close button lets go of the ratings', await isState('idle', ''));
await send('Emulation.clearDeviceMetricsOverride');

// A link straight to the ratings (a shared link): the panel is kept open from the start and the race is running
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/site/?link=1#/ratings` });
await sleep(5000);
const linkedDot = () => evaluate("document.querySelector('#stageTrackDots circle')?.getAttribute('cx')");
const linkedBefore = await linkedDot();
await sleep(600);
const linkedAfter = await linkedDot();
const linked = {
  hidden: await evaluate("document.getElementById('stageTrack').hidden"),
  lap: await evaluate("document.getElementById('stageTrackLap').textContent"),
  moved: linkedBefore !== null && linkedBefore !== linkedAfter,
};
check(
  'a link straight to #/ratings shows the track and the race is running',
  linked.hidden === false && linked.moved && /^lap /.test(linked.lap),
  JSON.stringify(linked),
);
// Links straight to a view (a shared link): the panel is kept open with the view over the ratings, drawn at once (the head to head loads its
// forecast on the way in)
// a link straight to a finding opens the card on its slide
await send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/site/?link=slide#/insights?v=1&slide=upsets` });
await sleep(5000);
const linkedSlide = await evaluate(
  "JSON.stringify({ position: document.getElementById('insightsPosition').textContent, name: document.getElementById('insightsName').textContent, drawn: !!document.querySelector('#insightsCard .deck-slide:not([inert]) svg') })",
);
check(
  'a link straight to a finding opens the card on that slide, drawn',
  JSON.parse(linkedSlide).position === '20 / 21' && JSON.parse(linkedSlide).name === 'The biggest upsets' && JSON.parse(linkedSlide).drawn,
  linkedSlide,
);
for (const [view, ready] of [
  ['history', "document.querySelectorAll('#driverChart polyline').length >= 3"],
  ['head-to-head', "/\\d+%/.test(document.querySelector('.head-to-head-figures')?.textContent || '')"],
]) {
  await send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/site/?link=${view}#/${view}` });
  await sleep(5000);
  const opened = await evaluate(
    `JSON.stringify({ view: document.getElementById('stageLedger').dataset.view, stage: document.getElementById('stage').dataset.state, shown: ${ready}, ledgerHidden: document.getElementById('stageLedger').hidden })`,
  );
  check(
    `a link straight to #/${view} opens the ${view} over the ratings, drawn`,
    JSON.parse(opened).view === view && JSON.parse(opened).stage === 'open' && JSON.parse(opened).shown && !JSON.parse(opened).ledgerHidden,
    opened,
  );
}
await send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/site/?link=graph#/graph` });
await sleep(5000);
const linkedGraph = await evaluate(
  "(() => ({ shown: !document.getElementById('graphPage').hidden, drawn: document.getElementById('graphPlot').width > 0, drivers: document.getElementById('graphDriver').options.length, selected: document.getElementById('graphDriver').value, detail: document.getElementById('graphDetail').textContent, track: !document.getElementById('stageTrack').hidden, table: !document.getElementById('stageTrackTable').hidden, hot: document.querySelector('#stageTrackDots circle[data-id=\"830\"]')?.classList.contains('hot') }))()",
);
check(
  'a link straight to the graph defaults to Max and lights him in the mini GP',
  linkedGraph.shown &&
    linkedGraph.drawn &&
    linkedGraph.drivers > 100 &&
    linkedGraph.selected === '830' &&
    /Max Verstappen/.test(linkedGraph.detail) &&
    /Age at date\s*29/.test(linkedGraph.detail) &&
    !/approx/.test(linkedGraph.detail) &&
    linkedGraph.track &&
    linkedGraph.table &&
    linkedGraph.hot,
  JSON.stringify(linkedGraph),
);
check(
  'the graph uses the same metal surface as Insights and has a visible close button',
  await evaluate(
    "(() => { const graph = getComputedStyle(document.getElementById('graphPage')); const metal = getComputedStyle(document.getElementById('stageLedger')); const close = document.getElementById('graphClose'); return graph.backgroundImage === metal.backgroundImage && graph.backdropFilter === metal.backdropFilter && close.getBoundingClientRect().width > 0; })()",
  ),
);
const graphLayout = JSON.parse(
  await evaluate(`(() => {
  const box = (selector) => { const { x, y, width, height, right, bottom } = document.querySelector(selector).getBoundingClientRect(); return { x, y, width, height, right, bottom }; };
  return JSON.stringify({ card: box('#graphPage'), title: box('.graph-head h2'), picker: box('#graphDriver'), plot: box('#graphPlot'), detail: box('#graphDetail'), timeline: box('#graphTimeline'), key: box('.graph-key') });
})()`),
);
check(
  'the graph has a compact header, a taller plot beside the driver card, and a timeline below',
  graphLayout.picker.x > graphLayout.title.right &&
    graphLayout.plot.y - graphLayout.card.y < 110 &&
    graphLayout.plot.height > 500 &&
    graphLayout.plot.width / graphLayout.plot.height < 1.5 &&
    graphLayout.detail.x > graphLayout.plot.right &&
    graphLayout.detail.height > graphLayout.plot.height &&
    graphLayout.key.y > graphLayout.timeline.bottom,
  JSON.stringify(graphLayout),
);
const graphHover = JSON.parse(
  await evaluate(`(async () => {
  const source = await (await fetch('../data/teammate-graph.json')).json();
  const snap = source.snapshots.at(-1);
  const box = document.getElementById('graphPlot').getBoundingClientRect();
  const year = Math.max(2027, Number(document.getElementById('graphLast').textContent) + 1);
  const grid = new Set([...document.querySelectorAll('#stageTrackDots circle[data-id]')].map((dot) => dot.dataset.id));
  const points = snap.nodes.map((node) => ({ id: node[0], x: box.x + 55 + (node[2] - 1999) / (year - 1999) * (box.width - 73), y: box.y + 22 + (1110 - node[1]) / 220 * (box.height - 61) }));
  const best = points.filter((point) => grid.has(point.id) && document.elementFromPoint(point.x, point.y) === document.getElementById('graphPlot')).map((point) => ({ ...point, gap: Math.min(...points.filter((other) => other !== point).map((other) => Math.hypot(other.x - point.x, other.y - point.y))) })).sort((a, b) => b.gap - a.gap)[0];
  window.graphHoverEvents = [];
  window.addEventListener('f1:row-hover', (event) => window.graphHoverEvents.push(event.detail.id));
  return JSON.stringify({ ...best, plot: { x: box.x, y: box.y, width: box.width, height: box.height } });
})()`),
);
await mouse('mouseMoved', graphHover.x, graphHover.y);
await sleep(150);
for (let i = 0; i < 12; i++) {
  await mouse('mouseMoved', graphHover.x + (i % 2 ? 3 : -3), graphHover.y + (i % 3 ? 2 : -2));
  await sleep(40);
}
const stableHover = JSON.parse(await evaluate('JSON.stringify(window.graphHoverEvents)'));
const plotAfterHover = await rectangleOfSelector('#graphPlot');
check(
  'hover stays on one driver while the bubbles move',
  graphHover.gap > 15 &&
    stableHover.length > 0 &&
    stableHover.every((id) => id === graphHover.id) &&
    Math.abs(plotAfterHover.y - graphHover.plot.y) < 1 &&
    Math.abs(plotAfterHover.height - graphHover.plot.height) < 1,
  JSON.stringify({ graphHover, stableHover, plotAfterHover }),
);
await evaluate(
  "(() => { const slider = document.getElementById('graphTimeline'); slider.value = '0'; slider.dispatchEvent(new Event('input', { bubbles: true })); })()",
);
await sleep(350);
const oldGraph = await evaluate(
  "(() => ({ drivers: document.getElementById('graphDriver').options.length, selected: document.getElementById('graphDriver').value, detail: document.getElementById('graphDetail').textContent, weekend: document.getElementById('graphWeekend').textContent, race: new URLSearchParams(location.hash.split('?')[1]).get('race') }))()",
);
check(
  'the graph timeline rewinds the driver network and URL without future links',
  oldGraph.drivers < 30 &&
    oldGraph.selected === '' &&
    !/Max Verstappen/.test(oldGraph.detail) &&
    /2000/.test(oldGraph.weekend) &&
    oldGraph.race === '158',
  JSON.stringify(oldGraph),
);
await evaluate(
  "(() => { const slider = document.getElementById('graphTimeline'); slider.value = slider.max; slider.dispatchEvent(new Event('input', { bubbles: true })); })()",
);
await sleep(350);
check(
  'the initial Max selection returns after rewinding to before his debut',
  await evaluate(
    "document.getElementById('graphDriver').value === '830' && /Max Verstappen/.test(document.getElementById('graphDetail').textContent)",
  ),
);
await evaluate("document.getElementById('graphClose').click()");
await sleep(300);
check('the graph close button returns home', (await evaluate('location.hash')) === '#/');
await evaluate("location.hash = '#/graph'");
await sleep(500);
const graphStage = await rectangleOfSelector('#stage');
await click(graphStage.x + 8, graphStage.y + graphStage.height / 2);
await sleep(300);
check('clicking outside the graph card closes it', (await evaluate('location.hash')) === '#/');
await send('Emulation.clearDeviceMetricsOverride');

for (const c of checks) console.log(`${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
const ok = checks.every((c) => c.pass) && problems.length === 0;
if (problems.length) console.error(problems.join('\n'));
console.log(ok ? 'PASS browser smoke test' : 'FAIL browser smoke test');
cleanup();
process.exit(ok ? 0 : 1);
