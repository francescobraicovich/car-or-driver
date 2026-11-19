// Small, deterministic teaching figures. They illustrate identifiability, time-ordered
// teammate links and the update of one rating by one result; they do not read or change
// the published model.

const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;

const SPLIT_READING =
  'The teammate gap stays <b>20 points</b>. Both package paces stay fixed. No result between these two drivers can identify the shared shift.';

/** The driver/car split slider. `reading` replaces the sentence under the figures (the simple methodology words it without terms). */
export function initSplitLab(container, { reading = SPLIT_READING } = {}) {
  container.innerHTML = `
    <div class="method-lab-head"><strong>One observation, many possible explanations</strong><output></output></div>
    <label class="method-lab-control">Shift shared between drivers and car
      <input type="range" min="-40" max="40" step="5" value="0" aria-label="Shift points from car to both drivers">
    </label>
    <div class="method-split-grid" aria-live="polite">
      <div><span>Driver A</span><b data-value="a"></b></div>
      <div><span>Driver B</span><b data-value="b"></b></div>
      <div><span>Shared car</span><b data-value="car"></b></div>
      <div><span>A + car</span><b data-value="package-a"></b></div>
      <div><span>B + car</span><b data-value="package-b"></b></div>
    </div>
    <p class="method-lab-reading">${reading}</p>`;
  const input = container.querySelector('input');
  const output = container.querySelector('output');
  const cells = Object.fromEntries([...container.querySelectorAll('[data-value]')].map((node) => [node.dataset.value, node]));
  const update = () => {
    const shift = Number(input.value);
    output.textContent = `${signed(shift)} points`;
    cells.a.textContent = signed(40 + shift);
    cells.b.textContent = signed(20 + shift);
    cells.car.textContent = signed(60 - shift);
    cells['package-a'].textContent = '+100';
    cells['package-b'].textContent = '+80';
  };
  input.addEventListener('input', update);
  update();
}

// These three links are a teaching example. Each smoothed gap is the rating
// difference implied by (wins + 1)/(losses + 1) on the 75-point odds scale.
const LINKS = [
  { from: 'A', to: 'B', wins: 7, losses: 3, year: 1 },
  { from: 'B', to: 'C', wins: 6, losses: 3, year: 2 },
  { from: 'C', to: 'D', wins: 5, losses: 4, year: 3 },
];
const gap = ({ wins, losses }) => 75 * Math.log10((wins + 1) / (losses + 1));

export function initCareerGraph(container) {
  container.innerHTML = `
    <div class="method-lab-head"><strong>Follow the teammate links</strong><output></output></div>
    <label class="method-lab-control">Career stage
      <input type="range" min="1" max="3" step="1" value="3" aria-label="Career stage, from one to three">
    </label>
    <svg viewBox="0 0 640 180" role="img" aria-label="A four-driver teammate comparison network"></svg>
    <p class="method-lab-reading" aria-live="polite"></p>`;
  const input = container.querySelector('input');
  const output = container.querySelector('output');
  const svg = container.querySelector('svg');
  const reading = container.querySelector('.method-lab-reading');
  const update = () => {
    const stage = Number(input.value);
    const vertical = container.clientWidth < 460;
    output.textContent = `After stage ${stage}`;
    const links = LINKS.slice(0, stage);
    svg.setAttribute('viewBox', vertical ? '0 0 300 440' : '0 0 640 180');
    const positions = vertical ? { A: 50, B: 160, C: 270, D: 380 } : { A: 56, B: 232, C: 408, D: 584 };
    svg.innerHTML = `
      ${LINKS.map((link) => {
        const active = link.year <= stage;
        const middle = (positions[link.from] + positions[link.to]) / 2;
        const line = vertical
          ? `x1="52" y1="${positions[link.from] + 28}" x2="52" y2="${positions[link.to] - 28}"`
          : `x1="${positions[link.from] + 28}" y1="93" x2="${positions[link.to] - 28}" y2="93"`;
        return `<g class="method-network-link${active ? ' active' : ''}">
          <line ${line} />
          <text x="${vertical ? 100 : middle}" y="${vertical ? middle - 3 : 56}" text-anchor="${vertical ? 'start' : 'middle'}">${active ? `${link.wins}–${link.losses} · ${Math.round(gap(link))} pts` : 'not yet linked'}</text>
          <text x="${vertical ? 100 : middle}" y="${vertical ? middle + 16 : 137}" text-anchor="${vertical ? 'start' : 'middle'}">stage ${link.year}</text>
        </g>`;
      }).join('')}
      ${Object.entries(positions)
        .map(
          ([name, position], index) =>
            `<g class="method-network-node${index <= stage ? ' active' : ''}"><circle cx="${vertical ? 52 : position}" cy="${vertical ? position : 93}" r="25"/><text x="${vertical ? 52 : position}" y="${vertical ? position + 7 : 100}" text-anchor="middle">${name}</text></g>`,
        )
        .join('')}`;
    const indirect = links.reduce((sum, link) => sum + gap(link), 0);
    const endpoint = 'BCD'[stage - 1];
    reading.textContent = `A and ${endpoint}: about ${Math.round(indirect)} points apart through ${stage} link${stage === 1 ? '' : 's'}. Each extra link adds uncertainty, so a chain is weaker evidence than a direct meeting.`;
  };
  input.addEventListener('input', update);
  let lastWidth = container.clientWidth;
  new ResizeObserver(() => {
    if (container.clientWidth === lastWidth) return;
    lastWidth = container.clientWidth;
    update();
  }).observe(container);
  update();
}

