// Rigid, independent rotation. Selection takes the shortest path back to the presentation pose.
const IDENTITY = [0, 0, 0, 1];
const multiply = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const rotation = (pitch, yaw) => multiply([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)]);
function align(orientation, amount) {
  const start = orientation[3] < 0 ? orientation.map((value) => -value) : orientation;
  const angle = Math.acos(Math.min(1, start[3]));
  if (angle < 0.00001) return [...IDENTITY];
  const weight = Math.sin((1 - amount) * angle) / Math.sin(angle);
  return start.map((value, axis) => value * weight + (IDENTITY[axis] * Math.sin(amount * angle)) / Math.sin(angle));
}
function matrix([x, y, z, w]) {
  return new Float32Array([
    1 - 2 * (y * y + z * z),
    2 * (x * y + z * w),
    2 * (x * z - y * w),
    0,
    2 * (x * y - z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z + x * w),
    0,
    2 * (x * z + y * w),
    2 * (y * z - x * w),
    1 - 2 * (x * x + y * y),
    0,
    0,
    0,
    0,
    1,
  ]);
}
export function transformModelPoint(point, transform) {
  return [0, 1, 2].map(
    (axis) => transform[axis] * point[0] + transform[4 + axis] * point[1] + transform[8 + axis] * point[2] + transform[12 + axis],
  );
}
export function createSceneMotion() {
  return {
    subject: null,
    previous: null,
    actors: Object.fromEntries(
      ['driver', 'car'].map((name) => [
        name,
        {
          orientation: name === 'car' ? rotation(0.16, 0.4) : [...IDENTITY],
          selection: name === 'driver' ? 1 : 0,
          alignment: null,
          elapsed: 0,
        },
      ]),
    ),
  };
}
export function advanceSceneMotion(state, { now, subject, reducedMotion }) {
  const first = state.previous === null;
  const delta = first ? 0 : Math.max(0, Math.min((now - state.previous) / 1000, 1 / 15));
  state.previous = now;
  const changed = state.subject !== subject;
  state.subject = subject;
  const result = { selection: {}, matrices: {}, transitioning: false };
  for (const [name, actor] of Object.entries(state.actors)) {
    const selected = subject === name;
    if (changed && selected) {
      actor.alignment = [...actor.orientation];
      actor.elapsed = 0;
    }
    if (first || reducedMotion) {
      actor.selection = Number(selected);
      if (selected || reducedMotion) actor.orientation = [...IDENTITY];
      if (selected) {
        actor.alignment = [...IDENTITY];
        actor.elapsed = 0.55;
      }
    } else {
      actor.selection += (Number(selected) - actor.selection) * (1 - Math.exp(-delta * 9));
      if (selected) {
        actor.elapsed = Math.min(0.55, actor.elapsed + delta);
        const progress = actor.elapsed / 0.55;
        actor.orientation = align(actor.alignment ?? IDENTITY, progress * progress * (3 - 2 * progress));
      } else {
        const next = multiply(multiply(rotation(0, delta * 0.14), actor.orientation), rotation(delta * 0.085, 0));
        const length = Math.hypot(...next);
        actor.orientation = next.map((value) => value / length);
      }
    }
    result.selection[name] = actor.selection;
    result.matrices[name] = matrix(actor.orientation);
    result.transitioning ||= Math.abs(Number(selected) - actor.selection) > 0.005 || (selected && actor.elapsed < 0.55);
  }
  return result;
}
