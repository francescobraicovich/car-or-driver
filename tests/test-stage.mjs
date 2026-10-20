// The front page, tested without a browser: where the drawing and the two selectable areas fall on every kind of screen, where the ratings panel is
// and that it keeps clear of them, the noise that moves the cursor and the box, and (the part a reader would notice first) whether the text can be
// read against the drawing. The contrast is measured, not judged: the drawing's darkest and lightest pixels under every piece of text, at every
// screen size below, blended with the translucent plate behind the text, against the text colours read from site/css/stage.css.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  ART,
  SUBJECTS,
  connectorPoints,
  edgeMargin,
  panelColumn,
  sceneFades,
  sceneGeometry,
  subjectRectangle,
  titleLayout,
} from '../site/js/stage-geometry.js';
import { shake, smoothNoise, sway } from '../site/js/stage-noise.js';
import { barScale, barShare } from '../site/js/ratings-bars.js';
import { outlineTable, pointAt, smoothPath, startLine } from '../site/js/track-geometry.js';
import { lapClock, speedProfile, uniformClock } from '../site/js/speed-profile.js';
import {
  GRID_SPACING,
  DEFAULT_SPEED,
  SPEEDS,
  STOP_SCREEN,
  buildReplay,
  gapsAt,
  progress,
  progressesAt,
  raceTypical,
  screenClock,
  standingsAt,
  timeAtProgress,
} from '../site/js/race-replay.js';

const VIEWPORTS = [
  [375, 812],
  [390, 844],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1100, 700],
  [1280, 800],
  [1366, 600],
  [1440, 900],
  [1920, 1080],
  [2560, 1080],
];
// What the page measures in the browser (see stage-view.js): the bottom row of links is 55 high, and the panel's top is 68. The panel keeps 8
// between it and the bottom row.
const BOTTOM_ROW = 55;
const PANEL_TOP = 68;

// ── geometry ───────────────────────────────────────────
// The dark pixels of the car and of the hands, measured on the three versions of the drawing (the red one blurs a little wider).
const DARK_PIXELS = { car: { x: 611, y: 473, right: 968, bottom: 557 }, driver: { x: 1089, y: 463, right: 1424, bottom: 547 } };
for (const [width, height] of VIEWPORTS) {
  const geometry = sceneGeometry(width, height);
  const label = `${width}x${height}`;
  const column = panelColumn(width);
  assert.equal(geometry.wide, Boolean(column), `${label}: the picture knows whether the panel is a column`);
  assert.ok(geometry.x + geometry.width >= width - 0.5, `${label}: the picture reaches the right edge of the screen`);
  const fades = sceneFades(geometry, width, height);
  assert.ok(
    Object.values(fades).every((length) => length >= 0),
    `${label}: no fade is negative`,
  );
  assert.equal(fades.right, 0, `${label}: nothing fades at the right edge`);
  const rectangles = Object.fromEntries(Object.keys(SUBJECTS).map((name) => [name, subjectRectangle(geometry, name)]));
  for (const [name, rectangle] of Object.entries(rectangles)) {
    assert.ok(
      rectangle.x >= 0 && rectangle.y >= 0 && rectangle.x + rectangle.width <= width && rectangle.y + rectangle.height <= height,
      `${label}: the ${name} area is on screen`,
    );
    const dark = DARK_PIXELS[name];
    const scaled = {
      left: geometry.x + dark.x * geometry.scale,
      top: geometry.y + dark.y * geometry.scale,
      right: geometry.x + dark.right * geometry.scale,
      bottom: geometry.y + dark.bottom * geometry.scale,
    };
    assert.ok(
      scaled.left >= rectangle.x &&
        scaled.right <= rectangle.x + rectangle.width &&
        scaled.top >= rectangle.y &&
        scaled.bottom <= rectangle.y + rectangle.height,
      `${label}: the ${name} area contains the ${name}`,
    );
    assert.ok(rectangle.width * rectangle.height >= 44 * 44, `${label}: the ${name} area is a big enough target`);
    if (column) {
      // any overlap with the panel would bring back the pointer leaving the picture it is on
      assert.ok(rectangle.x >= column.right + 16, `${label}: the ${name} area is clear of the panel`);
      assert.ok(rectangle.x + rectangle.width <= width - 8, `${label}: the ${name} area is inside the right edge`);
    }
  }
  if (column) {
    assert.ok(column.width >= 440 && column.width <= 620, `${label}: the panel is a sensible width (${column.width.toFixed(0)}px)`);
    assert.ok(height - BOTTOM_ROW - 8 - PANEL_TOP >= 300, `${label}: the panel is tall enough to be used`);
    assert.ok(
      geometry.scale <= Math.max(width / ART.width, height / ART.height) + 1e-9,
      `${label}: the picture is not larger than one that covers the screen`,
    );
  } else {
    // the panel is a sheet under the pictures: shown only because something is pointed at, it stays clear of them in at least 220 pixels
    const lowest = Math.max(...Object.values(rectangles).map((rectangle) => rectangle.y + rectangle.height));
    assert.ok(height - BOTTOM_ROW - 8 - lowest - 12 >= 220, `${label}: the sheet has room under the car and the hands`);
  }
  assert.ok(rectangles.car.x + rectangles.car.width < rectangles.driver.x, `${label}: the two areas do not overlap`);
  assert.ok(geometry.y + 0 === geometry.y && Number.isFinite(geometry.scale) && geometry.scale > 0);
}
// on a wide screen the picture is smaller than it would be if it covered the screen, whenever the panel would otherwise be in its way
assert.ok(
  sceneGeometry(1280, 800).scale < Math.max(1280 / ART.width, 800 / ART.height),
  'at 1280x800 the picture is smaller than the covering one',
);
assert.equal(panelColumn(999), null, 'below 1000 the panel is a sheet');
assert.ok(panelColumn(1000) && panelColumn(1000).left === edgeMargin(1000), 'from 1000 it is a column');
// the three layers share one transform, so the subjects' areas are the same box in every colouring by construction; and the areas are inside the picture
for (const subject of Object.values(SUBJECTS))
  assert.ok(subject.x >= 0 && subject.y >= 0 && subject.x + subject.width <= ART.width && subject.y + subject.height <= ART.height);

