// Dependency-free inference for the exported, chronologically fitted heads.
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
function value(name, f) {
  if (name === 'base') return f.baseline_pre;
  if (name.startsWith('tanh(')) return Math.tanh(value(name.slice(5, -1), f));
  if (name.includes('*')) return name.split('*').reduce((p, n) => p * value(n, f), 1);
  if (name.endsWith('_trend')) {
    const c = name.slice(0, -6);
    return f[`${c}_fast`] - f[`${c}_slow`];
  }
  if (!Number.isFinite(f[name])) throw Error(`Missing feature: ${name}`);
  return f[name];
}
function treeValue(nodes, x) {
  let i = 0;
  while (nodes[i][0] >= 0) {
    const n = nodes[i];
    i = x[n[0]] <= n[1] ? n[2] : n[3];
  }
  return nodes[i][4];
}
export function scoreHead(head, features) {
  if (head.family === 'ensemble') return head.members.reduce((p, m, i) => p + head.weights[i] * scoreHead(m, features), 0);
  const x = head.names.map((n) => {
    const v = value(n, features);
    return Math.fround(Math.abs(v) < 1e-7 ? 0 : v);
  });
  if (head.family === 'linear') return sigmoid(x.reduce((p, v, i) => p + v * head.coefficients[i], 0));
  const forward = sigmoid(head.intercept + head.trees.reduce((p, t) => p + treeValue(t, x), 0));
  const reverse = x.map((v, i) => (i < head.odd ? -v : v));
  const backward = sigmoid(head.intercept + head.trees.reduce((p, t) => p + treeValue(t, reverse), 0));
  return (forward + 1 - backward) / 2;
}
export function selectHeads(heads, year) {
  const key = Object.keys(heads)
    .map(Number)
    .filter((y) => y <= year)
    .sort((a, b) => b - a)[0];
  return key ? heads[key] : null;
}