// One rating, before and after a single result: a teaching figure for the update of the filter (methodology Part 6) and of the simple methodology.
// The rating is one bell curve; the result is read as evidence of the rating with a fixed spread, and the two combine by precision, the
// one-number case of the update the filter makes for every level at once.
const RESULT_SPREAD = 20; // how far one weekend's result, read on its own, may be from the truth (points)
const PRIOR_SPREADS = [
  ['Unsure', 32],
  ['Fairly sure', 16],
  ['Very sure', 6],
];
const thousands = (value) => Math.round(value).toLocaleString('en-GB');

export function initBeliefUpdate(container) {
  container.innerHTML = `
    <div class="method-lab-head"><strong>One result, before and after</strong><output></output></div>
    <label class="method-lab-control">How surprising the result is: how much better than expected the driver did
      <input type="range" min="0" max="60" step="5" value="30" aria-label="How much better than expected the result was, in points">
    </label>
    <div class="method-lab-choices" role="group" aria-label="How sure the model was before the result">
      <span>How sure the model was before</span>
      ${PRIOR_SPREADS.map(([label, spread], index) => `<button type="button" data-spread="${spread}" aria-pressed="${index === 1}">${label}</button>`).join('')}
    </div>
    <svg role="img" aria-label="Two bell curves: the rating before the result and after it"></svg>
    <p class="method-lab-reading" aria-live="polite"></p>`;
  const input = container.querySelector('input');
  const output = container.querySelector('output');
  const svg = container.querySelector('svg');
  const reading = container.querySelector('.method-lab-reading');
  const buttons = [...container.querySelectorAll('[data-spread]')];
  let prior = PRIOR_SPREADS[1][1];

  const update = () => {
    const surprise = Number(input.value);
    const weight = prior ** 2 / (prior ** 2 + RESULT_SPREAD ** 2);
    const after = {
      mean: 1000 + weight * surprise,
      spread: Math.sqrt((prior ** 2 * RESULT_SPREAD ** 2) / (prior ** 2 + RESULT_SPREAD ** 2)),
    };
    const before = { mean: 1000, spread: prior };
    output.textContent = surprise ? `${surprise} points better than expected` : 'as expected';

    const width = Math.max(300, Math.min(640, container.clientWidth - 36));
    const height = 200;
    const [low, high] = [910, 1090];
    const x = (rating) => 12 + ((rating - low) / (high - low)) * (width - 24);
    const base = height - 34;
    const density = (curve, rating) => Math.exp(-0.5 * ((rating - curve.mean) / curve.spread) ** 2) / curve.spread;
    const scale = (base - 28) / Math.max(density(before, before.mean), density(after, after.mean));
    const path = (curve) =>
      Array.from({ length: 181 }, (_, i) => low + i)
        .map((rating, i) => `${i ? 'L' : 'M'}${x(rating).toFixed(1)},${(base - scale * density(curve, rating)).toFixed(1)}`)
        .join(' ');
    const top = (curve) => base - scale * density(curve, curve.mean);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = `
      <line class="method-belief-axis" x1="${x(low)}" x2="${x(high)}" y1="${base}" y2="${base}" />
      ${[940, 970, 1000, 1030, 1060]
        .map((tick) => `<text class="method-belief-tick" x="${x(tick)}" y="${base + 18}" text-anchor="middle">${thousands(tick)}</text>`)
        .join('')}
      <line class="method-belief-result" x1="${x(1000 + surprise)}" x2="${x(1000 + surprise)}" y1="14" y2="${base}" />
      <text class="method-belief-label" x="${x(1000 + surprise) + 5}" y="22">what the result suggests</text>
      <path class="method-belief-before" d="${path(before)}" />
      <path class="method-belief-after" d="${path(after)}" />
      <text class="method-belief-label" x="${x(before.mean) - 6}" y="${Math.max(36, top(before) - 6)}" text-anchor="end">before</text>
      <text class="method-belief-label strong" x="${x(after.mean) + 12}" y="${Math.max(36, top(after) + 4)}">after</text>`;
    reading.textContent = `The best guess moves from ${thousands(before.mean)} to ${thousands(after.mean)}, ${Math.round(100 * weight)}% of the way toward what the result suggests, and the uncertainty shrinks from ±${Math.round(before.spread)} to ±${Math.round(after.spread)} points.`;
  };
  input.addEventListener('input', update);
  for (const button of buttons)
    button.addEventListener('click', () => {
      prior = Number(button.dataset.spread);
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      update();
    });
  let lastWidth = container.clientWidth;
  new ResizeObserver(() => {
    if (container.clientWidth === lastWidth) return;
    lastWidth = container.clientWidth;
    update();
  }).observe(container);
  update();
}
