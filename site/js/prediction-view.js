import { state } from './state.js';
import { esc } from './utils.js';
import { predictGrid } from './prediction.js';

export function initPrediction() {
  const page = document.createElement('section');
  page.id = 'predictionPage';
  page.className = 'graph-page prediction-page';
  page.tabIndex = -1;
  page.setAttribute('aria-label', 'Race prediction');
  page.hidden = true;
  page.innerHTML = `<button type="button" class="graph-close" aria-label="Close prediction">×</button>
    <header class="prediction-header"><h2>Race prediction</h2><span>Expected finish</span></header>
    <div class="prediction-toolbar">
      <label class="prediction-race"><span class="sr-only">Grand Prix</span><select id="predictionRace"></select></label>
      <details class="prediction-settings"><summary>Settings</summary><div class="prediction-settings-panel">
        <label>Circuit <select id="predictionCircuit"></select></label>
        <label>Race date <input id="predictionDate" type="date"></label>
        <label>Race distance <span><input id="predictionLaps" type="number" min="1" max="100" step="1"> laps</span></label>
        <p>Circuit selects the latest recorded race distance, or 60 laps if unavailable. The forecast has no circuit-specific or wet-weather adjustment.</p>
      </div></details>
    </div>
    <button type="button" class="prediction-grid-toggle" aria-controls="predictionGrid" aria-pressed="false">How does the starting grid change the prediction?</button>
    <div class="prediction-actions"><button type="button" data-action="apply">Apply grid</button><button type="button" data-action="clear">Clear grid</button><span>Enter every position.</span></div>
    <p class="prediction-caption"><span class="prediction-caption-full">Average finishing position · lower is better</span><span class="prediction-caption-short">Avg. finish · lower is better</span></p>
    <div class="prediction-table-wrap"><table class="prediction-table" id="predictionGrid"><thead><tr><th scope="col" aria-label="Predicted position">#</th><th scope="col">Driver</th><th class="prediction-team" scope="col">Car</th><th scope="col">Avg.</th><th class="prediction-bar-heading" scope="col"><span class="sr-only">Relative expected finish</span></th><th class="prediction-start" scope="col">Grid</th></tr></thead><tbody></tbody></table></div>
    <p class="prediction-status" role="status" aria-live="polite"></p>`;
  document.getElementById('stage').append(page);
  const race = page.querySelector('#predictionRace');
  const circuit = page.querySelector('#predictionCircuit');
  const date = page.querySelector('#predictionDate');
  const laps = page.querySelector('#predictionLaps');
  const status = page.querySelector('.prediction-status');
  const table = page.querySelector('tbody');
  const gridToggle = page.querySelector('.prediction-grid-toggle');
  let calendar = null;
  let model = null;
  let positions = new Map();
  let previousDrivers = [];

  function render() {
    if (!calendar || !state.model) return;
    const current = state.model;
    const drivers = current.snaps.at(-1).drivers;
    page.style.setProperty('--prediction-half', String(Math.ceil(drivers.length / 2)));
    if (current !== model) {
      model = current;
      positions = new Map();
      previousDrivers = [];
      date.min = current.snaps.at(-1).date;
      const next = calendar.races.find((row) => row.date > current.snaps.at(-1).date);
      date.value = next?.date || current.snaps.at(-1).date;
      race.value = next?.date || '';
      circuit.value = next?.circuitId || calendar.circuits[0]?.id || '';
      laps.value = calendar.circuits.find((row) => row.id === circuit.value)?.laps || 60;
    }
    let rows = (previousDrivers.length ? previousDrivers : drivers).map((driver) => ({ driver }));
    try {
      rows = predictGrid(model, {
        date: date.value,
        laps: Number(laps.value),
        positions: drivers.map((driver) => positions.get(driver.driverId) ?? ''),
      });
      previousDrivers = rows.map((row) => row.driver);
      status.textContent = positions.size ? 'Starting grid applied.' : 'Pre-weekend · no starting grid.';
    } catch (error) {
      status.textContent = error.message;
    }
    table.innerHTML = rows
      .map(
        ({ driver, expectedPosition }, index) =>
          `<tr><td class="prediction-rank">${expectedPosition == null ? '—' : index + 1}</td><th scope="row" aria-label="${esc(driver.name)}, ${esc(driver.car)}" title="${esc(driver.name)} · ${esc(driver.car)}"><span class="prediction-name-full">${esc(driver.name)}</span><span class="prediction-name-short" aria-hidden="true">${esc(driver.name.split(' ').at(-1))}</span></th><td class="prediction-team">${esc(driver.car)}</td><td class="prediction-expected">${expectedPosition == null ? '—' : expectedPosition.toFixed(1)}</td><td class="prediction-bar" aria-hidden="true"><i class="bar-track"></i><i class="bar-base" style="width:${expectedPosition == null ? 0 : Math.max(0, Math.min(100, (100 * (drivers.length - expectedPosition)) / (drivers.length - 1)))}%"></i></td><td class="prediction-start"><input type="number" min="1" max="${drivers.length}" step="1" inputmode="numeric" aria-label="Starting position for ${esc(driver.name)}" data-driver="${esc(driver.driverId)}" value="${esc(String(positions.get(driver.driverId) ?? ''))}"></td></tr>`,
      )
      .join('');
  }
  gridToggle.addEventListener('click', () => {
    const editing = page.dataset.editGrid !== 'true';
    page.dataset.editGrid = String(editing);
    gridToggle.setAttribute('aria-pressed', String(editing));
  });
  page.querySelector('.graph-close').addEventListener('click', () => (location.hash = '#/'));
  window.addEventListener('keydown', (event) => {
    if (!page.hidden && event.key === 'Escape' && !event.defaultPrevented) location.hash = '#/';
  });
  page.addEventListener('input', (event) => {
    const target = event.target;
    if (!target.dataset.driver) return;
    if (target.value === '') positions.delete(target.dataset.driver);
    else positions.set(target.dataset.driver, target.value);
    status.textContent = 'Starting grid edited. Select Apply starting grid to update the prediction.';
  });
  page.querySelector('[data-action="apply"]').addEventListener('click', render);
  page.querySelector('[data-action="clear"]').addEventListener('click', () => {
    positions.clear();
    render();
  });
  page.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.driver) return;
    if (target === race) {
      const selected = calendar.races.find((row) => row.date === race.value);
      if (selected) {
        date.value = selected.date;
        circuit.value = selected.circuitId;
        laps.value = calendar.circuits.find((row) => row.id === selected.circuitId)?.laps || 60;
      }
    } else if (target === date) race.value = '';
    else if (target === circuit) {
      race.value = '';
      laps.value = calendar.circuits.find((row) => row.id === circuit.value)?.laps || 60;
    }
    render();
  });
  window.addEventListener('f1:workspace-changed', () => {
    page.hidden = document.body.dataset.page !== 'prediction';
    if (!page.hidden) {
      render();
      page.focus({ preventScroll: true });
    }
  });
  window.addEventListener('f1:model-ready', render);
  fetch('./assets/prediction-calendar.json', { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      calendar = data;
      race.innerHTML =
        '<option value="">Custom</option>' +
        data.races.map((row) => `<option value="${esc(row.date)}">${esc(row.name)} · ${esc(row.date)}</option>`).join('');
      circuit.innerHTML = data.circuits.map((row) => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('');
      render();
    })
    .catch((error) => {
      status.textContent = `Race calendar could not be loaded: ${error.message}`;
    });
}
