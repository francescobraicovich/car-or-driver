// The front page, tested without a browser: where the drawing and the two selectable areas fall on every kind of screen, the noise that moves the
// cursor and the box, the text and the ratings list that are built from data, and (the part a reader would notice first) whether the text can be read
// against the drawing. The contrast is measured, not judged: the drawing's darkest and lightest pixels under every piece of text, at four screen
// sizes, blended with the translucent plate behind the text, against the text colours read from site/css/stage.css.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ART, SUBJECTS, sceneGeometry, subjectRectangle } from '../site/js/stage-geometry.js';
import { shake, smoothNoise, sway } from '../site/js/stage-noise.js';
import { codeLines, linesAsText } from '../site/js/stage-code.js';
import { BAR_WIDTH, bar, ledgerRows, spokenRow } from '../site/js/stage-ledger.js';

const VIEWPORTS = [
  [375, 812],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1366, 600],
  [1920, 1080],
  [2560, 1080],
];

// ── geometry ───────────────────────────────────────────
// The dark pixels of the car and of the hands, measured on the three versions of the drawing (the red one blurs a little wider).
const DARK_PIXELS = { car: { x: 611, y: 473, right: 968, bottom: 557 }, driver: { x: 1089, y: 463, right: 1424, bottom: 547 } };
for (const [width, height] of VIEWPORTS) {
  const geometry = sceneGeometry(width, height);
  const label = `${width}x${height}`;
  assert.ok(geometry.width >= width - 0.5, `${label}: the drawing is at least as wide as the screen`);
  if (!geometry.fits)
    assert.ok(
      geometry.height >= height - 0.5 && geometry.y <= 0.5 && geometry.y + geometry.height >= height - 0.5,
      `${label}: the drawing covers the screen`,
    );
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
  }
  assert.ok(rectangles.car.x + rectangles.car.width < rectangles.driver.x, `${label}: the two areas do not overlap`);
  assert.ok(geometry.y + 0 === geometry.y && Number.isFinite(geometry.scale) && geometry.scale > 0);
}
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

// ── text ───────────────────────────────────────────────
const KINDS = new Set(['', 'k', 't', 'f', 's', 'n', 'c']);
const leader = { name: 'Max <b>Verstappen</b>', team: 'Red Bull', rating: 1069.6, deviation: 12.4 };
for (const subject of [null, 'car', 'driver']) {
  for (const open of [false, true]) {
    for (const entry of [null, leader]) {
      const lines = codeLines({ subject, open, weekend: '2026 Singapore Grand Prix', leader: entry, count: 22 });
      assert.ok(lines.length >= 3);
      for (const line of lines)
        for (const token of line)
          assert.ok(KINDS.has(token[0]) && typeof token[1] === 'string', 'every token has a known kind and a string');
    }
  }
}
const idle = linesAsText(codeLines({ subject: null, open: false, weekend: '2026 Singapore Grand Prix', leader: null, count: 0 }));
assert.match(idle, /Singapore Grand Prix/);
assert.match(idle, /select\(Car \| Driver\)/);
const driverText = linesAsText(codeLines({ subject: 'driver', open: false, weekend: '2026 Singapore Grand Prix', leader, count: 22 }));
assert.match(driverText, /1070/, 'the rating is rounded to a whole number');
assert.match(driverText, /± 12/);
assert.match(driverText, /all 22 ratings/);
assert.match(linesAsText(codeLines({ subject: 'car', open: true, weekend: null, leader, count: 11 })), /11 cars, best first/);
assert.match(linesAsText(codeLines({ subject: 'car', open: false, weekend: null, leader: null, count: 0 })), /loading/);

// ── the ratings list ───────────────────────────────────
const rows = [
  { id: 'a', name: 'Alpha', car: 'Red', value: 1070.4, combinedSd: 12.2, change: 1.04 },
  { id: 'b', name: 'Beta', car: 'Blue', value: 1000, combinedSd: NaN, change: -0.02 },
  { id: 'c', name: 'Gamma', car: '', value: NaN, combinedSd: 14, change: 0 },
  { id: 'd', name: 'Delta', car: 'Grey', value: 940, combinedSd: 15, change: -3.26 },
];
const printed = ledgerRows(rows);
assert.equal(printed.length, 3, 'an entry without a rating is left out');
assert.deepEqual(
  printed.map((row) => row.rank),
  ['1', '2', '3'],
);
assert.equal(printed[0].rating, '1070');
assert.equal(printed[0].deviation, '±12');
assert.equal(printed[1].deviation, '', 'no error bar is printed when there is none');
assert.equal(printed[0].change, '▲1.0');
assert.equal(printed[1].change, '', 'a change below a tenth of a point is not printed');
assert.equal(printed[2].change, '▼3.3');
for (const row of printed) assert.equal([...row.bar].length, BAR_WIDTH, 'every bar has the same width');
assert.ok(printed[0].bar.split('█').length > printed[2].bar.split('█').length, 'a higher rating has a longer bar');
assert.equal([...bar(5, 5, 5)].length, BAR_WIDTH);
assert.equal(spokenRow(printed[0], 'driver'), '1, Alpha, Red, rating 1070, plus or minus 12, up 1.0 since the previous weekend');
assert.equal(spokenRow(printed[1], 'car'), '2, Beta, rating 1000');
assert.doesNotMatch(spokenRow(printed[2], 'driver'), /[█░▲▼±]/, 'what is spoken has no drawing characters');
assert.match(
  linesAsText(codeLines({ subject: null, open: false, weekend: null, leader: null, count: 0, error: 'HTTP 404' })),
  /could not load the ratings: HTTP 404/,
);