// ── noise ──────────────────────────────────────────────
for (const seed of [0, 11, 12, 21, 100]) {
  let previous = smoothNoise(0, seed);
  let lowest = 1;
  let highest = -1;
  for (let step = 1; step <= 4000; step++) {
    const value = smoothNoise(step / 40, seed);
    assert.ok(value >= -1 && value <= 1, 'noise is in [-1, 1]');
    assert.ok(Math.abs(value - previous) < 0.1, 'noise is smooth: no jump between neighbouring samples');
    lowest = Math.min(lowest, value);
    highest = Math.max(highest, value);
    previous = value;
  }
  assert.ok(highest - lowest > 1, `noise with seed ${seed} actually varies`);
  assert.equal(smoothNoise(3.7, seed), smoothNoise(3.7, seed), 'noise is repeatable');
}
assert.notEqual(smoothNoise(2.5, 1), smoothNoise(2.5, 2), 'different seeds move differently');
assert.ok(Math.abs(shake(0.5, 3)) <= 1 && Math.abs(sway(0.5, 3)) <= 1);

// ── the bars beside the ratings ────────────────────────
assert.equal(barShare(1100, 1000, 1100), 1, 'the highest value fills the bar');
assert.equal(barShare(1000, 1000, 1100), 0, 'the bottom of the scale is empty');
assert.equal(barShare(1050, 1000, 1100), 0.5);
assert.equal(barShare(NaN, 1000, 1100), 0, 'no rating, no bar');
assert.equal(barShare(1200, 1000, 1100), 1, 'a value above the scale is held at the end');
assert.equal(barShare(900, 1000, 1100), 0, 'a value below the scale is held at the start');
assert.equal(barShare(5, 7, 7), 0, 'an empty scale gives no bar');
const scale = barScale([1101, 1081, NaN, 879, 1000]);
assert.equal(scale.high, 1101);
assert.ok(scale.low < 879 && barShare(879, scale.low, scale.high) > 0.1, 'the lowest value shown still has a bar');
assert.ok(barShare(1000, scale.low, scale.high) > barShare(879, scale.low, scale.high), 'the average is to the right of the lowest');
assert.deepEqual(barScale([]), { low: 0, high: 0 });

