// The replay of a real race on the front page: from every car's lap times, where each car is on the track at any moment of the race, which place it
// holds, how far behind the leader it is, and which lap the race is on. Pure functions with no DOM, tested in Node (tests/test-stage.mjs and
// tests/test-race-laps.mjs against all the races); the drawing, the speed and the table are in track-view.js.
//
// Time here is the race clock, in seconds from the start (tools/build-race-laps.mjs says where its data comes from). A car's lap times fix the moments
// at which it crosses the line, exactly; between two crossings it moves through the lap by a speed profile (speed-profile.js) so that it is slow in the
// bends. A red flag is a stretch of the race clock in which every car stands still: the clock of the replay jumps over most of it.

export const TIME_SCALE = 10; // a second on the screen is ten seconds of race
export const GRID_SPACING = 0.002; // laps between two places on the grid (about 8 metres on a 4 kilometre lap)
export const STOP_PAUSE = 30; // seconds of race that a red flag takes on the screen (three seconds)
const COOL_DOWN = 1.5; // a car that has finished goes on at this multiple of its lap time, and so does not stop on the line
export const LEAST_DRIVING = 0.7; // a lap that contains a stoppage is driven in at least this share of a typical lap
const MOST_BEFORE_STOP = 0.98; // a car that stops goes at most this far through its lap first, so that the line is crossed at its recorded moment
const LONG_LAP = 2.2; // a lap more than this many times the median is not a racing lap (a red flag, or a long repair)

export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** A typical racing lap of a race, in the unit of the laps given ([[lap, ...], ...], one list for each car): the median of the laps that are not very long. */
export function raceTypical(series) {
  const all = series.flat();
  const limit = LONG_LAP * median(all);
  return median(all.filter((lap) => lap <= limit));
}

/**
 * One car's timeline: the moments (seconds of race clock) and the lap fraction `u` it has reached at each: `u` is 0 on the start line, a whole number at
 * each crossing of the line, and rises evenly with the time that the car is driving (the time outside the stoppages `stops`, [[from, to], ...]). The
 * car starts behind the line, `slot` places back. A car that is not `out` goes on round after its last lap, at a slow pace, so that it does not stand on the line.
 * `typical` is a typical lap of the race (a car that stopped early has no pace of its own to speak of).
 */
export function driverTimeline(laps, slot, stops, out, typical) {
  const behind = slot * GRID_SPACING;
  const t = [0];
  const u = [-behind];
  let start = 0;
  laps.forEach((lap, k) => {
    const end = start + lap;
    const [from, to] = [k === 0 ? -behind : k, k + 1];
    let still = stops.map(([a, b]) => [Math.max(a, start), Math.min(b, end)]).filter(([a, b]) => b > a);
    let total = still.reduce((sum, [a, b]) => sum + (b - a), 0);
    const room = Math.max(0, lap - LEAST_DRIVING * typical);
    let excess = total - room; // a car that would have to drive faster than that stops for less: it sets off in time to cross the line when it did
    for (let i = still.length - 1; i >= 0 && excess > 0; i--) {
      const cut = Math.min(still[i][1] - still[i][0], excess);
      still[i] = [still[i][0], still[i][1] - cut];
      excess -= cut;
      total -= cut;
    }
    still = still.filter(([a, b]) => b > a);
    const driving = lap - total;
    let at = start;
    let driven = 0;
    for (const [a, b] of still) {
      driven += a - at;
      const here = from + (to - from) * Math.min(driven / driving, MOST_BEFORE_STOP); // never quite at the line: it crosses it when its lap time says
      t.push(a, b);
      u.push(here, here);
      at = b;
    }
    t.push(end);
    u.push(to);
    start = end;
  });
  const finish = start;
  if (!out) for (let round = 1; round <= 3; round++) (t.push(finish + COOL_DOWN * typical * round), u.push(laps.length + round));
  return { t: Float64Array.from(t), u: Float64Array.from(u), finish };
}

/** The lap fraction of a timeline at a moment of the race clock. */
function uAt(timeline, time) {
  const { t, u } = timeline;
  if (time <= t[0]) return u[0];
  const last = t.length - 1;
  if (time >= t[last]) return u[last];
  let [low, high] = [0, last];
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (t[middle] <= time) low = middle;
    else high = middle;
  }
  return t[high] === t[low] ? u[low] : u[low] + ((u[high] - u[low]) * (time - t[low])) / (t[high] - t[low]);
}

/** How far a car has come round the track, in laps (0 on the line, -0.01 a little behind it), at a moment of the race clock. `clock` is a lapClock. */
export function progress(timeline, time, clock) {
  const u = uAt(timeline, time);
  if (u < 0) return u;
  const whole = Math.floor(u);
  return whole + clock.distanceAt(u - whole);
}

/** The first moment of the race clock at which a timeline has come as far as `lap` laps (Infinity if it never does). */
export function timeAtProgress(timeline, lap, clock) {
  const whole = Math.floor(lap);
  const target = lap < 0 ? lap : whole + clock.timeAt(lap - whole);
  const { t, u } = timeline;
  if (target <= u[0]) return t[0];
  if (target > u[u.length - 1]) return Infinity;
  let [low, high] = [0, u.length - 1];
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (u[middle] >= target) high = middle;
    else low = middle;
  }
  return u[high] === u[low] ? t[low] : t[low] + ((t[high] - t[low]) * (target - u[low])) / (u[high] - u[low]);
}

