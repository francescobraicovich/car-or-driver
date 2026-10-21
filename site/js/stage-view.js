// The front page: one drawing (a car and a driver's hands) in three colourings, a white two-line title, a square cursor that jitters, and a box that
// opens around the car or the hands. Pointing at either turns the picture black and white, shows the blue version only inside the box, lights the
// matching word (lightly boxed, joined to the picture by a line) and shows the ratings panel; clicking keeps it open, and the panel's own controls
// (the weekend slider, the filters, the selection) are those of the ratings view (ratings-view.js), which draws into it.
//
// Everything that has to line up (the layers, the selectable areas, the box, the title) is placed with the transform and the layout in
// stage-geometry.js. The jitter and the oscillation are only drawn: what is under the pointer is decided with the real pointer position by the two
// buttons (and by the two words), which are also what the keyboard and touch use. Under reduced motion nothing wobbles. No storage, no requests.
import { setEntity } from './ratings-view.js';
import { connectorPoints, panelColumn, sceneFades, sceneGeometry, subjectRectangle, titleLayout } from './stage-geometry.js';
import { shake, sway } from './stage-noise.js';
import { DECK_PAGES, PINNED_PAGES } from './stage-pages.js';

const SUBJECTS = ['car', 'driver'];
const CURSOR_SIZE = 22;
const WORD_PADDING = { x: 14, y: 6 };
const GRACE_MS = 600; // how long what is pointed at stays open after the pointer leaves it, so that the pointer can travel to the panel or to the timing table
const DWELL_MS = 120; // how long the pointer has to stay on a picture, and be slowing down on it, before the ratings switch to it from another one:
const SLOW = 0.45; // the car is on the way from the hands to the panel, and the pointer crosses it quickly (pixels per millisecond)