// ── the shape of a circuit, and how fast a car goes round it ───────────
{
  const square = [100, 100, 400, 100, 400, 400, 100, 400];
  const path = smoothPath(square);
  assert.ok(path.startsWith('M100,100C') && path.endsWith('Z'), 'the path starts at the first point and is closed');
  assert.equal(path.split('C').length - 1, 4, 'one curve for each point');
  const line = startLine(square, 10);
  assert.ok(Math.abs((line.x2 - line.x1) * 300) < 1e-9, 'the start line is across the first stretch of the track (here, horizontal)');
  assert.ok(Math.abs(Math.hypot(line.x2 - line.x1, line.y2 - line.y1) - 20) < 1e-9, 'and as long as asked');

  // the table of points at equal steps of distance
  const table = outlineTable(square, 400);
  assert.equal(table.x.length, 401);
  assert.ok(Math.hypot(table.x[400] - table.x[0], table.y[400] - table.y[0]) < 1e-9, 'the table closes on the start line');
  assert.ok(
    table.length > 1000 && table.length < 1300,
    `a smooth curve through a 300 unit square is a little shorter than its 1200 perimeter (${table.length.toFixed(0)})`,
  );
  const steps = Array.from({ length: 400 }, (_, k) => Math.hypot(table.x[k + 1] - table.x[k], table.y[k + 1] - table.y[k]));
  assert.ok(Math.max(...steps) / Math.min(...steps) < 1.05, 'the steps of the table are equal');
  assert.deepEqual(pointAt(table, 0), pointAt(table, 1), 'the start line is at 0 and at 1');
  assert.ok(Math.abs(pointAt(table, 0.5)[0] + pointAt(table, 0)[0] - 500) < 25, 'half way round a square is the opposite corner');

  // a stadium: two straights joined by two half circles of 100 m radius; the bends are slow and the straights fast
  const radius = 100;
  const flat = [];
  for (let k = 0; k <= 12; k++) flat.push(600 + Math.sin((k / 12) * Math.PI) * radius, -Math.cos((k / 12) * Math.PI) * radius); // the right bend, top to bottom
  for (let k = 1; k < 12; k++) flat.push(600 - (k * 1200) / 12, radius); // the bottom straight, right to left
  for (let k = 0; k <= 12; k++) flat.push(-600 - Math.sin((k / 12) * Math.PI) * radius, Math.cos((k / 12) * Math.PI) * radius); // the left bend, bottom to top
  for (let k = 1; k < 12; k++) flat.push(-600 + (k * 1200) / 12, -radius); // the top straight, left to right
  const lap = outlineTable(flat, 800).length * 0.5; // metres: half a unit each
  const speeds = speedProfile(flat, lap, 100);
  assert.equal(speeds.length, 100);
  assert.ok(
    Math.min(...speeds) < 0.6 * Math.max(...speeds),
    `slow bends, fast straights (${Math.min(...speeds)} to ${Math.max(...speeds)} km/h)`,
  );
  assert.ok(
    speeds.every((speed, k) => Math.abs(speed - speeds[(k + 50) % 100]) < 0.08 * Math.max(...speeds)),
    'a stadium looks the same from both ends',
  );
  const bend = Math.min(...speeds);
  assert.ok(bend > 40 && bend < 200, `a 100 m radius bend is taken at ${bend} km/h, not at a standstill and not flat out`);
  assert.ok(Math.max(...speeds) <= 306, 'nobody goes faster than the ceiling');
  // braking is harder than acceleration: the way down into a bend is shorter than the way back up
  const at = speeds.indexOf(bend);
  let down = 0;
  while (speeds[(at - down + 100) % 100] < 0.97 * Math.max(...speeds) && down < 50) down++;
  let up = 0;
  while (speeds[(at + up) % 100] < 0.97 * Math.max(...speeds) && up < 50) up++;
  assert.ok(up >= down, 'a car takes longer to get back up to speed out of a bend than to slow into it');

  // the clock of a lap
  const clock = lapClock(speeds);
  assert.equal(clock.distanceAt(0), 0);
  assert.equal(clock.distanceAt(1), 1);
  for (const f of [0.1, 0.3, 0.5, 0.77])
    assert.ok(Math.abs(clock.timeAt(clock.distanceAt(f)) - f) < 1e-9, 'timeAt is the inverse of distanceAt');
  let before = 0;
  for (let f = 0.01; f <= 1; f += 0.01) {
    assert.ok(clock.distanceAt(f) > before, 'the distance covered only grows');
    before = clock.distanceAt(f);
  }
  const slowShare = speeds.filter((speed) => speed < 0.6 * Math.max(...speeds)).length / 100;
  assert.ok(slowShare > 0.1, 'a fair part of the lap is slow');
  assert.equal(uniformClock.distanceAt(0.4), 0.4, 'with no profile every part of a lap takes its share of the time');
}