/**
 * A race from the data file: `race` is { laps, stops, entries } with an entry [driverId, constructorId, grid, out, statusId, lapTimesInCentiseconds].
 * `clock` is the lapClock of the circuit. Returns the cars (`id` and `team` are strings; `out` is true for a car that retired) and the moment the last
 * car that kept racing finishes.
 */
export function buildReplay(race, clock) {
  const { laps, stops, entries } = race;
  const typical = raceTypical(entries.map((entry) => entry[5].map((value) => value / 100)));
  const cars = entries.map(([driverId, constructorId, grid, out, statusId, centiseconds]) => {
    const slot = grid > 0 ? grid : entries.length + 1; // the pit lane is behind the last place on the grid
    const timeline = driverTimeline(
      centiseconds.map((value) => value / 100),
      slot,
      stops,
      out,
      typical,
    );
    return {
      id: String(driverId),
      team: String(constructorId),
      slot,
      out: Boolean(out),
      statusId,
      laps: centiseconds.length,
      typical,
      ...timeline,
    };
  });
  const racing = cars.filter((car) => !car.out);
  return { cars, laps, stops, clock, end: Math.max(...(racing.length ? racing : cars).map((car) => car.finish)) };
}

/** How far every car has come at a moment of the race clock: [laps, ...] in the order of `replay.cars`. */
export const progressesAt = (replay, time) => replay.cars.map((car) => progress(car, time, replay.clock));

/**
 * The state of the race at a moment: `order` (the indices of the cars, first place first; a car that has retired is below all the cars still racing),
 * the lap the leader is on, whether the leader has finished, whether the cars are standing still behind a red flag, and, for each car, whether it is still
 * `racing`. `progresses` is progressesAt for the same moment.
 */
export function standingsAt(replay, time, progresses) {
  const { cars, laps } = replay;
  const racing = cars.map((car) => !car.out || time < car.finish);
  const reached = progresses.map((value) => Math.min(value, laps));
  const order = cars
    .map((_, index) => index)
    .sort((a, b) => {
      if (racing[a] !== racing[b]) return racing[a] ? -1 : 1;
      if (!racing[a]) return progresses[b] - progresses[a] || cars[b].finish - cars[a].finish;
      return reached[b] - reached[a] || cars[a].finish - cars[b].finish || cars[a].slot - cars[b].slot;
    });
  const lead = reached[order[0]];
  return {
    order,
    racing,
    lap: Math.min(laps, Math.max(1, Math.floor(lead) + 1)),
    finished: lead >= laps,
    stopped: replay.stops.some(([from, to]) => time >= from && time < to),
  };
}

/**
 * How far behind the leader every car is: for each car, { kind: 'leader' | 'seconds' | 'laps' | 'out', value } in the order of `replay.cars`. The gap in
 * seconds is the time since the leader was where the car is now (or, for a car that has finished, between the leader's finish and its own), and a car a whole lap
 * or more behind is given in laps.
 */
export function gapsAt(replay, time, progresses, standings) {
  const { cars, laps, clock } = replay;
  const leader = standings.order[0];
  const lead = Math.min(progresses[leader], laps);
  return cars.map((car, index) => {
    if (!standings.racing[index]) return { kind: 'out' };
    if (index === leader) return { kind: 'leader' };
    const reached = Math.min(progresses[index], laps);
    if (lead - reached >= 1) return { kind: 'laps', value: Math.floor(lead - reached) };
    const there = progresses[index] >= laps ? timeAtProgress(car, laps, clock) : time;
    return { kind: 'seconds', value: Math.max(0, there - timeAtProgress(cars[leader], reached, clock)) };
  });
}

/**
 * The clock of the screen: a red flag is stood still for in the race clock, and takes only STOP_PAUSE seconds on the screen. `realAt` turns a moment of
 * the screen's race clock into the race clock, and `shownAt` is the inverse. Both are the identity in a race with no stoppage.
 */
export function screenClock(stops) {
  const long = stops.filter(([from, to]) => to - from > STOP_PAUSE);
  const before = []; // seconds taken out of the clock before each stoppage
  let removed = 0;
  for (const [from, to] of long) {
    before.push(removed);
    removed += to - from - STOP_PAUSE;
  }
  return {
    realAt(shown) {
      for (let i = 0; i < long.length; i++) {
        const [from, to] = long[i];
        const start = from - before[i];
        if (shown < start) return shown + before[i];
        if (shown < start + STOP_PAUSE) return from + ((shown - start) / STOP_PAUSE) * (to - from);
      }
      return shown + removed;
    },
    shownAt(real) {
      for (let i = 0; i < long.length; i++) {
        const [from, to] = long[i];
        if (real < from) return real - before[i];
        if (real < to) return from - before[i] + ((real - from) / (to - from)) * STOP_PAUSE;
      }
      return real - removed;
    },
  };
}
