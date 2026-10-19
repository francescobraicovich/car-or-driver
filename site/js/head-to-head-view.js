// Head-to-head view: who finishes ahead over a race distance, with the two
// drivers' rating histories underneath for context.
import { state } from './state.js';
import { el } from './dom.js';
import { drawChart } from './charts.js';
import { esc } from './utils.js';

const percent = (x) => `${Math.round(100 * x)}%`;
const surname = (name) => name.trim().split(/\s+/).slice(-1)[0];
const sessionNames = { pre: 'Before qualifying', post: 'After qualifying' };
const signed = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(0)}`;
const SIDES = ['A', 'B'];
const side = {}; // per-side controls, keyed `${name}${A|B}`; built once

let forecasting = null; // head-to-head-forecasting.js, fetched the first time the page is shown

function latestGridIds() {
  const latest = state.model.snaps[state.model.snaps.length - 1];
  return new Set(latest.drivers.map((d) => String(d.driverId)));
}

function optionGroups(selected) {
  const model = state.model;
  const latest = model.snaps[model.snaps.length - 1];
  const current = latest.drivers.slice().sort((a, b) => b.combined - a.combined);
  const option = (id, label) => `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(label)}</option>`;
  const now = current.map((d) => option(String(d.driverId), `${d.name} · ${d.car}`)).join('');
  const active = latestGridIds();
  const former = [...model.dh.keys()]
    .filter((id) => !active.has(String(id)))
    .map((id) => ({ id: String(id), name: model.dname.get(id) || String(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return `<optgroup label="${latest.year} grid">${now}</optgroup><optgroup label="Other drivers, A–Z">${former.map((f) => option(f.id, f.name)).join('')}</optgroup>`;
}

const MOMENTS = `<option value="latest">Latest</option><option value="prime">Prime (peak rating)</option><option value="date">A specific date…</option>`;

/** The per-side controls that turn a driver into a scenario: career moment, car, and the car's moment. */
function buildSides() {
  for (const s of SIDES) {
    const host = el[`headToHeadSide${s}`];
    host.insertAdjacentHTML(
      'beforeend',
      `<details class="head-to-head-extras" id="headToHeadExtras${s}">
        <summary>Another season, or another car</summary>
        <div class="head-to-head-when">
          <label class="field">Moment in career<select id="headToHeadWhen${s}">${MOMENTS}</select></label>
          <label class="field" id="headToHeadDateField${s}" hidden>Date<input type="date" id="headToHeadDate${s}" /></label>
        </div>
        <label class="field">Car<select id="headToHeadCar${s}"></select></label>
        <div class="head-to-head-when" id="headToHeadCarRow${s}" hidden>
          <label class="field">Car from<select id="headToHeadCarWhen${s}"><option value="same">Same time as the driver</option><option value="prime">Prime</option><option value="latest">Latest</option><option value="date">A specific date…</option></select></label>
          <label class="field" id="headToHeadCarDateField${s}" hidden>Date<input type="date" id="headToHeadCarDate${s}" /></label>
        </div>
      </details>`,
    );
    for (const node of host.querySelectorAll('[id]')) side[node.id] = node;
    for (const id of ['When', 'Date', 'Car', 'CarWhen', 'CarDate']) {
      side[`headToHead${id}${s}`].addEventListener('change', renderHeadToHead);
      side[`headToHead${id}${s}`].addEventListener('input', renderHeadToHead);
    }
  }
}

function fillCars() {
  const model = state.model;
  const cars = [...model.ch.keys()]
    .map((id) => ({ id: String(id), name: model.cname.get(id) || String(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const s of SIDES) {
    const select = side[`headToHeadCar${s}`];
    const keep = select.value;
    select.innerHTML = `<option value="">Their own car</option><optgroup label="Any car">${cars.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</optgroup>`;
    select.value = cars.some((c) => c.id === keep) ? keep : '';
  }
}

const span = (points) => (points?.length ? [points[0].date, points[points.length - 1].date] : ['', '']);

/** Show or hide the date fields, and keep each date inside the career or car history it picks from. */
function syncSide(s) {
  const model = state.model;
  const when = side[`headToHeadWhen${s}`].value;
  const car = side[`headToHeadCar${s}`].value;
  const carWhen = side[`headToHeadCarWhen${s}`].value;
  side[`headToHeadDateField${s}`].hidden = when !== 'date';
  side[`headToHeadCarRow${s}`].hidden = !car;
  side[`headToHeadCarDateField${s}`].hidden = !car || carWhen !== 'date';
  const [from, to] = span(model.dh.get(el[`headToHead${s}`].value));
  const date = side[`headToHeadDate${s}`];
  Object.assign(date, { min: from, max: to });
  if (!date.value || date.value < from || date.value > to) date.value = to;
  const [cFrom, cTo] = span(car ? model.ch.get(car) : null);
  const carDate = side[`headToHeadCarDate${s}`];
  Object.assign(carDate, { min: cFrom, max: cTo });
  if (car && (!carDate.value || carDate.value < cFrom || carDate.value > cTo)) carDate.value = cTo;
}

function readSide(s) {
  const when = side[`headToHeadWhen${s}`].value;
  const car = side[`headToHeadCar${s}`].value;
  const carWhen = side[`headToHeadCarWhen${s}`].value;
  return {
    driverId: el[`headToHead${s}`].value,
    when: { kind: when, date: side[`headToHeadDate${s}`].value },
    carId: car,
    carWhen: { kind: carWhen, date: side[`headToHeadCarDate${s}`].value },
  };
}

/** The live forecast (with recent form) only applies to today's grid, dry, as things stand. */
function isLive(sides, wet) {
  const grid = latestGridIds();
  return !wet && sides.every((x) => x.when.kind === 'latest' && !x.carId && grid.has(String(x.driverId)));
}

/**
 * "How the forecast is built": the same probability (for driver A) after each
 * stage, so a headline that disagrees with the ratings says why.
 */
function stepsHtml(r, nameA, nameB, teammates, own) {
  const { full } = r.breakdown;
  // State-space: "ratings alone" is the state-space ratings, with their uncertainty
  const ratings = own ? own.p : r.breakdown.ratings;
  const favours = (p) => (p >= 0.5 ? nameA : nameB);
  const [byRatings, byForecast] = [ratings, full].map(favours);
  let why = '';
  if (byRatings !== byForecast)
    why = own
      ? `The ratings alone favour ${byRatings}. The forecast model also weighs recent form, the grid and the circuit, and favours ${byForecast}.`
      : `The ratings favour ${byRatings}, but ${byForecast} has had the better recent form${teammates ? ', and the model trusts rating gaps between teammates less' : ''}.`;
  const step = (label, p, note) => `<li><span>${label}<small>${note}</small></span><b>${percent(p)}</b></li>`;
  const first = own
    ? step(
        'Ratings alone',
        ratings,
        `Driver plus car rating, with their uncertainty: a gap of ${signed(own.gap)} ± ${own.sd.toFixed(0)} points.`,
      )
    : step('Ratings alone', ratings, 'Driver rating plus car rating, as they stand.');
  // the same ratings go through the forecast model with recent form switched off: that adds retirement risk and the
  // calibration to how often gaps of this size have held up, so the step to the forecast is not credited to form alone
  const second = !own
    ? ''
    : step(
        'Calibrated',
        r.breakdown.calibrated,
        'Adds retirement risk and adjusts to how often gaps of this size have held up, before any recent form.',
      );
  const third = own
    ? step(
        'With recent form',
        full,
        'Adds how each driver and car has done over the last few races, and the grid and circuit when known. This is the forecast.',
      )
    : step('With recent form', full, 'Adds how each driver and car has done over the last few races. This is the forecast.');
  return `
    <div class="head-to-head-steps">
      <h3>How the forecast is built <small>chance ${esc(nameA)} finishes ahead</small></h3>
      <ol>
        ${first}
        ${second}
        ${third}
      </ol>
      ${why ? `<p class="head-to-head-why">${esc(why)}</p>` : ''}
    </div>`;
}

export function refreshHeadToHead() {
  if (!state.model) return;
  el.headToHeadPanel.hidden = false;
  const keepA = el.headToHeadA.value;
  const keepB = el.headToHeadB.value;
  const keepC = el.headToHeadCircuit.value;
  const keepS = el.headToHeadSession.value;
  el.headToHeadA.innerHTML = optionGroups(keepA || undefined);
  el.headToHeadB.innerHTML = optionGroups(keepB || undefined);
  if (!keepA) el.headToHeadA.selectedIndex = 0;
  if (!keepB) el.headToHeadB.selectedIndex = Math.min(1, el.headToHeadB.options.length - 1);
  if (!el.headToHeadLaps.value) el.headToHeadLaps.value = 60;
  if (!side.headToHeadWhenA) buildSides();
  fillCars();
  const sessions = ['pre', 'post'];
  el.headToHeadSession.innerHTML = sessions
    .map((s) => `<option value="${s}"${s === keepS ? ' selected' : ''}>${sessionNames[s]}</option>`)
    .join('');
  const tracks = state.model.circuitList || [];
  el.headToHeadCircuit.innerHTML =
    '<option value="">Any circuit</option>' +
    tracks.map((t) => `<option value="${esc(t.id)}" ${t.id === keepC ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
}

function drawHistory(r, names) {
  const svg = el.headToHeadChart;
  const ids = [String(r.a.driverId), String(r.b.driverId)];
  if (ids[0] === ids[1]) {
    svg.replaceChildren();
    return;
  }
  const year = r.snap.year;
  const from = year - 5;
  const series = new Map(ids.map((id) => [id, (state.model.dh.get(id) || []).filter((p) => p.year >= from && p.year <= year)]));
  const dates = [...series.values()].flat().map((p) => Date.parse(p.date));
  drawChart(
    svg,
    null,
    ids,
    series,
    names,
    'combined',
    'driver',
    dates.length ? { xDomain: [Math.min(...dates) - 14 * 864e5, Math.max(...dates) + 14 * 864e5] } : {},
  );
}

/** A constructed matchup: any driver and car, at any moment, dry or wet. Ratings only. */
function renderScenario(sides, wet, L) {
  el.headToHeadSessionField.hidden = true;
  el.headToHeadGridFields.hidden = true;
  el.headToHeadChartWrap.hidden = true;
  const circuitId = el.headToHeadCircuit.value || '';
  const r = forecasting.scenarioForecast(state.model, sides[0], sides[1], { wet, L, circuitId });
  if (r.error) {
    el.headToHeadOut.innerHTML = `<p class="head-to-head-why">${esc(r.error)}</p>`;
    el.headToHeadNote.textContent = '';
    return;
  }
  const { a, b } = r;
  const sameName = a.name === b.name;
  const tag = (x) => (sameName ? `${surname(x.name)} (${x.driver.label})` : surname(x.name));
  const [nameA, nameB] = [tag(a), tag(b)];
  const driverWhen = (x) => `${x.driver.prime ? 'prime, ' : ''}${x.driver.label}`;
  const carWhen = (x) => `${x.car.name} · ${x.car.prime ? 'prime, ' : ''}${x.car.label}`;
  const pA = r.p;
  const risk = (q) => 1 - (1 - q) ** L;
  const c = r.components;
  const step = (label, p, note) => `<li><span>${label}<small>${note}</small></span><b>${percent(p)}</b></li>`;
  const skill = (x) => state.model.wetFinal?.get(x.driverId) ?? 0;
  const row = (label, f) => `<tr><th scope="row">${label}</th><td>${f(a)}</td><td>${f(b)}</td></tr>`;
  const grid = latestGridIds();
  const onGrid = grid.has(String(a.driverId)) && grid.has(String(b.driverId)) && a.driverId !== b.driverId;
  const today = onGrid ? forecasting.forecastPreWeekend(state.model, a.driverId, b.driverId, { L, circuitId }).p : null;
  const gapParts = [`driver ${signed(c.driver)}`, `car ${signed(c.car)}`];
  if (wet) gapParts.push(`wet skill ${signed(c.wet)}`);
  if (circuitId) gapParts.push(`circuit ${signed(c.track)}`);
  el.headToHeadOut.innerHTML = `
    <div class="head-to-head-names"><div>${esc(a.name)}<small>${esc(carWhen(a))}</small><small>${esc(driverWhen(a))}</small></div><div>${esc(b.name)}<small>${esc(carWhen(b))}</small><small>${esc(driverWhen(b))}</small></div></div>
    <div class="head-to-head-figures" aria-label="${esc(nameA)} ${percent(pA)}, ${esc(nameB)} ${percent(1 - pA)}"><span>${percent(pA)}</span><span>${percent(1 - pA)}</span></div>
    <div class="head-to-head-bar" aria-hidden="true"><i style="flex:${pA}"></i><i style="flex:${1 - pA}"></i></div>
    <div class="head-to-head-steps">
      <h3>How the forecast is built <small>chance ${esc(nameA)} finishes ahead</small></h3>
      <ol>
        ${step('Ratings alone', r.pPace, `Driver rating plus car rating: ${signed(r.gap)} points (${gapParts.join(', ')}).`)}
        ${step(forecasting.isStateSpace(state.model) ? 'Calibrated' : 'Sharpened', r.dry, forecasting.isStateSpace(state.model) ? 'Adjusted to how often gaps of this size have held up in past races.' : 'Gaps of this size have won more often than the raw ratings say.')}
        ${wet ? step('In the wet', r.p, `Wet races are harder to call, so the sharpening is cut back by about a fifth (×${forecasting.WET_RATIO}).`) : ''}
      </ol>
      ${today === null ? '' : `<p class="head-to-head-why">Today’s forecast for these two on the current grid is ${percent(today)} for ${esc(nameA)}. It also uses recent form, which a what-if cannot.</p>`}
    </div>
    <table class="head-to-head-parts">
      <thead><tr><th></th><th scope="col">${esc(nameA)}</th><th scope="col">${esc(nameB)}</th></tr></thead>
      <tbody>
        ${row('Driver rating', (x) => `${x.driver.race.toFixed(0)}<small>${esc(driverWhen(x))}</small>`)}
        ${row('Car rating', (x) => `${x.car.race.toFixed(0)}<small>${esc(carWhen(x))}</small>`)}
        ${wet ? row('Wet skill', (x) => `${signed(skill(x))}<small>points, from wet races</small>`) : ''}
        ${row(`Retirement risk, ${L} laps`, (x) => percent(risk(x === a ? r.qA : r.qB)))}
      </tbody>
    </table>`;
  const notes = [a.driver.note, a.car.note, b.driver.note, b.car.note].filter(Boolean);
  el.headToHeadNote.textContent = `What-if matchup from ratings alone, with no recent form or qualifying. A rating is measured against the field of its own time, so comparing eras is a thought experiment. The first figure is ${a.name}.${notes.length ? ` ${[...new Set(notes)].join(' ')}` : ''}`;
}

export function renderHeadToHead() {
  if (!state.model || !el.headToHeadA.value) return;
  if (!forecasting) {
    if (document.body.dataset.page === 'head-to-head')
      import('./head-to-head-forecasting.js').then((module) => {
        forecasting = module;
        renderHeadToHead();
      });
    return;
  }
  const L = Math.max(1, Math.round(+el.headToHeadLaps.value || 60));
  const mode = el.headToHeadSession.value || 'pre';
  if (side.headToHeadWhenA) {
    for (const s of SIDES) syncSide(s);
    const sides = SIDES.map(readSide);
    const wet = el.headToHeadWet.value === 'wet';
    if (!isLive(sides, wet)) return renderScenario(sides, wet, L);
  }
  el.headToHeadSessionField.hidden = false;
  el.headToHeadGridFields.hidden = mode !== 'post';
  const grid = (elm) => {
    const v = +elm.value;
    return Number.isFinite(v) && v > 0 ? v : NaN;
  };
  const r =
    mode === 'post'
      ? forecasting.forecastH2H(state.model, el.headToHeadA.value, el.headToHeadB.value, L, {
          gridA: grid(el.headToHeadGridA),
          gridB: grid(el.headToHeadGridB),
        })
      : forecasting.forecastPreWeekend(state.model, el.headToHeadA.value, el.headToHeadB.value, {
          L,
          circuitId: el.headToHeadCircuit.value || '',
        });
  if (!r) {
    el.headToHeadOut.textContent = 'These two drivers never appeared in the same race.';
    el.headToHeadChartWrap.hidden = true;
    return;
  }
  const same = el.headToHeadA.value === el.headToHeadB.value;
  const pA = same ? 0.5 : r.p;
  const risk = (q) => 1 - (1 - q) ** r.L;
  // State-space: the ratings alone, with their uncertainty. Otherwise the gap the forecast starts from.
  const own =
    forecasting.isStateSpace(state.model) && !same
      ? forecasting.ratingsAlone(state.model, el.headToHeadA.value, el.headToHeadB.value)
      : null;
  const gap = own ? own.gap : (r.gap ?? r.a.packagePace - r.b.packagePace);
  const nameA = surname(r.a.name);
  const nameB = surname(r.b.name);
  const teammates = r.a.constructorId === r.b.constructorId;
  const steps = r.breakdown && !same ? stepsHtml(r, nameA, nameB, teammates, own) : '';
  el.headToHeadOut.innerHTML = `
    <div class="head-to-head-names"><div>${esc(r.a.name)}<small>${esc(r.a.car)}</small></div><div>${esc(r.b.name)}<small>${esc(r.b.car)}</small></div></div>
    <div class="head-to-head-figures" aria-label="${esc(r.a.name)} ${percent(pA)}, ${esc(r.b.name)} ${percent(1 - pA)}"><span>${percent(pA)}</span><span>${percent(1 - pA)}</span></div>
    <div class="head-to-head-bar" aria-hidden="true"><i style="flex:${pA}"></i><i style="flex:${1 - pA}"></i></div>
    ${steps}
    <dl class="head-to-head-facts two">
      <div><dt>Race-rating gap</dt><dd>${same ? '0' : signed(gap)}${own ? ` ± ${own.sd.toFixed(0)}` : ''} points<small>${esc(nameA)} minus ${esc(nameB)}${teammates ? ', same car' : ', car included'}</small></dd></div>
      <div><dt>Retirement risk over ${r.L} laps</dt><dd>${percent(risk(r.qA))} · ${percent(risk(r.qB))}<small>${esc(nameA)} · ${esc(nameB)}</small></dd></div>
    </dl>`;
  const form =
    r.forecastMode === 'post'
      ? 'with the full qualifying result'
      : r.forecastMode === 'grid'
        ? 'with the starting grid only'
        : 'before qualifying';
  el.headToHeadNote.textContent = `Chance of finishing ahead of the other driver over ${r.L} laps, ${form}, using results up to the ${r.snap.year} ${r.snap.name}. Assumes a dry race; set Conditions to Wet to change that. The first figure is ${r.a.name}.`;
  el.headToHeadChartWrap.hidden = same;
  if (!same) drawHistory(r, state.model.dname);
}

export function initHeadToHead() {
  for (const node of [
    el.headToHeadA,
    el.headToHeadB,
    el.headToHeadLaps,
    el.headToHeadSession,
    el.headToHeadCircuit,
    el.headToHeadGridA,
    el.headToHeadGridB,
    el.headToHeadWet,
  ]) {
    node.addEventListener('input', renderHeadToHead);
    node.addEventListener('change', renderHeadToHead);
  }
  /** "Head to head" from the ratings page: the two selected drivers become driver A and driver B. */
  window.addEventListener('f1:compare-head-to-head', (event) => {
    const ids = event.detail?.ids;
    if (!state.model || !Array.isArray(ids) || ids.length !== 2) return;
    ids.forEach((id, i) => {
      const select = [el.headToHeadA, el.headToHeadB][i];
      if ([...select.options].some((option) => option.value === String(id))) select.value = String(id);
    });
  });
  window.addEventListener('f1:model-ready', () => {
    refreshHeadToHead();
    renderHeadToHead();
  });
  window.addEventListener('f1:workspace-changed', () => {
    if (state.model && document.body.dataset.page === 'head-to-head') renderHeadToHead();
  });
}
