// Text colours must stay readable when someone edits a token. Reads the light
// and dark tokens straight from styles.css and checks WCAG contrast (AA, 4.5:1).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../site/css/styles.css', import.meta.url)), 'utf8');

const block = (selector) => {
  const start = css.indexOf(selector);
  if (start < 0) throw Error(`missing ${selector} in styles.css`);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
};
const tokens = (text) => Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));
const light = tokens(block(':root {'));
const dark = { ...light, ...tokens(block(":root[data-theme='dark'] {")) };

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const problems = [];
for (const [mode, t] of [
  ['light', light],
  ['dark', dark],
]) {
  for (const text of ['ink', 'ink-2', 'ink-3', 'accent-text', 'pos', 'neg', 'warn']) {
    for (const bg of ['surface', 'page']) {
      if (!t[text] || !t[bg]) throw Error(`token --${text} or --${bg} missing in ${mode}`);
      const c = contrast(t[text], t[bg]);
      if (c < 4.5) problems.push(`${mode}: --${text} on --${bg} is ${c.toFixed(2)}:1 (needs 4.5)`);
    }
  }
  const button = contrast('#ffffff', t.accent);
  if (button < 4.5) problems.push(`${mode}: white on the accent button is ${button.toFixed(2)}:1`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('PASS text contrast: every text token clears 4.5:1 on both surfaces, light and dark');
