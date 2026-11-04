import { GRAPH_RATINGS } from './presets/graph-ratings.js';

// One latent level per driver-season. A within-season change is not resolved.
// The first level has ridge precision 2; adjacent seasons have Brownian
// variance proportional to elapsed calendar years. Outcomes fade by date.
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const POINTS_PER_LOG_ODDS = 75 / Math.LN10;

export function createTeammateGraph({ halfLifeYears, annualDriftPoints = GRAPH_RATINGS.annualDriftPoints }) {
  if (!(halfLifeYears > 0) || !Number.isFinite(halfLifeYears) || !(annualDriftPoints > 0) || !Number.isFinite(annualDriftPoints)) {
    throw new RangeError('halfLifeYears and annualDriftPoints must be finite and positive');
  }
  const variancePerYear = (annualDriftPoints / POINTS_PER_LOG_ODDS) ** 2;
  const nodes = [];
  const latest = new Map();
  const edges = new Map();
  const transitions = [];
  let previousDate = null;

  function ensure(id, year) {
    const prior = latest.get(id);
    if (prior !== undefined && nodes[prior].year === year) return prior;
    const index = nodes.length;
    nodes.push({ id, year, value: prior === undefined ? 0 : nodes[prior].value, first: prior === undefined });
    if (prior !== undefined) transitions.push({ a: prior, b: index, precision: 1 / (variancePerYear * (year - nodes[prior].year)) });
    latest.set(id, index);
    return index;
  }

  function snapshot() {
    const n = nodes.length;
    const values = Float64Array.from(nodes, (node) => node.value);
    const comparisons = [...edges.values()];
    const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    const softplus = (value) => Math.max(0, value) + Math.log1p(Math.exp(-Math.abs(value)));
    const objective = (state) => {
      let value = 0;
      for (let i = 0; i < n; i++) if (nodes[i].first) value += state[i] ** 2;
      for (const link of transitions) value += (link.precision * (state[link.a] - state[link.b]) ** 2) / 2;
      for (const edge of comparisons) {
        const gap = state[edge.a] - state[edge.b];
        value += edge.wins * softplus(-gap) + edge.losses * softplus(gap);
      }
      return value;
    };
    for (let iteration = 0; iteration < 40; iteration++) {
      const gradient = new Float64Array(n);
      const diagonal = new Float64Array(n);
      for (let i = 0; i < n; i++)
        if (nodes[i].first) {
          gradient[i] = 2 * values[i];
          diagonal[i] = 2;
        }
      for (const link of transitions) {
        const difference = link.precision * (values[link.a] - values[link.b]);
        gradient[link.a] += difference;
        gradient[link.b] -= difference;
        diagonal[link.a] += link.precision;
        diagonal[link.b] += link.precision;
      }
      for (const edge of comparisons) {
        const p = 1 / (1 + Math.exp(-(values[edge.a] - values[edge.b])));
        const total = edge.wins + edge.losses;
        const difference = total * p - edge.wins;
        edge.information = total * p * (1 - p);
        gradient[edge.a] += difference;
        gradient[edge.b] -= difference;
        diagonal[edge.a] += edge.information;
        diagonal[edge.b] += edge.information;
      }
      if (dot(gradient, gradient) < 1e-16) break;
      const multiply = (vector) => {
        const result = new Float64Array(n);
        for (let i = 0; i < n; i++) if (nodes[i].first) result[i] = 2 * vector[i];
        for (const link of transitions) {
          const difference = link.precision * (vector[link.a] - vector[link.b]);
          result[link.a] += difference;
          result[link.b] -= difference;
        }
        for (const edge of comparisons) {
          const difference = edge.information * (vector[edge.a] - vector[edge.b]);
          result[edge.a] += difference;
          result[edge.b] -= difference;
        }
        return result;
      };
      const step = new Float64Array(n);
      const residual = Float64Array.from(gradient);
      const transformed = Float64Array.from(residual, (value, i) => value / diagonal[i]);
      const direction = Float64Array.from(transformed);
      let productResidual = dot(residual, transformed);
      const tolerance = Math.max(1e-22, dot(residual, residual) * 1e-18);
      for (let sweep = 0; sweep < n * 3 && dot(residual, residual) > tolerance; sweep++) {
        const product = multiply(direction);
        const scale = productResidual / dot(direction, product);
        for (let i = 0; i < n; i++) {
          step[i] += scale * direction[i];
          residual[i] -= scale * product[i];
          transformed[i] = residual[i] / diagonal[i];
        }
        const next = dot(residual, transformed);
        const ratio = next / productResidual;
        for (let i = 0; i < n; i++) direction[i] = transformed[i] + ratio * direction[i];
        productResidual = next;
      }
      const before = objective(values);
      let scale = 1;
      let candidate = Float64Array.from(values, (value, i) => value - scale * step[i]);
      while (objective(candidate) > before && scale > 2 ** -30) {
        scale /= 2;
        candidate = Float64Array.from(values, (value, i) => value - scale * step[i]);
      }
      values.set(candidate);
    }
    nodes.forEach((node, i) => {
      node.value = values[i];
    });
    const pairs = new Map();
    for (const edge of comparisons) {
      const key = JSON.stringify([edge.driverA, edge.driverB]);
      const pair = pairs.get(key) ?? { a: edge.driverA, b: edge.driverB, wins: 0, losses: 0 };
      pair.wins += edge.wins;
      pair.losses += edge.losses;
      pairs.set(key, pair);
    }
    return {
      levels: new Map([...latest].map(([id, index]) => [id, values[index] * POINTS_PER_LOG_ODDS])),
      evidence: [...pairs.values()].map((pair) => ({ ...pair, weight: pair.wins + pair.losses })),
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
      if (String(a) === String(b) || ![-1, 1].includes(outcome) || !(weight > 0) || !Number.isFinite(weight)) {
        throw new RangeError('observations require distinct drivers, an outcome of -1 or 1, and positive weight');
      }
    }
    if (previousDate !== null) {
      const retention = 2 ** (-(time - previousDate) / (YEAR_MS * halfLifeYears));
      for (const edge of edges.values()) {
        edge.wins *= retention;
        edge.losses *= retention;
      }
    }
    previousDate = time;
    const year = Number(date.slice(0, 4));
    for (const id of entries) ensure(String(id), year);
    const pre = snapshot();
    for (const observation of observations) {
      let a = String(observation.a),
        b = String(observation.b),
        outcome = observation.outcome;
      if (a > b) {
        [a, b] = [b, a];
        outcome = -outcome;
      }
      const aIndex = ensure(a, year),
        bIndex = ensure(b, year);
      const key = JSON.stringify([aIndex, bIndex]);
      const edge = edges.get(key) ?? { a: aIndex, b: bIndex, driverA: a, driverB: b, wins: 0, losses: 0 };
      if (outcome === 1) edge.wins += observation.weight;
      else edge.losses += observation.weight;
      edges.set(key, edge);
    }
    return { pre, post: observations.length ? snapshot() : pre };
  }
  return { advance };
}
