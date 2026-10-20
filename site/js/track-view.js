// The race on the front page: while the ratings are shown, the circuit of the weekend appears at the bottom right and the real race is replayed on it, from
// the lap times of every car, ten times faster than it was run: each dot is a car, going round at the pace of the real laps (slowing into the bends and
// speeding up out of them), passing and being passed when the real cars did, stopping when the real ones retired and when the race was red-flagged. Beside
// the circuit is the live timing table: the places, the three letters of each driver and the gap to the leader, which moves when the order changes.
// Pointing at a row of the ratings turns the dot and the table row of that driver (or, in the cars, of both of the team's drivers) red; pointing at a row of
// the table does the same, and lights the row of the ratings.
//
// How a race is worked out is in race-replay.js, the speeds in speed-profile.js and the shape of the circuit in track-geometry.js; the circuit outlines
// (site/assets/tracks.json) and the lap times of each season (data/race-laps/<year>.json) are fetched when they are first needed. No storage; only the
// site's own files are requested. The race can be paused, and starts paused under reduced motion.
import { outlineTable, pointAt, smoothPath, startLine } from './track-geometry.js';
import { lapClock, uniformClock } from './speed-profile.js';
import { TIME_SCALE, buildReplay, gapsAt, progressesAt, screenClock, standingsAt } from './race-replay.js';

const SVG = 'http://www.w3.org/2000/svg';
const DOT = 4.2; // radius of a dot on the screen, in pixels
const HOT_DOT = 7;
const SHOWN_FINISHED = 6; // seconds that a finished race is left on the screen before it starts again
const START_HOLD = 2; // seconds on the grid before the lights go out
const SMALLEST_ROOM = 150; // pixels of height below which the map is not shown
const GAP_EVERY = 200; // milliseconds between two updates of the gaps (the order and the dots move every frame)
const TABLE_COLUMN = 96; // pixels wide of one column of the table
const SMALLEST_ROW = 11; // pixels high: below this the table is not shown
const LARGEST_ROW = 16;
const TABLE_GAP = 14;

const $ = (id) => document.getElementById(id);
const svgElement = (tag, attributes = {}) => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
};

async function fetchJson(path, format) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const file = await response.json();
  if (file.format !== format) throw new Error(`${path} has format ${file.format}; this page reads format ${format}`);
  return file;
}

const gapText = (gap) => {
  if (gap.kind === 'out') return 'OUT';
  if (gap.kind === 'leader') return '—';
  if (gap.kind === 'laps') return `+${gap.value} LAP${gap.value > 1 ? 'S' : ''}`;
  const seconds = gap.value;
  return seconds >= 60 ? `+${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}` : `+${seconds.toFixed(1)}`;
};

