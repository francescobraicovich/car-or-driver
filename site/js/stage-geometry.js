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
