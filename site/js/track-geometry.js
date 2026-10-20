// The racing dots on the track map of the front page: how a track outline becomes a smooth path, who the runners of a race are, and where each of them
// is, and which lap the race is on, a given number of seconds after the start. Pure functions with no DOM, so that they are tested in Node
// (tests/test-stage.mjs); the drawing and the clock are in track-view.js.

/** The race runs this many times faster than the real one: a second on the screen is thirty seconds of race. */
export const TIME_SCALE = 30;
/** The cars start in grid order, behind the line: this many laps (about 8 metres on a 4 kilometre lap) for each place on the grid. */
export const GRID_SPACING = 0.002;

/** A closed smooth path (a Catmull-Rom curve written as cubic Béziers) through the points [x0, y0, x1, y1, ...] of an outline. */
export function smoothPath(points) {
  const n = points.length / 2;
  const at = (i) => [points[2 * ((i + n) % n)], points[2 * ((i + n) % n) + 1]];
  const round = (value) => Math.round(value * 10) / 10;
  let path = `M${points[0]},${points[1]}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    path += `C${round(x1 + (x2 - x0) / 6)},${round(y1 + (y2 - y0) / 6)} ${round(x2 - (x3 - x1) / 6)},${round(y2 - (y3 - y1) / 6)} ${x2},${y2}`;
  }
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
 * The runners of a race, from its entries [driverId, constructorId, grid, laps, averageSeconds, retired]: one for each driver, or, for the cars, one
 * for each team, at the mean pace of its drivers, with the best grid place and the most laps, and out of the race only when both of them are.
 * Returns [{ id, average, laps, slot, retired }] with `slot` the place on the grid (the pit lane, grid 0, is behind the last).
 */
export function runners(entries, entity) {
  const slotOf = (grid) => (grid > 0 ? grid : entries.length + 1);
  if (entity === 'driver')
    return entries.map(([driverId, , grid, laps, average, retired]) => ({
      id: String(driverId),
      average,
      laps,
      slot: slotOf(grid),
      retired: Boolean(retired),
    }));
  const teams = new Map();
  for (const [, constructorId, grid, laps, average, retired] of entries) {
    const key = String(constructorId);
    if (!teams.has(key)) teams.set(key, []);
    teams.get(key).push({ grid, laps, average, retired });
  }
  return [...teams].map(([id, members]) => ({
    id,
    average: members.reduce((sum, member) => sum + member.average, 0) / members.length,
    laps: Math.max(...members.map((member) => member.laps)),
    slot: Math.min(...members.map((member) => slotOf(member.grid))),
    retired: members.every((member) => member.retired),
  }));
}

/**
 * The race `seconds` of real time after the start: how many laps each runner has covered (negative before the line, and held at the laps it
 * completed once it has finished or retired), which lap the leader is on out of `totalLaps`, and whether the race is over. It is over when the first
 * runner completes all the laps; everyone is held where they are then.
 */
export function raceState(list, totalLaps, seconds) {
  const covered = (runner, at) => Math.min(at / runner.average - runner.slot * GRID_SPACING, runner.laps);
  const finishers = list.filter((runner) => runner.laps >= totalLaps);
  const end = finishers.length
    ? Math.min(...finishers.map((runner) => (totalLaps + runner.slot * GRID_SPACING) * runner.average))
    : Infinity;
  const at = Math.min(seconds * TIME_SCALE, end);
  const progress = list.map((runner) => covered(runner, at));
  const leader = Math.max(...progress);
  return {
    progress,
    lap: Math.min(totalLaps, Math.max(1, Math.floor(leader) + 1)),
    finished: seconds * TIME_SCALE >= end,
    end: end / TIME_SCALE,
  };
}
