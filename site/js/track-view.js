// The track on the front page: while the ratings are shown, the circuit of the weekend appears at the bottom right and a dot for each driver (or each team,
// when the cars are shown) races round it at its average pace, thirty times faster than the real race, with a lap counter. The dot of the row under the
// pointer in the ratings turns red and larger. Where the paces and the laps come from, and how the race is worked out, is in track-geometry.js; the
// circuit outlines (site/assets/tracks.json) and the laps of each season (data/race-laps/<year>.json) are fetched when they are first needed.
// No storage; only the site's own files are requested. The race can be paused, and it starts paused under reduced motion.
import { TIME_SCALE, raceState, runners, smoothPath, startLine } from './track-geometry.js';

const SVG = 'http://www.w3.org/2000/svg';
const DOT = 9;
const HOT_DOT = 15;
const SHOWN_FINISHED = 6; // seconds that a finished race is left on the screen before it starts again
const SMALLEST_ROOM = 150; // pixels of height below which the map is not shown

const $ = (id) => document.getElementById(id);
const svgElement = (tag, attributes = {}) => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
};

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

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
    pause: $('stageTrackPause'),
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const view = {
    open: false, // the ratings are shown
    wide: false, // on a screen with room for the map beside the panel
    entity: 'driver',
    snap: null, // the weekend shown: { raceId, year, name, circuitId }
    key: '', // the weekend and the entity the race on the screen is of
    tracks: null,
    seasons: new Map(), // year -> Promise of its file
    runners: [],
    laps: 0,
    circles: new Map(), // runner id -> its dot
    length: 0, // of the path, in units
    elapsed: 0, // seconds of race time on the screen since the start, not counting pauses
    last: 0,
    paused: reducedMotion.matches,
    frame: 0,
    hot: null,
  };

  const loadTracks = () => (view.tracks ??= fetchJson('./assets/tracks.json').then((file) => file.tracks));
  const loadSeason = (year) => {
    if (!view.seasons.has(year)) view.seasons.set(year, fetchJson(`../data/race-laps/${year}.json`));
    return view.seasons.get(year);
  };

  function hide() {
    box.hidden = true;
    cancelAnimationFrame(view.frame);
    view.frame = 0;
    view.key = '';
  }

  function paintHot() {
    for (const [id, circle] of view.circles) {
      const hot = id === view.hot;
      circle.classList.toggle('hot', hot);
      circle.setAttribute('r', hot ? HOT_DOT : DOT);
      if (hot) parts.dots.append(circle); // on top of the others
    }
  }

  function setPaused(paused) {
    view.paused = paused;
    parts.pause.textContent = paused ? 'play' : 'pause';
    parts.pause.setAttribute('aria-pressed', String(paused));
    parts.pause.setAttribute('aria-label', paused ? 'Play the race' : 'Pause the race');
    if (!paused) resume();
  }

  function draw() {
    const clock = raceState(view.runners, view.laps, view.elapsed / TIME_SCALE);
    view.runners.forEach((runner, index) => {
      const circle = view.circles.get(runner.id);
      const lap = ((clock.progress[index] % 1) + 1) % 1;
      const point = parts.line.getPointAtLength(lap * view.length);
      circle.setAttribute('cx', point.x.toFixed(1));
      circle.setAttribute('cy', point.y.toFixed(1));
      circle.classList.toggle('out', runner.retired && clock.progress[index] >= runner.laps);
    });
    parts.lap.textContent = clock.finished
      ? `finished · ${view.laps} ${view.laps === 1 ? 'lap' : 'laps'}`
      : `lap ${clock.lap} / ${view.laps}`;
    return clock;
  }

  function tick(now) {
    view.frame = 0;
    const seconds = Math.max(0, Math.min(0.1, (now - view.last) / 1000)); // the time since the last frame, never negative or long (a tab left alone)
    if (!view.paused) view.elapsed += seconds * TIME_SCALE;
    view.last = now;
    const clock = draw();
    if (clock.finished && view.elapsed / TIME_SCALE > clock.end + SHOWN_FINISHED) view.elapsed = 0; // and the race starts again
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
    const key = `${view.snap.raceId}|${view.entity}`;
    if (key === view.key && !box.hidden) return;
    const wanted = key;
    view.key = key;
    let tracks;
    let season;
    try {
      [tracks, season] = await Promise.all([loadTracks(), loadSeason(view.snap.year)]);
    } catch {
      return hide(); // the ratings do not need the map
    }
    if (view.key !== wanted || !view.open) return; // the weekend or the panel has changed meanwhile
    const track = tracks[view.snap.circuitId];
    const race = season.races[view.snap.raceId];
    if (!track || !race) return hide(); // a circuit without an outline (Valencia, Fuji, Korea, India), or a race without lap times
    const path = smoothPath(track.points);
    parts.map.setAttribute('viewBox', `0 0 ${track.width} ${track.height}`);
    parts.halo.setAttribute('d', path);
    parts.line.setAttribute('d', path);
    for (const [name, value] of Object.entries(startLine(track.points))) parts.start.setAttribute(name, value.toFixed(1));
    view.length = parts.line.getTotalLength();
    view.runners = runners(race.entries, view.entity);
    view.laps = race.laps;
    view.circles = new Map(
      view.runners.map((runner) => [
        runner.id,
        svgElement('circle', { class: 'track-dot', r: DOT, cx: -100, cy: -100, 'data-id': runner.id }),
      ]),
    );
    parts.dots.replaceChildren(...view.circles.values());
    parts.name.textContent = `${view.snap.name.replace(/ Grand Prix$/, ' GP')} · ${view.snap.year}`;
    box.hidden = false;
    view.elapsed = 0;
    paintHot();
    cancelAnimationFrame(view.frame);
    view.frame = 0;
    draw();
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
    view.hot = event.detail.id;
    paintHot();
  });
  // the race runs only on the front page (and its ratings): on another page it stops, and starts again when the visitor comes back
  window.addEventListener('f1:workspace-changed', () => {
    if (['home', 'ratings'].includes(document.body.dataset.page)) show();
    else hide();
  });
  parts.pause.addEventListener('click', () => setPaused(!view.paused));
  reducedMotion.addEventListener('change', () => setPaused(reducedMotion.matches)); // it follows the setting, in both directions
  setPaused(view.paused);
}
