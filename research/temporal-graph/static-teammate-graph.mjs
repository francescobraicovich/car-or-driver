// A dated graph of teammate outcomes. Scores are uncalibrated driver levels;
// forecast calibration belongs to the evaluation or prediction layer.
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export function createTeammateGraph({ halfLifeYears }) {
  if (!(halfLifeYears > 0) || !Number.isFinite(halfLifeYears)) {
    throw new RangeError('halfLifeYears must be finite and positive');
  }
  const drivers = new Set();
  const pairs = new Map();
  let previousDate = null;

  function snapshot() {
    const ids = [...drivers];
    const indices = new Map(ids.map((id, index) => [id, index]));
    const edges = [...pairs.values()].map((pair) => ({
      ...pair,
      i: indices.get(pair.a),
      j: indices.get(pair.b),
      weight: pair.wins + pair.losses,
    }));
    const theta = new Float64Array(ids.length);
    const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
    const softplus = (value) => Math.max(0, value) + Math.log1p(Math.exp(-Math.abs(value)));
    const objective = (values) => {
      let result = dot(values, values); // lambda = 2, so lambda / 2 = 1
      for (const edge of edges) {
        const difference = values[edge.i] - values[edge.j];
        result += edge.wins * softplus(-difference) + edge.losses * softplus(difference);
      }
      return result;
    };
    for (let iteration = 0; iteration < 40; iteration++) {
      const gradient = Float64Array.from(theta, (value) => 2 * value);
      for (const edge of edges) {
        const difference = theta[edge.i] - theta[edge.j];
        const probability = 1 / (1 + Math.exp(-difference));
        const derivative = edge.weight * probability - edge.wins;
        edge.information = edge.weight * probability * (1 - probability);
        gradient[edge.i] += derivative;
        gradient[edge.j] -= derivative;
      }
      if (dot(gradient, gradient) < 1e-18) break;
      const multiply = (vector) => {
        const result = Float64Array.from(vector, (value) => 2 * value);
        for (const edge of edges) {
          const difference = edge.information * (vector[edge.i] - vector[edge.j]);
          result[edge.i] += difference;
          result[edge.j] -= difference;
        }
        return result;
      };
      const step = new Float64Array(ids.length);
      const residual = Float64Array.from(gradient);
      const direction = Float64Array.from(residual);
      let squaredResidual = dot(residual, residual);
      const tolerance = Math.max(1e-24, squaredResidual * 1e-20);
      for (let sweep = 0; sweep < ids.length * 2 && squaredResidual > tolerance; sweep++) {
        const product = multiply(direction);
        const scale = squaredResidual / dot(direction, product);
        for (let i = 0; i < ids.length; i++) {
          step[i] += scale * direction[i];
          residual[i] -= scale * product[i];
        }
        const next = dot(residual, residual);
        const ratio = next / squaredResidual;
        for (let i = 0; i < ids.length; i++) direction[i] = residual[i] + ratio * direction[i];
        squaredResidual = next;
      }
      const before = objective(theta);
      let scale = 1;
      let candidate = Float64Array.from(theta, (value, i) => value - scale * step[i]);
      while (objective(candidate) > before && scale > 2 ** -30) {
        scale /= 2;
        candidate = Float64Array.from(theta, (value, i) => value - scale * step[i]);
      }
      theta.set(candidate);
    }
    const pointsPerLogOdds = 75 / Math.LN10;
    return {
      levels: new Map(ids.map((id, index) => [id, theta[index] * pointsPerLogOdds])),
      evidence: edges.map(({ a, b, wins, losses, weight }) => ({ a, b, wins, losses, weight })),
    };
  }

  function advance(date, entries, observations) {
    const time = Date.parse(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(time) ||
      new Date(time).toISOString().slice(0, 10) !== date ||
      (previousDate !== null && time < previousDate)
    ) {
      throw new RangeError('dates must be valid and chronological');
    }
    for (const { a, b, outcome, weight } of observations) {
      if (String(a) === String(b) || !Number.isFinite(outcome) || ![-1, 1].includes(outcome) || !(weight > 0) || !Number.isFinite(weight)) {
        throw new RangeError('observations require distinct drivers, an outcome of -1 or 1, and positive weight');
      }
    }
    if (previousDate !== null) {
      const retention = 2 ** (-(time - previousDate) / (YEAR_MS * halfLifeYears));
      for (const pair of pairs.values()) {
        pair.wins *= retention;
        pair.losses *= retention;
      }
    }
    previousDate = time;
    for (const id of entries) drivers.add(String(id));
    const pre = snapshot();
    for (const observation of observations) {
      let a = String(observation.a);
      let b = String(observation.b);
      let outcome = observation.outcome;
      if (a > b) {
        [a, b] = [b, a];
        outcome = -outcome;
      }
      drivers.add(a);
      drivers.add(b);
      const key = JSON.stringify([a, b]);
      const pair = pairs.get(key) ?? { a, b, wins: 0, losses: 0 };
      if (outcome === 1) pair.wins += observation.weight;
      else pair.losses += observation.weight;
      pairs.set(key, pair);
    }
    return { pre, post: snapshot() };
  }

  return { advance };
}