// ── the replay of a race ───────────────────────────────
{
  // laps in centiseconds; entries are [driverId, constructorId, grid, out, statusId, laps]
  const entry = (id, team, grid, out, laps) => [id, team, grid, out, 1, laps.map((seconds) => Math.round(seconds * 100))];
  const race = {
    laps: 4,
    stops: [],
    entries: [
      entry(1, 10, 1, 0, [90, 95, 90, 90]), // ahead after lap 1, passed on lap 2
      entry(2, 10, 2, 0, [92, 85, 90, 90]),
      entry(3, 20, 3, 1, [95, 95, 95]), // out after three laps (at 285 seconds)
      entry(4, 20, 0, 0, [160, 160, 160]), // from the pit lane, so slow that the leaders lap it
    ],
  };
  const replay = buildReplay(race, uniformClock);
  assert.deepEqual(
    replay.cars.map((car) => [car.id, car.team, car.slot, car.out, car.laps]),
    [
      ['1', '10', 1, false, 4],
      ['2', '10', 2, false, 4],
      ['3', '20', 3, true, 3],
      ['4', '20', 5, false, 3],
    ],
    'the cars: the pit lane is behind the last place on the grid, and the team and the number of laps are kept',
  );
  assert.equal(replay.end, 480, 'the race ends when the last car that kept racing finishes (the slow one, 3 laps of 160 seconds)');
  const state = (time) => {
    const progresses = progressesAt(replay, time);
    const standings = standingsAt(replay, time, progresses);
    return { progresses, standings, gaps: gapsAt(replay, time, progresses, standings) };
  };
  const ids = (standings) => standings.order.map((index) => replay.cars[index].id).join('');
  // the grid, then the first lap
  const start = state(0);
  assert.equal(ids(start.standings), '1234', 'at the start the cars are in grid order');
  assert.ok(
    start.progresses[0] < 0 && start.progresses[0] > start.progresses[1] && start.progresses[3] < start.progresses[2],
    'behind the line, the pole sitter nearest',
  );
  assert.equal(start.standings.lap, 1);
  assert.equal(start.standings.finished, false);
  // car 1 is ahead at the end of lap 1 (90 against 92), car 2 ahead at the end of lap 2 (177 against 185): an overtake
  assert.equal(ids(state(91).standings).slice(0, 2), '12', 'car 1 leads at the line after lap 1');
  assert.equal(ids(state(180).standings).slice(0, 2), '21', 'and car 2 has passed it by the end of lap 2');
  assert.equal(ids(state(180).standings), '2134', 'the car that retired later is still racing, in third');
  // the gap: car 2 at t = 100 is at 1 + 8/85 laps; car 1 reached that at 90 + (8/85)*95
  const gap = state(100).gaps[1];
  assert.equal(gap.kind, 'seconds');
  assert.ok(Math.abs(gap.value - (100 - (90 + (8 / 85) * 95))) < 1e-6, `a gap of ${gap.value.toFixed(3)} seconds`);
  assert.equal(state(100).gaps[0].kind, 'leader');
  // the car from the pit lane is lapped
  const late = state(300);
  assert.equal(late.gaps[3].kind, 'laps', 'a car a whole lap behind is given in laps');
  assert.equal(late.gaps[3].value, 1);
  // the retirement: after its last lap car 3 is out and last
  assert.equal(state(200).standings.racing[2], true);
  const after = state(290);
  assert.equal(after.standings.racing[2], false, 'a car that has stopped is no longer racing');
  assert.equal(after.gaps[2].kind, 'out');
  assert.equal(ids(after.standings).at(-1), '3', 'and is below everyone still racing, even a car it is ahead of on the road');
  // the finish: the leader has completed 4 laps; the others finish later, and the gap at the finish is the difference of the finishing times
  const done = state(replay.end + 5);
  assert.equal(done.standings.finished, true);
  assert.equal(done.standings.lap, 4);
  assert.equal(ids(done.standings), '214'.concat('3'), 'at the end: classified in the order they finished');
  assert.ok(
    Math.abs(done.gaps[0].value - (replay.cars[0].finish - replay.cars[1].finish)) < 1e-6,
    'the final gap is the difference of the finishing times',
  );
  assert.ok(done.progresses[0] > 4, 'a car that has finished goes on round, slowly, and does not stand on the line');
  assert.ok(done.progresses[2] === 3, 'while a car that retired stays where it stopped');

  // a red flag: no car moves for its whole length, every line is crossed at its recorded moment
  const flagged = {
    laps: 3,
    stops: [[100, 1100]],
    entries: [entry(1, 10, 1, 0, [90, 1090, 80]), entry(2, 10, 2, 0, [92, 1088, 82])],
  };
  const frozen = buildReplay(flagged, uniformClock);
  for (const car of frozen.cars) {
    const [a, b] = [progress(car, 100, uniformClock), progress(car, 1099, uniformClock)];
    assert.ok(Math.abs(b - a) < 1e-9, `car ${car.id} stands still through the red flag`);
    assert.ok(a > 1 && a < 2, 'somewhere in its second lap');
  }
  assert.ok(Math.abs(timeAtProgress(frozen.cars[0], 2, uniformClock) - 1180) < 1e-6, 'and still crosses the line when its lap times say');
  assert.ok(Math.abs(timeAtProgress(frozen.cars[1], 3, uniformClock) - 1262) < 1e-6);
  assert.ok(standingsAt(frozen, 500, progressesAt(frozen, 500)).stopped, 'the state of the race says it is stopped');
  assert.ok(!standingsAt(frozen, 1500, progressesAt(frozen, 1500)).stopped);
  assert.ok(!standingsAt(frozen, 50, progressesAt(frozen, 50)).stopped);

  // a typical lap is not pulled by a long one
  assert.ok(
    Math.abs(
      raceTypical([
        [90, 91, 92],
        [93, 1500, 95],
      ]) - 92,
    ) < 2,
    'a typical lap leaves out the very long laps',
  );
  assert.deepEqual(SPEEDS, [1, 2, 5, 10, 30, 50], 'the speeds the visitor can choose from');
  assert.equal(DEFAULT_SPEED, 10);
  assert.ok(SPEEDS.includes(DEFAULT_SPEED));
  assert.ok(GRID_SPACING > 0 && GRID_SPACING < 0.01);
  // a red flag takes the same few seconds on the screen at every speed
  for (const speed of SPEEDS) {
    const clock = screenClock([[100, 2100]], STOP_SCREEN * speed);
    assert.ok(
      Math.abs(clock.shownAt(2100) - clock.shownAt(100) - STOP_SCREEN * speed) < 1e-9,
      `at ${speed}x the stoppage is ${STOP_SCREEN * speed} seconds of race time`,
    );
    assert.ok(
      Math.abs((clock.shownAt(2100) - clock.shownAt(100)) / speed - STOP_SCREEN) < 1e-9,
      `which is ${STOP_SCREEN} seconds on the screen`,
    );
    assert.ok(Math.abs(clock.realAt(clock.shownAt(1500)) - 1500) < 1e-6, 'and the clock is its own inverse');
  }
  // a stoppage shorter than the pause is not shortened (at 50x the pause is 150 seconds of race)
  assert.equal(screenClock([[100, 220]], STOP_SCREEN * 50).realAt(400), 400);
}

