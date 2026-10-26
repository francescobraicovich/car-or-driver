// The shape of a circuit on the front page: how an outline becomes a smooth path, where the start line is, and where a point a given share of the way round
// the lap is (the dots are placed from one table, so that the drawing and the speeds share one way of measuring distance). Pure functions with no DOM, so
// that they are tested in Node (tests/test-stage.mjs); the drawing and the clock are in track-view.js.

/** The four control points of the cubic Bézier (a Catmull-Rom curve) of each stretch of a closed outline [x0, y0, x1, y1, ...]: [[p0, c1, c2, p1], ...]. */
function stretches(points) {
  const n = points.length / 2;
  const at = (i) => [points[2 * ((i + n) % n)], points[2 * ((i + n) % n) + 1]];
  return Array.from({ length: n }, (_, i) => {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    return [
      [x1, y1],
      [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6],
      [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6],
      [x2, y2],
    ];
  });
}

/** A closed smooth path (a Catmull-Rom curve written as cubic Béziers) through the points [x0, y0, x1, y1, ...] of an outline. */
export function smoothPath(points) {
  const round = (value) => Math.round(value * 10) / 10;
  let path = `M${points[0]},${points[1]}`;
  for (const [, [cx1, cy1], [cx2, cy2], [x, y]] of stretches(points))
    path += `C${round(cx1)},${round(cy1)} ${round(cx2)},${round(cy2)} ${x},${y}`;
  return `${path}Z`;
}

/** The short line across the track at the start line (the first point of the outline, along its first stretch): { x1, y1, x2, y2 }. */
export function startLine(points, half = 14) {
  const [x, y] = [points[0], points[1]];
  const [dx, dy] = [points[2] - x, points[3] - y];
  const length = Math.hypot(dx, dy) || 1;
  return { x1: x - (dy / length) * half, y1: y + (dx / length) * half, x2: x + (dy / length) * half, y2: y - (dx / length) * half };
}

/**
 * The smooth outline sampled at equal steps of distance: { x, y, length } with `count` + 1 points from the start line round to the start line again
 * (the last is the first), and `length` the length of the curve in the units of the outline.
 */
export function outlineTable(points, count) {
  const fine = [];
  for (const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] of stretches(points))
    for (let step = 0; step < 16; step++) {
      const t = step / 16;
      const a = (1 - t) ** 3;
      const b = 3 * (1 - t) ** 2 * t;
      const c = 3 * (1 - t) * t ** 2;
      const d = t ** 3;
      fine.push([a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3]);
    }
  fine.push(fine[0]);
  const along = [0];
  for (let i = 1; i < fine.length; i++) along.push(along[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
  const length = along.at(-1);
  const x = new Float64Array(count + 1);
  const y = new Float64Array(count + 1);
  let at = 0;
  for (let k = 0; k <= count; k++) {
    const target = (k / count) * length;
    while (at < along.length - 2 && along[at + 1] < target) at++;
    const span = along[at + 1] - along[at] || 1;
    const share = (target - along[at]) / span;
    x[k] = fine[at][0] + share * (fine[at + 1][0] - fine[at][0]);
    y[k] = fine[at][1] + share * (fine[at + 1][1] - fine[at][1]);
  }
  return { x, y, length };
}

/** The point a share `s` (0 to 1, the start line at 0 and 1) of the way round the lap, from an outlineTable: [x, y]. */
export function pointAt(table, s) {
  const count = table.x.length - 1;
  const at = (((s % 1) + 1) % 1) * count;
  const k = Math.min(count - 1, Math.floor(at));
  const share = at - k;
  return [table.x[k] + share * (table.x[k + 1] - table.x[k]), table.y[k] + share * (table.y[k + 1] - table.y[k])];
}
