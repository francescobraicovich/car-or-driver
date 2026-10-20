// Where the drawing is on screen. The front page shows one picture (a car and a driver's hands) in three colourings that line up pixel for pixel, and
// everything that has to match it (the three layers, the two selectable areas, the box that opens around one of them) is placed with the one transform
// computed here, so they cannot drift apart. Pure functions: no DOM, tested in Node (tests/test-stage.mjs).

export const ART = { width: 1536, height: 1024 };

/** The part of the picture that must always be on screen: the car and the hands, with some air. */
const REQUIRED = { left: 520, right: 1500 };
const FOCUS_X = (REQUIRED.left + REQUIRED.right) / 2;
const FOCUS_Y = 540;

/** The two things that can be selected, as boxes in picture units (measured from the dark pixels of the three versions, plus a margin). */
export const SUBJECTS = {
  car: { x: 575, y: 425, width: 435, height: 165 },
  driver: { x: 1050, y: 415, width: 415, height: 175 },
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The picture's rectangle on a viewport, in pixels. On a landscape screen the picture covers it. On a screen too narrow to show the car and the hands
 * at that size (a phone held upright) the picture is shrunk until both fit, and sits lower than the middle with room above it for the text: it then
 * does not reach the top and bottom edges (`fits` is true), and the page fades those edges into its background colour.
 */
export function sceneGeometry(viewportWidth, viewportHeight) {
  const cover = Math.max(viewportWidth / ART.width, viewportHeight / ART.height);
  const widest = viewportWidth / (REQUIRED.right - REQUIRED.left);
  const scale = Math.min(cover, widest);
  const width = ART.width * scale;
  const height = ART.height * scale;
  const x = viewportWidth / 2 - clamp(FOCUS_X, viewportWidth / (2 * scale), ART.width - viewportWidth / (2 * scale)) * scale;
  const fits = height < viewportHeight - 1;
  const y = fits
    ? viewportHeight * 0.4 - FOCUS_Y * scale
    : viewportHeight / 2 - clamp(FOCUS_Y, viewportHeight / (2 * scale), ART.height - viewportHeight / (2 * scale)) * scale;
  return { scale, x, y, width, height, fits };
}

/** A box in picture units, as pixels on the viewport. */
export function toViewport(geometry, box) {
  return {
    x: geometry.x + box.x * geometry.scale,
    y: geometry.y + box.y * geometry.scale,
    width: box.width * geometry.scale,
    height: box.height * geometry.scale,
  };
}

export const subjectRectangle = (geometry, subject) => toViewport(geometry, SUBJECTS[subject]);

/** The title's lines are this many times the font size tall, and the title needs this much clear space above the car and the hands. */
const TITLE_LINE_HEIGHT = 1.08;
const TITLE_GAP = 54;
const TITLE_MINIMUM = 26;
const TITLE_MAXIMUM = 118;

/**
 * Where the two-line title goes and how large it is: centred over the car and the hands, near the top, as large as the screen allows without
 * coming closer than TITLE_GAP pixels to them. Returns the font size, the top of the first line, and the horizontal centre.
 */
export function titleLayout(geometry, viewportWidth, viewportHeight) {
  const car = subjectRectangle(geometry, 'car');
  const driver = subjectRectangle(geometry, 'driver');
  const subjectTop = Math.min(car.y, driver.y);
  const top = viewportWidth <= 720 ? 74 : Math.min(112, Math.max(58, viewportHeight * 0.09));
  const preferred = Math.min(TITLE_MAXIMUM, viewportWidth * (viewportWidth <= 720 ? 0.112 : 0.072));
  const room = subjectTop - top - TITLE_GAP;
  const size = Math.max(TITLE_MINIMUM, Math.min(preferred, room / (2 * TITLE_LINE_HEIGHT)));
  const centre = (Math.min(car.x, driver.x) + Math.max(car.x + car.width, driver.x + driver.width)) / 2;
  return { size, top, centre, lineHeight: TITLE_LINE_HEIGHT };
}

/**
 * The line from a highlighted word to its picture, made of horizontal and vertical segments, as a list of points. A word on the lowest line of the
 * title leaves from its bottom edge; a word on a higher line leaves from its side that faces the picture, and comes down beside the title (never
 * through it) to the picture's top edge. Rectangles are { x, y, width, height }; `title` is the block of both lines.
 */
export function connectorPoints(word, subject, title) {
  const right = (box) => box.x + box.width;
  const bottom = (box) => box.y + box.height;
  const lowest = bottom(word) >= bottom(title) - 2;
  const start = 10; // clear space between the word's box and the line
  const margin = Math.min(24, subject.width / 4);
  if (lowest) {
    const from = { x: word.x + word.width / 2, y: bottom(word) + start };
    const entry = clamp(from.x, subject.x + margin, right(subject) - margin);
    const level = clamp((from.y + subject.y) / 2, from.y, subject.y - start);
    return entry === from.x
      ? [from, { x: entry, y: subject.y }]
      : [from, { x: from.x, y: level }, { x: entry, y: level }, { x: entry, y: subject.y }];
  }
  const towardsRight = subject.x + subject.width / 2 > word.x + word.width / 2;
  const from = { x: towardsRight ? right(word) + start : word.x - start, y: word.y + word.height / 2 };
  const beside = towardsRight ? right(title) + 24 : title.x - 24;
  const entry = clamp(
    towardsRight ? Math.max(beside, subject.x + margin) : Math.min(beside, right(subject) - margin),
    subject.x + margin,
    right(subject) - margin,
  );
  return [from, { x: entry, y: from.y }, { x: entry, y: subject.y }];
}
