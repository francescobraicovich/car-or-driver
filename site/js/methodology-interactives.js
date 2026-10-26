// Small, deterministic teaching figures. They illustrate identifiability and
// time-ordered teammate links; they do not read or change the published model.

const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;

export function initSplitLab(container) {
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
    <p class="method-lab-reading">The teammate gap stays <b>20 points</b>. Both package paces stay fixed. No result between these two drivers can identify the shared shift.</p>`;
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
    reading.textContent = `A and ${endpoint}: about ${Math.round(indirect)} points apart through ${stage} link${stage === 1 ? '' : 's'}. Each extra link adds uncertainty; a chain is evidence, not a direct race between its endpoints.`;
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
