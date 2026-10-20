// The front page: one drawing (a car and a driver's hands) in three colourings, a white two-line title, a square cursor that jitters, and a box that
// opens around the car or the hands. Pointing at either turns the picture black and white, shows the blue version only inside the box, lights the
// matching word (lightly boxed, joined to the picture by a line) and shows the ratings; clicking keeps them open.
//
// Everything that has to line up (the layers, the selectable areas, the box, the title) is placed with the transform and the layout in
// stage-geometry.js. The jitter and the oscillation are only drawn: what is under the pointer is decided with the real pointer position by the two
// buttons (and by the two words), which are also what the keyboard and touch use. Under reduced motion nothing wobbles. No storage, no requests.
import { state } from './state.js';
import { ratingRows } from './ratings-view.js';
import { connectorPoints, sceneGeometry, subjectRectangle, titleLayout } from './stage-geometry.js';
import { shake, sway } from './stage-noise.js';
import { ledgerRows, spokenRow } from './stage-ledger.js';

const SUBJECTS = ['car', 'driver'];
const CURSOR_SIZE = 22;
const METRIC = 'combined';
const WORD_PADDING = { x: 14, y: 6 };

const $ = (id) => document.getElementById(id);
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function initStage() {
  const stage = $('stage');
  if (!stage) return;
  const title = $('stageTitle');
  const parts = {
    blue: stage.querySelector('.layer-blue'),
    cursor: $('stageCursor'),
    frame: $('stageFrame'),
    wordFrame: $('stageWordFrame'),
    connector: { line: $('stageConnectorLine'), start: $('stageConnectorStart'), end: $('stageConnectorEnd') },
    ledger: $('stageLedger'),
    ledgerTitle: $('stageLedgerTitle'),
    ledgerPin: $('stageLedgerPin'),
    ledgerList: $('stageLedgerList'),
    ledgerDetail: $('stageLedgerDetail'),
    tagline: stage.querySelector('.stage-tagline'),
    bottomBar: stage.querySelector('.stage-bottom'),
    hotspots: { car: $('hotspotCar'), driver: $('hotspotDriver') },
    words: { car: title.querySelector('.word-car'), driver: title.querySelector('.word-driver') },
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  // two copies of the title go behind it as streaks (the filters that smear them are set in layout())
  const core = title.querySelector('.title-core');
  for (const name of ['far', 'near']) {
    const layer = core.cloneNode(true);
    layer.className = `title-layer title-smear-${name}`;
    layer.setAttribute('aria-hidden', 'true');
    title.insertBefore(layer, core);
  }

  const view = {
    hover: null, // the subject under the mouse (on the picture or on its word)
    focus: null, // the subject with keyboard focus
    selected: null, // the subject whose ratings are kept open
    pointer: null, // the real pointer position on the stage, or null
    cursor: { x: 0, y: 0 }, // where the small square is drawn (follows the pointer with a lag)
    frame: { x: 0, y: 0, width: CURSOR_SIZE, height: CURSOR_SIZE }, // the box on the picture (follows its target with a lag)
    wordFrame: { x: 0, y: 0, width: 0, height: 0 }, // the box on the word
    geometry: null,
    layout: null,
    words: {}, // the words' rectangles on the stage
    titleBox: null,
    origin: { x: 0, y: 0 },
    running: false,
    last: 0,
    ledgerKey: '',
    detailHint: '', // what the line under the list says until a row is pointed at
    opened: false,
    wordOpened: false,
    error: null, // why the ratings could not be loaded, if they could not
    lastMove: 0,
  };
  const active = () => view.hover ?? view.focus ?? view.selected;

  // ── what the ratings say ────────────────────────────────────────────────
  function readRatings() {
    const model = state.model;
    if (!model?.snaps?.length) return { weekend: null, rows: { car: [], driver: [] } };
    const index = model.snaps.length - 1;
    const snap = model.snaps[index];
    return {
      weekend: `${snap.year} ${snap.name}`,
      rows: Object.fromEntries(SUBJECTS.map((subject) => [subject, ratingRows(model, index, subject, METRIC)])),
    };
  }
  let ratings = readRatings();

  // ── layout ──────────────────────────────────────────────────────────────
  const relative = (rectangle) => ({
    x: rectangle.left - view.origin.x,
    y: rectangle.top - view.origin.y,
    width: rectangle.width,
    height: rectangle.height,
  });

  /** How far the smoke displaces the letters and how long the streaks are depends on the size of the letters. */
  function setTitleFilters(size) {
    $('titleSmokeDisplacement').setAttribute('scale', (size * 0.055).toFixed(2));
    $('titleSmokeBlur').setAttribute('stdDeviation', `${(size * 0.01).toFixed(2)} ${(size * 0.004).toFixed(2)}`);
    $('titleSmearNearBlur').setAttribute('stdDeviation', `${(size * 0.28).toFixed(1)} 0.6`);
    $('titleSmearFarBlur').setAttribute('stdDeviation', `${(size * 0.75).toFixed(1)} 1`);
  }

  function layout() {
    const box = stage.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    view.origin = { x: box.left, y: box.top };
    view.geometry = sceneGeometry(box.width, box.height);
    const { x, y, width, height, fits } = view.geometry;
    stage.style.setProperty('--scene-x', `${x}px`);
    stage.style.setProperty('--scene-y', `${y}px`);
    stage.style.setProperty('--scene-w', `${width}px`);
    stage.style.setProperty('--scene-h', `${height}px`);
    stage.dataset.fit = String(fits);
    for (const subject of SUBJECTS) {
      const rectangle = subjectRectangle(view.geometry, subject);
      Object.assign(parts.hotspots[subject].style, {
        left: `${rectangle.x}px`,
        top: `${rectangle.y}px`,
        width: `${rectangle.width}px`,
        height: `${rectangle.height}px`,
      });
    }
    stage.style.setProperty('--bottom-space', `${parts.bottomBar.offsetHeight}px`); // the ratings sit above the bottom row, however many lines it wraps to
    // the ratings stay below the car and the hands where the screen is tall enough, so that they do not cover what is being pointed at
    const lowest = Math.max(
      ...SUBJECTS.map((subject) => subjectRectangle(view.geometry, subject)).map(
        (rectangle) => rectangle.y - view.origin.y + rectangle.height,
      ),
    );
    stage.style.setProperty('--ledger-room', `${Math.max(0, box.height - parts.bottomBar.offsetHeight - 8 - lowest - 12)}px`);
    view.layout = titleLayout(view.geometry, box.width, box.height);
    stage.style.setProperty('--title-size', `${view.layout.size}px`);
    stage.style.setProperty('--title-top', `${view.layout.top}px`);
    stage.style.setProperty('--title-x', `${view.layout.centre}px`);
    setTitleFilters(view.layout.size);
    for (const subject of SUBJECTS) view.words[subject] = relative(parts.words[subject].getBoundingClientRect());
    view.titleBox = relative(core.getBoundingClientRect());
    wake();
  }

  // ── the ratings list ────────────────────────────────────────────────────
  function renderLedger() {
    const subject = active();
    parts.ledger.hidden = !subject;
    if (!subject) {
      view.ledgerKey = '';
      return;
    }
    const rows = ledgerRows(ratings.rows[subject]);
    const key = `${subject}:${ratings.weekend}:${rows.length}:${view.error ?? ''}`;
    // what the reader can do depends on whether the list is kept open (only then can a row be reached) and on the kind of pointer
    const pinned = view.selected === subject;
    const touch = stage.dataset.coarse === 'true';
    parts.ledgerPin.textContent = pinned
      ? touch
        ? 'kept open · tap the picture again to close'
        : 'kept open · Esc closes'
      : 'click the picture to keep this open';
    const hint = !pinned || !rows.length ? '' : touch ? 'Tap a row for the details.' : 'Move over a row, or use j and k, for the details.';
    if (hint !== view.detailHint) {
      view.detailHint = hint;
      parts.ledgerDetail.textContent = hint;
    }
    if (key === view.ledgerKey) return;
    view.ledgerKey = key;
    parts.ledger.setAttribute('aria-label', `${subject === 'car' ? 'Car' : 'Driver'} ratings`);
    parts.ledgerTitle.textContent = view.error
      ? `Could not load the ratings: ${view.error}. Reload the page to try again.`
      : rows.length
        ? `${subject}s after the ${ratings.weekend} · combined pace · 1000 is the average of the field · ± is one standard deviation`
        : 'Loading the ratings…';
    const items = rows.map((row, index) => {
      const item = element('li');
      const button = element('button', 'ledger-row');
      button.type = 'button';
      button.dataset.index = String(index);
      button.setAttribute('aria-label', spokenRow(row, subject));
      button.append(element('span', 'rank', row.rank), element('span', 'name', row.name));
      if (subject === 'driver') button.append(element('span', 'team', row.team));
      button.append(
        element('span', 'rating', row.rating),
        element('span', 'deviation', row.deviation),
        element('span', 'bar', row.bar),
        element('span', 'change', row.change),
      );
      for (const decoration of button.querySelectorAll('.bar, .change')) decoration.setAttribute('aria-hidden', 'true');
      const describe = () => {
        const source = ratings.rows[subject].find((candidate) => String(candidate.id) === String(row.id));
        const pieces = [row.name];
        if (subject === 'driver' && row.team) pieces.push(row.team);
        pieces.push(`rating ${row.rating} ${row.deviation}`);
        if (Number.isFinite(source?.race)) pieces.push(`race ${Math.round(source.race)}`);
        if (Number.isFinite(source?.qual)) pieces.push(`qualifying ${Math.round(source.qual)}`);
        parts.ledgerDetail.textContent = pieces.join(' · ');
      };
      button.addEventListener('pointerenter', describe);
      button.addEventListener('focus', describe);
      item.append(button);
      return item;
    });
    parts.ledgerList.classList.toggle('with-team', subject === 'driver');
    parts.ledgerList.replaceChildren(...items);
    parts.ledgerDetail.textContent = hint;
  }

  // ── state ───────────────────────────────────────────────────────────────
  function update() {
    const subject = active();
    stage.dataset.state = view.selected ? 'open' : subject ? 'peek' : 'idle';
    stage.dataset.subject = subject ?? '';
    stage.dataset.hover = view.hover ?? '';
    for (const name of SUBJECTS) parts.hotspots[name].setAttribute('aria-pressed', String(view.selected === name));
    renderLedger();
    wake();
  }

  /** Keeps `subject` open (or lets go of it, when it already is). */
  function pin(subject) {
    view.selected = view.selected === subject ? null : subject;
    update();
  }

  // ── movement ────────────────────────────────────────────────────────────
  function wake() {
    if (view.running || !view.geometry) return;
    view.running = true;
    view.last = performance.now();
    requestAnimationFrame(tick);
  }

  const around = (box, padding) => ({
    x: box.x - padding.x,
    y: box.y - padding.y,
    width: box.width + 2 * padding.x,
    height: box.height + 2 * padding.y,
  });

  /** A box with its four edges drifting on their own noise; `amount` scales the drift (0 under reduced motion). */
  function wobbled(box, seconds, seed, drift, amount) {
    const edge = (value, offset) =>
      value + sway(seconds, seed + offset) * drift * amount + shake(seconds, seed + offset + 100) * 0.28 * drift * amount;
    const left = edge(box.x, 1);
    const top = edge(box.y, 2);
    const right = edge(box.x + box.width, 3);
    const bottom = edge(box.y + box.height, 4);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  const place = (node, box) => {
    node.style.transform = `translate(${box.x}px, ${box.y}px)`;
    node.style.width = `${box.width}px`;
    node.style.height = `${box.height}px`;
  };

  function tick(now) {
    const seconds = now / 1000;
    const dt = Math.min(0.05, Math.max(0.001, (now - view.last) / 1000));
    view.last = now;
    const still = reducedMotion.matches;
    const amount = still ? 0 : 1;
    let busy = false;

    // the small square follows the pointer with a lag, and shakes more the faster the pointer moves
    if (view.pointer) {
      const follow = still ? 1 : 1 - Math.exp(-dt * 26);
      const dx = view.pointer.x - view.cursor.x;
      const dy = view.pointer.y - view.cursor.y;
      view.cursor.x += dx * follow;
      view.cursor.y += dy * follow;
      const speed = Math.hypot(dx, dy) / dt;
      const resting = now - view.lastMove > 2500; // a pointer that has stopped for a while stops shaking, and the loop can rest
      const shakiness = resting ? 0 : amount * (1 + Math.min(speed / 260, 4.5));
      const x = view.cursor.x + shake(seconds, 11) * shakiness;
      const y = view.cursor.y + shake(seconds, 12) * shakiness;
      parts.cursor.style.transform = `translate(${x}px, ${y}px)`;
      busy = !resting;
    }

    const subject = active();
    if (subject) {
      // the box on the picture opens out of the small square (or, with the keyboard and no pointer, out of the middle of the subject)
      const rectangle = subjectRectangle(view.geometry, subject);
      const target = { x: rectangle.x - view.origin.x, y: rectangle.y - view.origin.y, width: rectangle.width, height: rectangle.height };
      if (!view.opened) {
        const from = view.pointer
          ? { x: view.cursor.x - CURSOR_SIZE / 2, y: view.cursor.y - CURSOR_SIZE / 2 }
          : { x: target.x + target.width / 2, y: target.y + target.height / 2 };
        view.frame = { ...from, width: CURSOR_SIZE, height: CURSOR_SIZE };
      }
      const open = still ? 1 : 1 - Math.exp(-dt * 13);
      for (const key of ['x', 'y', 'width', 'height']) view.frame[key] += (target[key] - view.frame[key]) * open;
      const box = wobbled(view.frame, seconds, 20, 3.2, amount);
      place(parts.frame, box);
      const { x: sceneX, y: sceneY, width: sceneWidth, height: sceneHeight } = view.geometry;
      const inset = {
        left: box.x + view.origin.x - sceneX,
        top: box.y + view.origin.y - sceneY,
        right: sceneWidth - (box.x + box.width + view.origin.x - sceneX),
        bottom: sceneHeight - (box.y + box.height + view.origin.y - sceneY),
      };
      parts.blue.style.clipPath = `inset(${Math.max(0, inset.top)}px ${Math.max(0, inset.right)}px ${Math.max(0, inset.bottom)}px ${Math.max(0, inset.left)}px)`;

      // the lightly drawn box on the word, which moves from one word to the other when the pointer does, and the line from it to the picture's box
      const wordTarget = around(view.words[subject], WORD_PADDING);
      if (!view.wordOpened) view.wordFrame = { ...wordTarget };
      for (const key of ['x', 'y', 'width', 'height']) view.wordFrame[key] += (wordTarget[key] - view.wordFrame[key]) * open;
      const wordBox = wobbled(view.wordFrame, seconds, 40, 1.2, amount);
      place(parts.wordFrame, wordBox);
      const points = connectorPoints(wordBox, box, view.titleBox);
      parts.connector.line.setAttribute('points', points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '));
      const [first, last] = [points[0], points[points.length - 1]];
      parts.connector.start.setAttribute('x', (first.x - 3.5).toFixed(1));
      parts.connector.start.setAttribute('y', (first.y - 3.5).toFixed(1));
      parts.connector.end.setAttribute('x', (last.x - 3.5).toFixed(1));
      parts.connector.end.setAttribute('y', (last.y - 3.5).toFixed(1));
      busy = true;
    }
    view.opened = Boolean(subject);
    view.wordOpened = Boolean(subject);

    if (busy) requestAnimationFrame(tick);
    else view.running = false;
  }

  // ── events ──────────────────────────────────────────────────────────────
  const isMouse = (event) => event.pointerType === 'mouse' || event.pointerType === 'pen';

  stage.addEventListener('pointermove', (event) => {
    if (!isMouse(event)) return;
    const point = { x: event.clientX - view.origin.x, y: event.clientY - view.origin.y };
    if (!view.pointer) view.cursor = { ...point };
    view.pointer = point;
    view.lastMove = performance.now();
    stage.dataset.pointer = 'in';
    wake();
  });
  stage.addEventListener('pointerleave', (event) => {
    if (!isMouse(event)) return;
    view.pointer = null;
    stage.dataset.pointer = '';
  });
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a, .ledger, .word')) return;
    if (view.selected) {
      view.selected = null; // pressing on the picture, away from the car and the hands, lets go of the ratings
      update();
    }
  });

  // the picture's area and the word are two ways to the same subject
  for (const subject of SUBJECTS) {
    const targets = [parts.hotspots[subject], parts.words[subject]];
    for (const target of targets) {
      target.addEventListener('pointerenter', (event) => {
        if (!isMouse(event)) return;
        view.hover = subject;
        update();
      });
      target.addEventListener('pointerleave', (event) => {
        if (!isMouse(event) || view.hover !== subject) return;
        view.hover = null;
        update();
      });
      target.addEventListener('click', (event) => {
        pin(subject);
        if (event.detail === 0 && view.selected) parts.ledgerList.querySelector('button')?.focus(); // opened with the keyboard: carry on into the list
      });
    }
    const button = parts.hotspots[subject];
    button.addEventListener('focus', () => {
      if (!button.matches(':focus-visible')) return;
      view.focus = subject;
      update();
    });
    button.addEventListener('blur', () => {
      view.focus = null;
      update();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (document.body.dataset.page !== 'home' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const rows = [...parts.ledgerList.querySelectorAll('button')];
    const at = rows.indexOf(document.activeElement);
    const move = (to) => {
      event.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus();
    };
    if (event.key === 'Escape') {
      if (view.selected) {
        const was = parts.hotspots[view.selected];
        const inList = parts.ledger.contains(document.activeElement); // the keyboard user is put back where they came from
        view.selected = null;
        update();
        if (inList) was.focus({ preventScroll: true });
      }
    } else if (at >= 0) {
      // single-letter keys only act while the focus is inside the list (WCAG 2.1.4), so they cannot be triggered by accident elsewhere
      if (['j', 'ArrowDown'].includes(event.key)) move(at + 1);
      else if (['k', 'ArrowUp'].includes(event.key)) move(at - 1);
      else if (event.key === 'Home') move(0);
      else if (event.key === 'End') move(rows.length - 1);
    }
  });

  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(stage);
  resizeObserver.observe(parts.bottomBar);
  document.fonts?.ready.then(layout); // the words are measured once the title font is in
  reducedMotion.addEventListener('change', wake);
  window.addEventListener('f1:workspace-changed', () => {
    if (document.body.dataset.page === 'home') layout();
  });
  const refreshRatings = () => {
    ratings = readRatings();
    view.ledgerKey = '';
    update();
  };
  window.addEventListener('f1:ratings-failed', (event) => {
    view.error = event.detail?.message || 'unknown error';
    parts.tagline.textContent = `Could not load the ratings: ${view.error}. Reload the page to try again.`; // the front page has no loading screen to say so
    refreshRatings();
  });
  window.addEventListener('f1:ratings-ready', refreshRatings);
  window.addEventListener('f1:model-ready', refreshRatings);

  stage.dataset.coarse = String(!finePointer.matches);
  layout();
  update();
  if (state.model) refreshRatings();
}
