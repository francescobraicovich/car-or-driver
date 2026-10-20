// The front page: one drawing (a car and a driver's hands) in three colourings, a square cursor that jitters, and a box that opens around the car or
// the hands. Pointing at either turns the picture black and white and shows the blue version only inside the box; clicking opens the ratings.
//
// Everything that has to line up (the layers, the selectable areas, the box) is placed with the one transform in stage-geometry.js. The jitter and
// the oscillation are only drawn: what is under the pointer is decided with the real pointer position by the two buttons, which are also what the
// keyboard and touch use. Under reduced motion nothing wobbles. No storage, no requests of its own.
import { state } from './state.js';
import { ratingRows } from './ratings-view.js';
import { sceneGeometry, subjectRectangle } from './stage-geometry.js';
import { shake, sway } from './stage-noise.js';
import { codeLines } from './stage-code.js';
import { ledgerRows } from './stage-ledger.js';

const SUBJECTS = ['car', 'driver'];
const CURSOR_SIZE = 22;
const METRIC = 'combined';

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
  const parts = {
    scene: $('stageScene'),
    blue: stage.querySelector('.layer-blue'),
    cursor: $('stageCursor'),
    frame: $('stageFrame'),
    frameLabel: $('stageFrameLabel'),
    code: $('stageCode'),
    ledger: $('stageLedger'),
    ledgerTitle: $('stageLedgerTitle'),
    ledgerList: $('stageLedgerList'),
    ledgerDetail: $('stageLedgerDetail'),
    mode: $('stageMode'),
    path: $('stagePath'),
    hotspots: { car: $('hotspotCar'), driver: $('hotspotDriver') },
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  const view = {
    hover: null, // the subject under the mouse
    focus: null, // the subject with keyboard focus
    selected: null, // the subject whose ratings are open
    pointer: null, // the real pointer position on the stage, or null
    cursor: { x: 0, y: 0 }, // where the small square is drawn (follows the pointer with a lag)
    frame: { x: 0, y: 0, width: CURSOR_SIZE, height: CURSOR_SIZE }, // the box (follows its target with a lag)
    geometry: null,
    origin: { x: 0, y: 0 },
    running: false,
    last: 0,
    codeKey: '',
    ledgerKey: '',
    rows: { car: [], driver: [] },
    opened: false,
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
    fitCode();
    wake();
  }

  // ── text ────────────────────────────────────────────────────────────────
  function leaderOf(subject) {
    const row = ratings.rows[subject]?.find((candidate) => Number.isFinite(candidate.value));
    return row ? { name: row.name, team: row.car, rating: row.value, deviation: row.combinedSd } : null;
  }

  function renderCode() {
    const subject = active();
    const lines = codeLines({
      subject,
      open: view.selected === subject && subject !== null,
      weekend: ratings.weekend,
      leader: subject ? leaderOf(subject) : null,
      count: subject ? ratings.rows[subject].length : 0,
    });
    const key = JSON.stringify(lines);
    if (key === view.codeKey) return;
    view.codeKey = key;
    const fragment = document.createDocumentFragment();
    lines.forEach((tokens, index) => {
      const line = element('span', 'line');
      line.style.setProperty('--i', String(index));
      line.append(element('span', 'ln', String(index + 1)));
      for (const [kind, text] of tokens) line.append(element('span', kind, text));
      fragment.append(line);
    });
    parts.code.replaceChildren(fragment);
    fitCode();
  }

  /** The text never runs into the car or the hands: if it is taller than the room above them, it is set a little smaller. */
  function fitCode() {
    if (!view.geometry) return;
    parts.code.style.removeProperty('--code-size');
    const available = Math.min(...SUBJECTS.map((subject) => subjectRectangle(view.geometry, subject).y)) - parts.code.offsetTop - 44; // room for the box's label above the subject
    let size = parseFloat(getComputedStyle(parts.code).fontSize);
    while (parts.code.scrollHeight > available && size > 10) {
      size -= 0.5;
      parts.code.style.setProperty('--code-size', `${size}px`);
    }
  }

  function renderLedger() {
    const subject = view.selected;
    parts.ledger.hidden = !subject;
    if (!subject) {
      view.ledgerKey = '';
      return;
    }
    const rows = ledgerRows(ratings.rows[subject]);
    const key = `${subject}:${ratings.weekend}:${rows.length}`;
    if (key === view.ledgerKey) return;
    view.ledgerKey = key;
    const noun = subject === 'car' ? 'Car' : 'Driver';
    parts.ledger.setAttribute('aria-label', `${noun} ratings`);
    parts.ledgerTitle.textContent = rows.length
      ? `// ${subject}s after the ${ratings.weekend} · combined pace · 1000 is the average of the field · ± is one standard deviation`
      : '// loading the ratings…';
    const items = rows.map((row, index) => {
      const item = element('li');
      const button = element('button', 'ledger-row');
      button.type = 'button';
      button.dataset.index = String(index);
      button.append(element('span', 'rank', row.rank), element('span', 'name', row.name));
      if (subject === 'driver') button.append(element('span', 'team', row.team));
      button.append(
        element('span', 'rating', row.rating),
        element('span', 'deviation', row.deviation),
        element('span', 'bar', row.bar),
        element('span', 'change', row.change),
      );
      const describe = () => {
        const source = ratings.rows[subject].find((candidate) => String(candidate.id) === String(row.id));
        const pieces = [row.name];
        if (subject === 'driver' && row.team) pieces.push(row.team);
        pieces.push(`rating ${row.rating} ${row.deviation}`);
        if (Number.isFinite(source?.race)) pieces.push(`race ${Math.round(source.race)}`);
        if (Number.isFinite(source?.qual)) pieces.push(`qualifying ${Math.round(source.qual)}`);
        parts.ledgerDetail.textContent = `// ${pieces.join(' · ')}`;
      };
      button.addEventListener('pointerenter', describe);
      button.addEventListener('focus', describe);
      item.append(button);
      return item;
    });
    parts.ledgerList.classList.toggle('with-team', subject === 'driver');
    parts.ledgerList.replaceChildren(...items);
    parts.ledgerDetail.textContent = rows.length ? '// move over a row, or use j and k, for the details' : '';
  }

  // ── state ───────────────────────────────────────────────────────────────
  function update() {
    const subject = active();
    const mode = view.selected ? 'open' : subject ? 'peek' : 'idle';
    stage.dataset.state = mode;
    stage.dataset.subject = subject ?? '';
    stage.dataset.hover = view.hover ?? '';
    for (const name of SUBJECTS) parts.hotspots[name].setAttribute('aria-pressed', String(view.selected === name));
    parts.mode.textContent = mode === 'open' ? 'SELECT' : mode === 'peek' ? 'HOVER' : 'NORMAL';
    parts.path.textContent = `~/driver-or-car/${subject ?? 'front-page'}.ts`;
    parts.frameLabel.textContent = subject ? (view.selected === subject ? `${subject}` : `${subject} · click to open`) : '';
    renderCode();
    renderLedger();
    wake();
  }

  function select(subject) {
    if (view.selected === subject) return;
    view.selected = subject;
    update();
  }

  // ── movement ────────────────────────────────────────────────────────────
  function wake() {
    if (view.running || !view.geometry) return;
    view.running = true;
    view.last = performance.now();
    requestAnimationFrame(tick);
  }

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
      const shakiness = amount * (1 + Math.min(speed / 260, 4.5));
      const x = view.cursor.x + shake(seconds, 11) * shakiness;
      const y = view.cursor.y + shake(seconds, 12) * shakiness;
      parts.cursor.style.transform = `translate(${x}px, ${y}px)`;
      busy = true;
    }

    // the box follows its target (the subject, or the small square when there is none) and its four edges wobble on their own
    const subject = active();
    if (subject && !view.opened) {
      // the box opens out of the small square (or, with the keyboard and no pointer, out of the middle of the subject)
      const from = view.pointer
        ? { x: view.cursor.x - CURSOR_SIZE / 2, y: view.cursor.y - CURSOR_SIZE / 2 }
        : (() => {
            const rectangle = subjectRectangle(view.geometry, subject);
            return { x: rectangle.x - view.origin.x + rectangle.width / 2, y: rectangle.y - view.origin.y + rectangle.height / 2 };
          })();
      view.frame = { ...from, width: CURSOR_SIZE, height: CURSOR_SIZE };
    }
    view.opened = Boolean(subject);
    const target = subject
      ? (() => {
          const rectangle = subjectRectangle(view.geometry, subject);
          return { x: rectangle.x - view.origin.x, y: rectangle.y - view.origin.y, width: rectangle.width, height: rectangle.height };
        })()
      : { x: view.cursor.x - CURSOR_SIZE / 2, y: view.cursor.y - CURSOR_SIZE / 2, width: CURSOR_SIZE, height: CURSOR_SIZE };
    const open = still ? 1 : 1 - Math.exp(-dt * 13);
    for (const key of ['x', 'y', 'width', 'height']) view.frame[key] += (target[key] - view.frame[key]) * open;
    if (subject) {
      const wobble = 3.2 * amount;
      const edge = (base, seed) => base + sway(seconds, seed) * wobble + shake(seconds, seed + 100) * 0.9 * amount;
      const left = edge(view.frame.x, 21);
      const top = edge(view.frame.y, 22);
      const right = edge(view.frame.x + view.frame.width, 23);
      const bottom = edge(view.frame.y + view.frame.height, 24);
      parts.frame.style.transform = `translate(${left}px, ${top}px)`;
      parts.frame.style.width = `${right - left}px`;
      parts.frame.style.height = `${bottom - top}px`;
      const { x: sceneX, y: sceneY, width: sceneWidth, height: sceneHeight } = view.geometry;
      const insetLeft = left + view.origin.x - sceneX;
      const insetTop = top + view.origin.y - sceneY;
      const insetRight = sceneWidth - (right + view.origin.x - sceneX);
      const insetBottom = sceneHeight - (bottom + view.origin.y - sceneY);
      parts.blue.style.clipPath = `inset(${Math.max(0, insetTop)}px ${Math.max(0, insetRight)}px ${Math.max(0, insetBottom)}px ${Math.max(0, insetLeft)}px)`;
      busy = true;
    }

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
    stage.dataset.pointer = 'in';
    wake();
  });
  stage.addEventListener('pointerleave', (event) => {
    if (!isMouse(event)) return;
    view.pointer = null;
    stage.dataset.pointer = '';
  });
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a, .ledger')) return;
    select(null); // pressing on the picture, away from the car and the hands, closes the ratings
  });

  for (const subject of SUBJECTS) {
    const button = parts.hotspots[subject];
    button.addEventListener('pointerenter', (event) => {
      if (!isMouse(event)) return;
      view.hover = subject;
      update();
    });
    button.addEventListener('pointerleave', (event) => {
      if (!isMouse(event)) return;
      view.hover = null;
      update();
    });
    button.addEventListener('focus', () => {
      if (!button.matches(':focus-visible')) return;
      view.focus = subject;
      update();
    });
    button.addEventListener('blur', () => {
      view.focus = null;
      update();
    });
    button.addEventListener('click', (event) => {
      select(subject);
      if (event.detail === 0) parts.ledgerList.querySelector('button')?.focus(); // opened with the keyboard: carry on into the list
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
        select(null);
        was.focus({ preventScroll: true });
      }
    } else if (event.key === 'c' && !event.shiftKey) select('car');
    else if (event.key === 'd' && !event.shiftKey) select('driver');
    else if (view.selected && rows.length && ['j', 'ArrowDown'].includes(event.key)) move(at < 0 ? 0 : at + 1);
    else if (view.selected && rows.length && ['k', 'ArrowUp'].includes(event.key)) move(at < 0 ? 0 : at - 1);
    else if (view.selected && rows.length && event.key === 'Home') move(0);
    else if (view.selected && rows.length && event.key === 'End') move(rows.length - 1);
  });

  new ResizeObserver(layout).observe(stage);
  reducedMotion.addEventListener('change', wake);
  window.addEventListener('f1:workspace-changed', () => {
    if (document.body.dataset.page === 'home') layout();
  });
  const refreshRatings = () => {
    ratings = readRatings();
    view.codeKey = '';
    view.ledgerKey = '';
    update();
  };
  window.addEventListener('f1:ratings-ready', refreshRatings);
  window.addEventListener('f1:model-ready', refreshRatings);

  stage.dataset.coarse = String(!finePointer.matches);
  layout();
  update();
  if (state.model) refreshRatings();
}