const $ = (id) => document.getElementById(id);

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
    ledgerClose: $('stageLedgerClose'),
    trackTable: $('stageTrackTable'),
    trackPause: $('stageTrackPause'),
    trackSpeeds: $('stageTrackSpeeds'),
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
    release: null, // the timer that lets go of what is pointed at
    switching: null, // the timer that switches to the picture the pointer has just come onto, from another one
    overPanel: false, // the pointer is on the ratings panel or on the timing table of the race
    announced: false, // whether the address has been told that the ratings are kept open
    opened: false,
    wordOpened: false,
    error: null, // why the ratings could not be loaded, if they could not
    lastMove: 0,
    speed: 0, // how fast the pointer is moving, in pixels per millisecond (smoothed)
  };
  const active = () => view.hover ?? view.focus ?? view.selected;
  const viewOpen = () => parts.ledger.dataset.view !== 'ratings'; // a view (the history, the head to head) is open over the ratings in the panel
  const deckOpen = () => DECK_PAGES.includes(document.body.dataset.page); // a card of slides is over the picture

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
    const { x, y, width, height, wide } = view.geometry;
    stage.style.setProperty('--scene-x', `${x}px`);
    stage.style.setProperty('--scene-y', `${y}px`);
    stage.style.setProperty('--scene-w', `${width}px`);
    stage.style.setProperty('--scene-h', `${height}px`);
    const fades = sceneFades(view.geometry, box.width, box.height);
    for (const side of Object.keys(fades)) stage.style.setProperty(`--fade-${side}`, `${fades[side]}px`);
    stage.dataset.layout = wide ? 'wide' : 'sheet';
    announcePanel();
    const column = panelColumn(box.width);
    if (column) {
      stage.style.setProperty('--panel-left', `${column.left}px`);
      stage.style.setProperty('--panel-width', `${column.width}px`);
    }
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
    // the track is drawn at the bottom right, under the car and the hands (and the label under their box): this much height
    stage.style.setProperty('--track-room', `${Math.max(0, box.height - parts.bottomBar.offsetHeight - 16 - (lowest + 44))}px`);
    view.layout = titleLayout(view.geometry, box.width, box.height);
    stage.style.setProperty('--title-size', `${view.layout.size}px`);
    stage.style.setProperty('--title-top', `${view.layout.top}px`);
    stage.style.setProperty('--title-x', `${view.layout.centre}px`);
    setTitleFilters(view.layout.size);
    for (const subject of SUBJECTS) view.words[subject] = relative(parts.words[subject].getBoundingClientRect());
    view.titleBox = relative(core.getBoundingClientRect());
    wake();
  }

  // ── the ratings panel ───────────────────────────────────────────────────
  function renderPanel() {
    const subject = active();
    parts.ledger.hidden = !subject;
    parts.ledgerClose.hidden = !view.selected;
    if (subject) setEntity(subject);
    announcePanel();
  }

  /** The track on the page (track-view.js) is shown while the panel is, on a screen with room for it beside the panel. */
  let announced = '';
  function announcePanel() {
    const detail = { open: Boolean(active()), wide: stage.dataset.layout === 'wide' };
    if (JSON.stringify(detail) === announced) return;
    announced = JSON.stringify(detail);
    window.dispatchEvent(new CustomEvent('f1:panel-state', { detail }));
  }

  // ── state ───────────────────────────────────────────────────────────────
  function update() {
    const subject = active();
    stage.dataset.state = view.selected || deckOpen() ? 'open' : subject ? 'peek' : 'idle'; // (with a card of slides the picture is grey, as behind the panel)
    stage.dataset.mode = deckOpen() ? 'deck' : '';
    stage.dataset.subject = subject ?? '';
    stage.dataset.hover = view.hover ?? '';
    for (const name of SUBJECTS) parts.hotspots[name].setAttribute('aria-pressed', String(view.selected === name));
    renderPanel();
    if (Boolean(view.selected) !== view.announced) {
      view.announced = Boolean(view.selected);
      window.dispatchEvent(new CustomEvent('f1:ratings-pinned', { detail: { pinned: view.announced } }));
    }
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
    const now = performance.now();
    if (view.pointer && now > view.lastMove)
      view.speed = 0.5 * view.speed + 0.5 * (Math.hypot(point.x - view.pointer.x, point.y - view.pointer.y) / (now - view.lastMove));
    view.pointer = point;
    view.lastMove = now;
    stage.dataset.pointer = 'in';
    wake();
  });
  stage.addEventListener('pointerleave', (event) => {
    if (!isMouse(event)) return;
    view.pointer = null;
    stage.dataset.pointer = '';
  });
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a, .ledger, .word, .track-table')) return;
    if (view.selected) {
      view.selected = null; // pressing on the picture, away from the car and the hands, lets go of the ratings
      update();
    }
  });

  /**
   * What was pointed at closes after a moment, so that the pointer can travel to the panel and the ratings stay while it does. A preview of the
   * picture other than the one kept open closes at once, and is not held by the panel: the panel shows what was kept open. (On a narrow screen the
   * panel cannot be reached from the pictures, so nothing is held.)
   */
  function letGoOfHover(subject) {
    clearTimeout(view.release);
    const otherThanKept = view.selected && view.selected !== subject;
    const close = () => {
      if (view.hover !== subject || (view.overPanel && !otherThanKept)) return;
      view.hover = null;
      update();
    };
    if (stage.dataset.layout === 'wide' && !otherThanKept) view.release = setTimeout(close, GRACE_MS);
    else close();
  }
  /** The pointer is on a picture (or its word): if the ratings show another picture, they switch only once the pointer stays a moment. */
  function pointAt(subject) {
    if (viewOpen() || deckOpen()) return; // a view over the ratings, or the card of the Insights, is open: pointing at the pictures does nothing
    clearTimeout(view.release);
    clearTimeout(view.switching);
    const showing = active();
    if (!showing || showing === subject) {
      view.hover = subject;
      update();
      return;
    }
    const switchIfSlow = () => {
      if (performance.now() - view.lastMove < 100 && view.speed > SLOW)
        view.switching = setTimeout(switchIfSlow, 60); // still crossing
      else {
        view.hover = subject;
        update();
      }
    };
    view.switching = setTimeout(switchIfSlow, DWELL_MS);
  }
  // the panel and the timing table of the race are parts of what is open: the pointer going to either holds the preview, and using either keeps it open
  const held = new Set();
  const hold = (element) => {
    element.addEventListener('pointerenter', (event) => {
      if (!isMouse(event)) return;
      held.add(element);
      view.overPanel = true;
      stage.dataset.overPanel = 'true';
      clearTimeout(view.release);
      if (view.hover && view.selected && view.hover !== view.selected) letGoOfHover(view.hover);
    });
    element.addEventListener('pointerleave', (event) => {
      if (!isMouse(event)) return;
      held.delete(element);
      view.overPanel = held.size > 0;
      stage.dataset.overPanel = view.overPanel ? 'true' : '';
      if (view.hover && !view.overPanel) letGoOfHover(view.hover);
    });
    /** Using it (a press, or the keyboard moving into it) keeps it open, so that letting go of a slider outside it does not close it. */
    const keepOpen = () => {
      if (deckOpen()) return;
      const subject = active();
      if (subject && view.selected !== subject) {
        view.selected = subject;
        update();
      }
    };
    element.addEventListener('pointerdown', keepOpen);
    element.addEventListener('focusin', keepOpen);
  };
  hold(parts.ledger);
  hold(parts.trackTable);
  hold(parts.trackPause);
  hold(parts.trackSpeeds);
  // a card of slides and its list are made when their page is first shown: they are held too
  window.addEventListener('f1:deck-made', (event) => {
    hold(event.detail.card);
    hold(event.detail.list);
  });

  // the picture's area and the word are two ways to the same subject
  for (const subject of SUBJECTS) {
    const targets = [parts.hotspots[subject], parts.words[subject]];
    for (const target of targets) {
      target.addEventListener('pointerenter', (event) => {
        if (isMouse(event)) pointAt(subject);
      });
      target.addEventListener('pointerleave', (event) => {
        if (!isMouse(event)) return;
        clearTimeout(view.switching); // a switch that has not happened by now (the pointer only crossed) does not happen
        if (view.hover) letGoOfHover(view.hover);
      });
      target.addEventListener('click', (event) => {
        pin(subject);
        if (event.detail === 0 && view.selected) parts.ledger.querySelector('#ratingsPanel button')?.focus(); // opened with the keyboard: carry on into the panel
      });
    }
    const button = parts.hotspots[subject];
    button.addEventListener('focus', () => {
      if (!button.matches(':focus-visible')) return;
      view.focus = subject;
      update();
    });
    button.addEventListener('blur', (event) => {
      if (parts.ledger.contains(event.relatedTarget) && !view.selected) view.selected = subject; // Tab into the panel keeps it open
      view.focus = null;
      update();
    });
  }

  /** Lets go of the ratings. A keyboard user inside the panel is put back on the picture they came from. */
  function close() {
    if (!view.selected) return;
    const was = parts.hotspots[view.selected];
    const inPanel = parts.ledger.contains(document.activeElement);
    view.selected = null;
    update();
    if (inPanel) was.focus({ preventScroll: true });
  }
  parts.ledgerClose.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLSelectElement || event.defaultPrevented) return; // Escape closes the open list of a menu, not the panel
    if (viewOpen())
      window.dispatchEvent(new CustomEvent('f1:ledger-back')); // over the ratings it goes back to them; the next one closes the panel
    else close();
  });

  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(stage);
  resizeObserver.observe(parts.bottomBar);
  document.fonts?.ready.then(layout); // the words are measured once the title font is in
  reducedMotion.addEventListener('change', wake);
  window.addEventListener('f1:workspace-changed', () => {
    // the front page is the picture alone, and the ratings page is the same page with the panel kept open
    if (PINNED_PAGES.includes(document.body.dataset.page)) view.selected ??= 'driver';
    else view.selected = null;
    layout();
    update();
  });
  // the panel's Drivers and Cars buttons choose what is kept open
  window.addEventListener('f1:entity-chosen', (event) => {
    view.selected = event.detail.entity;
    clearTimeout(view.release);
    view.hover = null; // the picture that was pointed at on the way to the panel would otherwise outrank the choice
    update();
  });
  window.addEventListener('f1:ratings-failed', (event) => {
    view.error = event.detail?.message || 'unknown error';
    parts.tagline.textContent = `Could not load the ratings: ${view.error}. Reload the page to try again.`; // the front page has no loading screen to say so
    update();
  });

  stage.dataset.coarse = String(!finePointer.matches);
  if (PINNED_PAGES.includes(document.body.dataset.page)) view.selected = 'driver';
  layout();
  update();
}