// ── the title and the line from a word to its picture ──
// A stand-in for the real title (the page measures it in the browser): two lines, the first about 5.4 letters wide, the second about 4.4, centred.
function titleBoxes(layout) {
  const em = layout.size;
  const block = { x: layout.centre - 2.7 * em, y: layout.top, width: 5.4 * em, height: 2 * layout.lineHeight * em };
  const lineHeight = layout.lineHeight * em;
  const driver = { x: layout.centre - 2.5 * em, y: layout.top, width: 5 * em, height: lineHeight };
  const car = { x: layout.centre + 0.2 * em, y: layout.top + lineHeight, width: 2.3 * em, height: lineHeight };
  return { block, driver, car };
}
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const segmentBox = (from, to) => ({
  x: Math.min(from.x, to.x) - 0.5,
  y: Math.min(from.y, to.y) - 0.5,
  width: Math.abs(from.x - to.x) + 1,
  height: Math.abs(from.y - to.y) + 1,
});
for (const [width, height] of VIEWPORTS) {
  const geometry = sceneGeometry(width, height);
  const layout = titleLayout(geometry, width, height);
  const label = `${width}x${height}`;
  const boxes = titleBoxes(layout);
  const subjectTop = Math.min(...Object.keys(SUBJECTS).map((name) => subjectRectangle(geometry, name).y));
  assert.ok(layout.size >= 26 && layout.size <= 118, `${label}: the title size is sensible (${layout.size.toFixed(0)}px)`);
  assert.ok(boxes.block.y + boxes.block.height <= subjectTop - 30, `${label}: the title stays clear of the car and the hands`);
  assert.ok(boxes.block.x >= -1 && boxes.block.x + boxes.block.width <= width + 1, `${label}: the title is on the screen`);
  const column = panelColumn(width);
  if (column)
    assert.ok(boxes.block.x - 24 >= column.right, `${label}: the title, and the lines that run beside it, are clear of the panel`);
  for (const [name, word] of [
    ['car', boxes.car],
    ['driver', boxes.driver],
  ]) {
    const subject = subjectRectangle(geometry, name);
    const points = connectorPoints(word, subject, boxes.block);
    assert.ok(points.length >= 2 && points.length <= 4, `${label}: the ${name} line has two to four points`);
    if (column)
      assert.ok(
        points.every((point) => point.x >= column.right + 8),
        `${label}: the ${name} line stays out of the panel`,
      );
    const last = points.at(-1);
    assert.ok(
      Math.abs(last.y - subject.y) < 0.01 && last.x >= subject.x && last.x <= subject.x + subject.width,
      `${label}: the ${name} line ends on the top edge of its picture`,
    );
    for (let i = 1; i < points.length; i++)
      assert.ok(
        points[i].x === points[i - 1].x || points[i].y === points[i - 1].y,
        `${label}: the ${name} line turns only at right angles`,
      );
    for (let i = 1; i < points.length; i++) {
      const piece = segmentBox(points[i - 1], points[i]);
      for (const other of [boxes.car, boxes.driver]) assert.ok(!overlaps(piece, other), `${label}: the ${name} line does not cross a word`);
    }
  }
}