// ── can it be read? ────────────────────────────────────
const css = await readFile(new URL('../site/css/stage.css', import.meta.url), 'utf8');
const block = (selector) => {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `${selector} in stage.css`);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
};
const tokensOf = (text) => Object.fromEntries([...text.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const red = tokensOf(block('.stage {'));
const grey = { ...red, ...tokensOf(block(".stage[data-state='peek'],")) };
const resolve = (tokens, name, depth = 0) => {
  const value = tokens[name];
  const reference = value?.match(/^var\(--([a-z-]+)\)/);
  return reference && depth < 5 ? resolve(tokens, reference[1], depth + 1) : value;
};
const hex = (text) => [1, 3, 5].map((i) => parseInt(text.slice(i, i + 2), 16));
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
  const cell = (value, count) => Math.min(count - 1, Math.max(0, Math.floor(value / samples.cell)));
  const found = { darkest: null, lightest: null };
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
function check(label, version, tokens, geometry, region, texts) {
  const plate = plateOf(resolve(tokens, 'plate'));
  const { darkest, lightest } = extremes(version, geometry, region);
  for (const [name, minimum, colour] of texts) {
    const text = hex(resolve(tokens, colour));
    for (const background of [darkest, lightest]) {
      const ratio = contrast(text, mix(plate.color, background, plate.alpha));
      worst.push([ratio, `${label}, ${name}`]);
      assert.ok(ratio >= minimum, `${label}: ${name} (${resolve(tokens, colour)}) has contrast ${ratio.toFixed(2)}, needs ${minimum}`);
    }
  }
}
const BODY = [
  ['text', 4.5, 'ink'],
  ['comments', 4.5, 'ink-soft'],
];
for (const [width, height] of VIEWPORTS) {
  const geometry = sceneGeometry(width, height);
  const phone = width <= 720;
  const margin = Math.min(72, Math.max(18, width * 0.05));
  const subjectTop = Math.min(...Object.keys(SUBJECTS).map((name) => subjectRectangle(geometry, name).y));
  const codeTop = phone ? 92 : Math.min(120, Math.max(60, height * 0.11));
  const codeRegion = { x: margin, y: codeTop, width: Math.min(width - 2 * margin, 700), height: Math.max(60, subjectTop - 30 - codeTop) };
  const barHeight = phone ? 92 : 50;
  for (const [version, tokens] of [
    ['red', red],
    ['mono', grey],
  ]) {
    const label = `${width}x${height} ${version === 'red' ? 'red' : 'black and white'}`;
    check(`${label}, top bar`, version, tokens, geometry, { x: 0, y: 0, width, height: barHeight }, BODY);
    check(`${label}, bottom bar`, version, tokens, geometry, { x: 0, y: height - barHeight, width, height: barHeight }, BODY);
    check(`${label}, code`, version, tokens, geometry, codeRegion, [
      ...BODY,
      ['keywords', 4.5, 'syntax-key'],
      ['types', 4.5, 'syntax-type'],
      ['strings', 4.5, 'syntax-string'],
    ]);
  }
  // the ratings list only exists on the black and white drawing, in the lower part of the screen
  const listTop = Math.max(0, height - (phone ? 76 : 58) - height * (phone ? 0.44 : 0.34));
  check(
    `${width}x${height} ledger`,
    'mono',
    grey,
    geometry,
    { x: margin, y: listTop, width: Math.min(940, width - 2 * margin), height: height - (phone ? 76 : 58) - listTop },
    BODY,
  );
}
const lowest = worst.sort((a, b) => a[0] - b[0])[0];
for (const [name, tokens] of [
  ['red', red],
  ['black and white', grey],
])
  assert.ok(contrast(hex(resolve(tokens, 'chip-ink')), hex(resolve(tokens, 'chip'))) >= 7, `${name}: the label chips are readable`);
console.log(
  `PASS front page: both areas on screen and around the subjects at ${VIEWPORTS.length} sizes, smooth noise, text built from data, and every text colour reads on the drawing (lowest contrast ${lowest[0].toFixed(2)}: ${lowest[1]})`,
);