export function initTrack() {
  const stage = $('stage');
  const box = $('stageTrack');
  if (!stage || !box) return;
  const parts = {
    name: $('stageTrackName'),
    lap: $('stageTrackLap'),
    map: $('stageTrackMap'),
    halo: $('stageTrackHalo'),
    line: $('stageTrackLine'),
    start: $('stageTrackStart'),
    dots: $('stageTrackDots'),
    table: $('stageTrackTable'),
    pause: $('stageTrackPause'),
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const view = {
    open: false, // the ratings are shown
    wide: false, // on a screen with room for the map beside the panel
    entity: 'driver',
    snap: null, // the weekend shown: { raceId, year, name, circuitId }
    key: '', // the weekend the race on the screen is of
    tracks: null,
    seasons: new Map(), // year -> Promise of its file
    race: null, // the race on the screen: { replay, screen, table, codes, causes }
    dots: new Map(), // driver id -> its dot
    rows: new Map(), // driver id -> its row of the table
    gapTexts: new Map(), // driver id -> the text its gap shows
    order: '', // the places as they are drawn, to see when they change
    columns: 1,
    rowHeight: LARGEST_ROW,
    elapsed: 0, // seconds of race on the screen since the start (negative while the cars are on the grid), not counting pauses
    last: 0,
    lastGaps: 0,
    paused: reducedMotion.matches,
    frame: 0,
    hotRatings: null, // the id of the row of the ratings under the pointer (a driver or a team, whichever the ratings show)
    hotTable: null, // the driver id of the row of the table under the pointer
  };

  const loadTracks = () => (view.tracks ??= fetchJson('./assets/tracks.json', 2).then((file) => file.tracks));
  const loadSeason = (year) => {
    if (!view.seasons.has(year)) view.seasons.set(year, fetchJson(`../data/race-laps/${year}.json`, 2));
    return view.seasons.get(year);
  };

  function hide() {
    box.hidden = true;
    cancelAnimationFrame(view.frame);
    view.frame = 0;
    view.key = '';
  }

  /** The drivers that are pointed at: the one in the table, or the one in the ratings (in the cars, both drivers of the team). */
  function hotDrivers() {
    const cars = view.race?.replay.cars ?? [];
    const hot = new Set();
    if (view.hotTable) hot.add(view.hotTable);
    if (view.hotRatings != null)
      for (const car of cars) if (view.entity === 'driver' ? car.id === view.hotRatings : car.team === view.hotRatings) hot.add(car.id);
    return hot;
  }

  /** The radius of a dot in the units of the map, from its size on the screen. */
  const radius = (pixels) => {
    const rectangle = parts.map.getBoundingClientRect();
    const { width, height } = parts.map.viewBox.baseVal;
    const scale = Math.min(rectangle.width / width, rectangle.height / height);
    return scale > 0 ? pixels / scale : pixels * 3;
  };

  function paintHot() {
    const hot = hotDrivers();
    for (const [id, circle] of view.dots) {
      const on = hot.has(id);
      circle.classList.toggle('hot', on);
      circle.setAttribute('r', radius(on ? HOT_DOT : DOT).toFixed(1));
      if (on) parts.dots.append(circle); // on top of the others
    }
    for (const [id, row] of view.rows) row.classList.toggle('hot', hot.has(id));
  }

  /** How the table is laid out: one column or two, and how high a row is, from the room there is beside the map. */
  function layoutTable() {
    if (!view.race) return;
    const count = view.race.replay.cars.length;
    const height = parts.map.getBoundingClientRect().height;
    const room = box.getBoundingClientRect().width - 160; // the map keeps at least this much
    let chosen = null;
    for (const columns of [1, 2]) {
      const height1 = Math.floor(height / Math.ceil(count / columns));
      if (height1 >= SMALLEST_ROW && room >= columns * TABLE_COLUMN + TABLE_GAP) {
        chosen = { columns, row: Math.min(LARGEST_ROW, height1) };
        break;
      }
    }
    parts.table.hidden = !chosen;
    if (!chosen) return;
    view.columns = chosen.columns;
    view.rowHeight = chosen.row;
    parts.table.style.setProperty('--row-height', `${chosen.row}px`);
    parts.table.style.setProperty('--table-font', `${Math.max(8.5, Math.min(11, chosen.row - 3))}px`);
    parts.table.style.setProperty('--column-width', `${TABLE_COLUMN}px`);
    parts.table.style.setProperty('--table-width', `${chosen.columns * TABLE_COLUMN}px`);
    view.order = ''; // the rows are put where they belong the next time they are drawn
    paintHot();
  }

  function setPaused(paused) {
    view.paused = paused;
    parts.pause.textContent = paused ? 'play' : 'pause';
    parts.pause.setAttribute('aria-pressed', String(paused));
    parts.pause.setAttribute('aria-label', paused ? 'Play the race' : 'Pause the race');
    if (!paused) resume();
  }

  /** Puts the cars, the table and the lap counter where the race is at `view.elapsed`; returns the state of the race. */
  function draw(now) {
    const { replay, screen, table } = view.race;
    const real = screen.realAt(Math.max(0, view.elapsed));
    const progresses = progressesAt(replay, real);
    const standings = standingsAt(replay, real, progresses);
    box.dataset.raceTime = real.toFixed(2); // where the race is, in seconds of its own clock (the tests read it)
    replay.cars.forEach((car, index) => {
      const circle = view.dots.get(car.id);
      const [x, y] = pointAt(table, progresses[index]);
      circle.setAttribute('cx', x.toFixed(1));
      circle.setAttribute('cy', y.toFixed(1));
      circle.classList.toggle('out', !standings.racing[index]);
    });
    const order = standings.order.join(',');
    if (order !== view.order && !parts.table.hidden) {
      view.order = order;
      const perColumn = Math.ceil(replay.cars.length / view.columns);
      standings.order.forEach((index, place) => {
        const row = view.rows.get(replay.cars[index].id);
        row.style.transform = `translate(${Math.floor(place / perColumn) * TABLE_COLUMN}px, ${(place % perColumn) * view.rowHeight}px)`;
        row.firstChild.textContent = place + 1;
        row.classList.toggle('out', !standings.racing[index]);
      });
    }
    if (now - view.lastGaps >= GAP_EVERY || view.lastGaps === 0 || standings.finished) {
      view.lastGaps = now;
      if (!parts.table.hidden) {
        const gaps = gapsAt(replay, real, progresses, standings);
        replay.cars.forEach((car, index) => {
          const text = gapText(gaps[index]);
          if (view.gapTexts.get(car.id) !== text) {
            view.gapTexts.set(car.id, text);
            view.rows.get(car.id).lastChild.textContent = text;
          }
        });
      }
    }
    parts.lap.textContent = standings.finished
      ? `finished · ${replay.laps} ${replay.laps === 1 ? 'lap' : 'laps'}`
      : `lap ${standings.lap} / ${replay.laps}${standings.stopped ? ' · red flag' : ''}`;
    return { real, standings };
  }

  function tick(now) {
    view.frame = 0;
    const seconds = Math.max(0, Math.min(0.1, (now - view.last) / 1000)); // the time since the last frame, never negative or long (a tab left alone)
    if (!view.paused) view.elapsed += seconds * TIME_SCALE;
    view.last = now;
    const { real } = draw(now);
    const { replay, screen } = view.race;
    if (real > replay.end && view.elapsed > screen.shownAt(replay.end) + SHOWN_FINISHED * TIME_SCALE)
      view.elapsed = -START_HOLD * TIME_SCALE; // and it starts again
    if (!view.paused) schedule();
  }

  function schedule() {
    if (!view.frame && !box.hidden) view.frame = requestAnimationFrame(tick);
  }

  /** Starts the clock from now (the race is started, or taken up again after a pause). */
  function resume() {
    view.last = performance.now();
    schedule();
  }

  async function show() {
    if (!view.open || !view.wide || !view.snap) return hide();
    const room = parseFloat(getComputedStyle(stage).getPropertyValue('--track-room'));
    if (!(room >= SMALLEST_ROOM)) return hide();
    const key = view.snap.raceId;
    if (key === view.key && !box.hidden) {
      paintHot();
      return;
    }
    const wanted = key;
    view.key = key;
    let tracks;
    let season;
    try {
      [tracks, season] = await Promise.all([loadTracks(), loadSeason(view.snap.year)]);
    } catch {
      return hide(); // the ratings do not need the race
    }
    if (view.key !== wanted || !view.open) return; // the weekend or the panel has changed meanwhile
    const track = tracks[view.snap.circuitId];
    const race = season.races[view.snap.raceId];
    if (!track || !race) return hide(); // a circuit without an outline (Valencia, Fuji, Korea, India), or a race without lap times
    const replay = buildReplay(race, track.speeds ? lapClock(track.speeds) : uniformClock);
    view.race = {
      replay,
      screen: screenClock(race.stops),
      table: outlineTable(track.points, 720),
      codes: season.codes,
      causes: season.statuses,
    };
    const path = smoothPath(track.points);
    parts.map.setAttribute('viewBox', `0 0 ${track.width} ${track.height}`);
    parts.halo.setAttribute('d', path);
    parts.line.setAttribute('d', path);
    for (const [name, value] of Object.entries(startLine(track.points))) parts.start.setAttribute(name, value.toFixed(1));
    view.dots = new Map(
      replay.cars.map((car) => [car.id, svgElement('circle', { class: 'track-dot', cx: -100, cy: -100, 'data-id': car.id })]),
    );
    parts.dots.replaceChildren(...view.dots.values());
    view.rows = new Map(
      replay.cars.map((car) => {
        const row = document.createElement('li');
        row.dataset.id = car.id;
        const [place, code, gap] = ['place', 'code', 'gap'].map((name) =>
          Object.assign(document.createElement('span'), { className: name }),
        );
        code.textContent = view.race.codes[car.id] ?? '';
        if (car.out && view.race.causes[car.statusId]) row.title = view.race.causes[car.statusId];
        row.append(place, code, gap);
        row.addEventListener('pointerenter', () => {
          view.hotTable = car.id;
          paintHot();
          window.dispatchEvent(new CustomEvent('f1:track-hover', { detail: { driver: car.id, team: car.team } }));
        });
        row.addEventListener('pointerleave', () => {
          view.hotTable = null;
          paintHot();
          window.dispatchEvent(new CustomEvent('f1:track-hover', { detail: { driver: null, team: null } }));
        });
        return [car.id, row];
      }),
    );
    parts.table.replaceChildren(...view.rows.values());
    view.gapTexts = new Map();
    view.order = '';
    parts.name.textContent = `${view.snap.name.replace(/ Grand Prix$/, ' GP')} · ${view.snap.year}`;
    box.hidden = false;
    box.dataset.raceId = view.snap.raceId;
    view.elapsed = -START_HOLD * TIME_SCALE;
    view.lastGaps = 0;
    layoutTable();
    paintHot();
    cancelAnimationFrame(view.frame);
    view.frame = 0;
    draw(performance.now());
    if (!view.paused) resume();
  }

  window.addEventListener('f1:panel-state', (event) => {
    view.open = event.detail.open;
    view.wide = event.detail.wide;
    show();
  });
  window.addEventListener('f1:ratings-drawn', (event) => {
    view.entity = event.detail.entity;
    view.snap = event.detail.snap;
    show();
  });
  window.addEventListener('f1:row-hover', (event) => {
    view.hotRatings = event.detail.id;
    paintHot();
  });
  // the race runs only on the front page (and its ratings): on another page it stops, and starts again when the visitor comes back
  window.addEventListener('f1:workspace-changed', () => {
    if (['home', 'ratings'].includes(document.body.dataset.page)) show();
    else hide();
  });
  new ResizeObserver(() => {
    if (box.hidden || !view.race) return;
    layoutTable();
    paintHot();
    draw(performance.now()); // (paused, nothing else would put the table where it belongs)
  }).observe(box);
  parts.pause.addEventListener('click', () => setPaused(!view.paused));
  reducedMotion.addEventListener('change', () => setPaused(reducedMotion.matches)); // it follows the setting, in both directions
  setPaused(view.paused);
}