// ── can it be read? ────────────────────────────────────
const css = await readFile(new URL('../site/css/stage.css', import.meta.url), 'utf8');
const block = (selector) => {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `${selector} in stage.css`);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
};
const tokensOf = (text) => Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const red = tokensOf(block('.stage {'));
const grey = { ...red, ...tokensOf(block(".stage[data-state='peek'],")) };
const trackTokens = tokensOf(block('.track {'));
const panelTokens = tokensOf(block('.rating-card {')); // the tokens are set on the panel and the card together
const cardTokens = tokensOf(block('.rating-card {\n  --panel-plate'));
const sheetTokens = tokensOf(block(".stage[data-layout='sheet'] .ledger {"));
const resolve = (tokens, name, depth = 0) => {
  const value = tokens[name];
  const reference = value?.match(/^var\(--([a-z-]+)\)/);
  return reference && depth < 5 ? resolve(tokens, reference[1], depth + 1) : value;
};
const hex = (text) => {
  const digits = text.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits; // #fff is #ffffff
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const plateOf = (text) => {
  const m = text.match(/rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/);
  assert.ok(m, `a plate colour: ${text}`);
  return { color: [+m[1], +m[2], +m[3]], alpha: +m[4] };
};
const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const mix = (top, bottom, alpha) => top.map((v, i) => alpha * v + (1 - alpha) * bottom[i]);

const samples = JSON.parse(await readFile(new URL('./fixtures/stage-backgrounds.json', import.meta.url), 'utf8'));
for (const version of ['red', 'mono']) {
  const actual = createHash('sha256')
    .update(await readFile(new URL(`../site/assets/art/${version}.webp`, import.meta.url)))
    .digest('hex');
  assert.equal(
    actual,
    samples[version].sha256,
    `the ${version} drawing changed since its pixels were sampled: run python3 tools/sample-stage-backgrounds.py`,
  );
}
/** The darkest and the lightest pixel of the picture under a rectangle of the screen. */
function extremes(version, geometry, region) {
  const picture = {
    left: (region.x - geometry.x) / geometry.scale,
    right: (region.x + region.width - geometry.x) / geometry.scale,
    top: (region.y - geometry.y) / geometry.scale,
    bottom: (region.y + region.height - geometry.y) / geometry.scale,
  };
  const found = { darkest: null, lightest: null };
  if (picture.bottom < 0 || picture.top > ART.height || picture.right < 0 || picture.left > ART.width) return found; // wholly outside the drawing: only the page's colour is there
  const cell = (value, count) => Math.min(count - 1, Math.max(0, Math.floor(value / samples.cell)));
  for (let row = cell(picture.top, samples.rows); row <= cell(picture.bottom, samples.rows); row++)
    for (let column = cell(picture.left, samples.columns); column <= cell(picture.right, samples.columns); column++) {
      const index = row * samples.columns + column;
      for (const kind of ['darkest', 'lightest']) {
        const pixel = samples[version][kind][index];
        if (!found[kind] || (kind === 'darkest' ? luminance(pixel) < luminance(found[kind]) : luminance(pixel) > luminance(found[kind])))
          found[kind] = pixel;
      }
    }
  return found;
}

const worst = [];
/**
 * Every text colour against the darkest and the lightest pixel of the drawing under the region, with whatever translucent layer sits between (the
 * haze behind the title, the plate behind the list), and against the page's own colour, which shows where the drawing does not reach the edge.
 */
function check(label, version, tokens, geometry, region, texts, overlay = null) {
  const { darkest, lightest } = extremes(version, geometry, region);
  const backgrounds = [darkest, lightest, hex(resolve(tokens, 'stage-bg'))].filter(Boolean);
  const layers = [overlay ?? []].flat().map((name) => plateOf(resolve(tokens, name))); // from the lowest to the highest
  const stacked = (picture) => layers.reduce((below, layer) => mix(layer.color, below, layer.alpha), picture);
  for (const [name, minimum, colour, dim = 1] of texts) {
    const text = hex(resolve(tokens, colour));
    for (const picture of backgrounds) {
      const background = stacked(picture);
      const ratio = contrast(mix(text, background, dim), background); // a dimmed word is the text colour mixed into what is behind it
      worst.push([ratio, `${label}, ${name}`]);
      assert.ok(ratio >= minimum, `${label}: ${name} (${resolve(tokens, colour)}) has contrast ${ratio.toFixed(2)}, needs ${minimum}`);
    }
  }
}
for (const [width, height] of VIEWPORTS) {
  const geometry = sceneGeometry(width, height);
  const margin = Math.min(72, Math.max(18, width * 0.05));
  const layout = titleLayout(geometry, width, height);
  const { block } = titleBoxes(layout);
  const titleRegion = { x: block.x - 0.1 * layout.size, y: block.y, width: block.width + 0.2 * layout.size, height: block.height };
  for (const [version, tokens] of [
    ['red', red],
    ['mono', grey],
  ]) {
    const label = `${width}x${height} ${version === 'red' ? 'red' : 'black and white'}`;
    const dim = Number(resolve(tokens, 'word-dim'));
    assert.ok(dim > 0 && dim < 1, `${label}: the dimmed words have an opacity`);
    // the title is large text (3 to 1); the word that is not pointed at is dimmed, and still has to reach it
    check(
      `${label}, title`,
      version,
      tokens,
      geometry,
      titleRegion,
      [
        ['title', 3, 'title-ink'],
        ...(version === 'mono' ? [['dimmed word', 3, 'title-ink', dim]] : []), // a word is only dimmed while something is pointed at, and then the drawing is black and white
      ],
      'scrim',
    );
  }
  // "click to open" under each box, in the blue of the box, on the black and white drawing
  for (const name of Object.keys(SUBJECTS)) {
    const box = subjectRectangle(geometry, name);
    check(
      `${width}x${height} label under the ${name} box`,
      'mono',
      grey,
      geometry,
      { x: box.x, y: box.y + box.height + 4, width: 150, height: 22 },
      [['click to open', 4.5, 'frame']],
    );
  }
  // the race at the bottom right (only where there is room: 150 pixels under the car and the hands): the name of the weekend, the lap, the timing table
  // and the notes, over the picture; the box clear of the panel and under the label of the car's box
  const lowestSubject = Math.max(
    ...Object.keys(SUBJECTS).map((name) => subjectRectangle(geometry, name).y + subjectRectangle(geometry, name).height),
  );
  const trackTop = lowestSubject + 44;
  const trackBottom = height - BOTTOM_ROW - 16;
  const trackColumn = panelColumn(width);
  if (trackColumn && trackBottom - trackTop >= 150) {
    const trackWidth = Math.min(560, width - trackColumn.left - trackColumn.width - 2 * margin - 28);
    assert.ok(width - margin - trackWidth >= trackColumn.right + 28, `${width}x${height}: the race is clear of the panel`);
    assert.ok(trackWidth >= 380 - 1 || width < 1100, `${width}x${height}: the race has room for a map and a table (${trackWidth}px)`);
    check(
      `${width}x${height} text of the race`,
      'mono',
      { ...grey, ...trackTokens },
      geometry,
      { x: width - margin - trackWidth, y: trackTop, width: trackWidth, height: trackBottom - trackTop },
      [['name, lap, table and notes', 4.5, 'ink']],
    );
    check(
      `${width}x${height} the row of the table that is pointed at`,
      'mono',
      { ...grey, ...trackTokens },
      geometry,
      { x: width - margin - trackWidth, y: trackTop, width: trackWidth, height: trackBottom - trackTop },
      [['text on the red tint', 4.5, 'ink']],
      'hot-row',
    );
  }
  // the panel (a column beside the picture on a wide screen, a sheet under it on a narrow one) only exists on the black and white drawing; the region
  // is the largest it can cover: down to the bottom row of links, and up to the top of the column, or to the top of a sheet kept open (78% of
  // the height, covering the pictures, which is why its fill is denser)
  const column = panelColumn(width);
  const panelBottom = height - BOTTOM_ROW - 8;
  const sheetTop = Math.max(0, height - BOTTOM_ROW - 8 - 0.78 * height);
  const panelRegion = column
    ? { x: column.left, y: PANEL_TOP, width: column.width, height: panelBottom - PANEL_TOP }
    : { x: margin, y: sheetTop, width: width - 2 * margin, height: panelBottom - sheetTop };
  check(
    `${width}x${height} ratings panel`,
    'mono',
    column ? { ...grey, ...panelTokens } : { ...grey, ...panelTokens, ...sheetTokens },
    geometry,
    panelRegion,
    [
      ['text', 4.5, 'ink'],
      ['secondary text', 4.5, 'ink-2'],
      ['tertiary text', 4.5, 'ink-3'],
      ['gain', 4.5, 'pos'],
      ['loss', 4.5, 'neg'],
      ['link and selection', 4.5, 'accent-text'],
      ['bars', 3, 'frame'], // the bars are marks, not text: 3 to 1 is what they need
      ['edge of the recent-form part of a bar', 3, 'form-edge'],
    ],
    ['panel-plate', 'panel-shade'], // the fill, then the darkest the shading can make it
  );
  // the card on a row (beside the column on a wide screen), over the picture and the sketches, with its denser fill
  if (column) {
    check(
      `${width}x${height} card on a row`,
      'mono',
      { ...grey, ...panelTokens, ...cardTokens },
      geometry,
      { x: column.right + 12, y: PANEL_TOP, width: 256, height: panelBottom - PANEL_TOP },
      [
        ['text', 4.5, 'ink'],
        ['labels', 4.5, 'ink-3'],
        ['gain', 4.5, 'pos'],
        ['loss', 4.5, 'neg'],
      ],
      ['panel-plate', 'panel-shade'],
    );
  }
}
const lowest = worst.sort((a, b) => a[0] - b[0])[0];
console.log(
  `PASS front page: both areas on screen and around the subjects at ${VIEWPORTS.length} sizes, the title clear of them and its line to each picture, smooth noise, the panel's colours, and every text colour reads on the drawing (lowest contrast ${lowest[0].toFixed(2)}: ${lowest[1]})`,
);
