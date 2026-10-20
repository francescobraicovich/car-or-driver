// How fast a car goes round each part of a lap, worked out from the shape of the circuit: a car can take a bend only so fast (the sharper it is, the
// slower), it can accelerate and brake only so hard, so it slows into the bends and speeds up out of them. This is the textbook lap-time calculation
// (a limit speed from the curvature, then a forward pass for the acceleration and a backward pass for the braking, twice round the closed loop) with round
// numbers for a modern car. Only the shape of the profile matters here: the race clock (race-replay.js) is set by the real lap times, and the profile says
// where on the lap a car is a given share of the lap time after it crossed the line. Pure; tested in Node (tests/test-stage.mjs).
import { outlineTable } from './track-geometry.js';

export const CAR = {
  lateral: 32, // metres per second squared a car can hold in a bend (about 3.3 g)
  ceiling: 85, // metres per second: the top speed on a straight (about 305 km/h)
  acceleration: 9, // metres per second squared
  braking: 40, // metres per second squared (about 4 g)
};
const WINDOW = 45; // metres either side over which the curvature of a bend is taken, which keeps the noise of a coarse outline out of it
const STEPS = 800; // points round the lap for the calculation

/** The curvature (1 over the radius, in 1/metre) of the circle through three points. */
function curvature(ax, ay, bx, by, cx, cy) {
  const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)); // twice the area of the triangle
  const sides = Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) * Math.hypot(cx - ax, cy - ay);
  return sides > 0 ? (2 * area) / sides : 0;
}

/**
 * The speed of a car at `samples` equal steps of distance round the lap, in kilometres an hour (whole numbers, a harmonic mean over each step, which is
 * what the time taken is made of), from the outline [x0, y0, x1, y1, ...] of the circuit, which is `lengthMetres` long round the lap.
 */
export function speedProfile(points, lengthMetres, samples = 200) {
  const table = outlineTable(points, STEPS);
  const scale = lengthMetres / table.length; // metres for one unit of the outline
  const step = lengthMetres / STEPS;
  const span = Math.max(2, Math.round(WINDOW / step));
  const at = (k) => ((k % STEPS) + STEPS) % STEPS;
  const limit = new Float64Array(STEPS);
  for (let i = 0; i < STEPS; i++) {
    const [a, b] = [at(i - span), at(i + span)];
    const kappa = curvature(
      table.x[a] * scale,
      table.y[a] * scale,
      table.x[i] * scale,
      table.y[i] * scale,
      table.x[b] * scale,
      table.y[b] * scale,
    );
    limit[i] = Math.min(CAR.ceiling, Math.sqrt(CAR.lateral / Math.max(kappa, 1e-6)));
  }
  const speed = Float64Array.from(limit);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 2 * STEPS; i++)
      speed[at(i + 1)] = Math.min(speed[at(i + 1)], Math.sqrt(speed[at(i)] ** 2 + 2 * CAR.acceleration * step));
    for (let i = 2 * STEPS; i > 0; i--)
      speed[at(i - 1)] = Math.min(speed[at(i - 1)], Math.sqrt(speed[at(i)] ** 2 + 2 * CAR.braking * step));
  }
  const group = STEPS / samples;
  return Array.from({ length: samples }, (_, k) => {
    const [from, to] = [Math.floor(k * group), Math.floor((k + 1) * group)];
    let time = 0;
    for (let i = from; i < to; i++) time += 1 / speed[i];
    return Math.round((3.6 * (to - from)) / time);
  });
}

/**
 * The clock of one lap from a speed profile (kilometres an hour at equal steps of distance): `distanceAt(f)` is the share of the lap's distance that a car
 * has covered when a share `f` of its lap time has passed (0 to 1; the same car at the same pace takes longer over the slow parts). `timeAt` is its inverse.
 */
export function lapClock(speeds) {
  const total = speeds.reduce((sum, speed) => sum + 1 / speed, 0);
  const time = [0];
  for (const speed of speeds) time.push(time.at(-1) + 1 / speed / total);
  const count = speeds.length;
  const search = (values, target) => {
    let [low, high] = [0, values.length - 2];
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (values[middle] <= target) low = middle;
      else high = middle - 1;
    }
    return low;
  };
  return {
    distanceAt(f) {
      if (f <= 0) return 0;
      if (f >= 1) return 1;
      const k = search(time, f);
      return (k + (f - time[k]) / (time[k + 1] - time[k])) / count;
    },
    timeAt(s) {
      if (s <= 0) return 0;
      if (s >= 1) return 1;
      const k = Math.min(count - 1, Math.floor(s * count));
      return time[k] + (s * count - k) * (time[k + 1] - time[k]);
    },
  };
}

/** A clock for a circuit with no profile: every part of the lap takes its share of the time. */
export const uniformClock = { distanceAt: (f) => Math.min(1, Math.max(0, f)), timeAt: (s) => Math.min(1, Math.max(0, s)) };
