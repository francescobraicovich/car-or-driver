// Head-to-head view: who finishes ahead over a race distance, with the two
// drivers' rating histories underneath for context.
import { state } from './state.js';
import { el } from './dom.js';
import { drawChart } from './charts.js';
import { esc } from './utils.js';
import { hideInfoTip, infoHtml, setInfo } from './info-tip.js';

const percent = (x) => `${Math.round(100 * x)}%`;
const surname = (name) => name.trim().split(/\s+/).slice(-1)[0];
const sessionNames = { pre: 'Before qualifying', post: 'After qualifying' };
const signed = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(0)}`;
const SIDES = ['A', 'B'];
const CHART_PADDING = 8; // pixels of the plate (CSS .head-to-head-chart) above and below the chart
let lastForecast = null; // what the chart under the figures was drawn for, to draw it again when the room it has changes
const setNote = (text) => setInfo(el.headToHeadNote, text); // what used to be a paragraph at the foot is behind the "i" beside the conditions
/** A bar split between driver A and driver B: the share of each, with the line at even odds drawn by the style sheet. */
const split = (p, className) =>
  `<span class="${className}" aria-hidden="true"><i style="flex:${p}"></i><i style="flex:${1 - p}"></i></span>`;
const swatches = (a, b) => `<span class="head-to-head-pair"><i class="a"></i>${a}<i class="b"></i>${b}</span>`;
/** One line of the forecast's steps: what it is (with its explanation behind an icon), the split it gives, and the chance for driver A. */
const stepRow = (label, p, note) =>
  `<li><span>${esc(label)}${infoHtml(note)}</span>${split(p, 'head-to-head-step-bar')}<b>${percent(p)}</b></li>`;
const stepsBlock = (rows, nameA, nameB, why = '') => `
  <div class="head-to-head-steps">
    <h3>How the forecast is built${infoHtml(`The chance that ${nameA} finishes ahead of ${nameB} after each stage of the model, and the split it gives.`)}</h3>
    <ol>${rows.join('')}</ol>
    ${why ? `<p class="head-to-head-why">${esc(why)}</p>` : ''}
  </div>`;
/** The conditions the forecast is made in, on one line in the title of the folded controls. */
function conditionsLine(wet, L, timing) {
  const circuit = el.headToHeadCircuit.value ? el.headToHeadCircuit.selectedOptions[0]?.textContent : '';
  return [wet ? 'wet' : 'dry', `${L} laps`, timing, circuit].filter(Boolean).join(' · ');
}
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
        <summary>Another season or car</summary>
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
      ? `The ratings alone favour ${byRatings}. The forecast also weighs recent form, the grid and the circuit, and favours ${byForecast}.`
      : `The ratings favour ${byRatings}, but ${byForecast} has had the better recent form${teammates ? ', and the model trusts rating gaps between teammates less' : ''}.`;
  const rows = [
    own
      ? stepRow(
          'Ratings alone',
          ratings,
          `Driver plus car rating, with their uncertainty: a gap of ${signed(own.gap)} ± ${own.sd.toFixed(0)} points.`,
        )
      : stepRow('Ratings alone', ratings, 'Driver rating plus car rating, as they stand.'),
    // the same ratings go through the forecast model with recent form switched off: that adds retirement risk and the
    // calibration to how often gaps of this size have held up, so the step to the forecast is not credited to form alone
    ...(own
      ? [
          stepRow(
            'Calibrated',
            r.breakdown.calibrated,
            'Adds retirement risk and adjusts to how often gaps of this size have held up, before any recent form.',
          ),
        ]
      : []),
    stepRow(
      'With recent form',
      full,
      own
        ? 'Adds how each driver and car has done over the last few races, and the grid and circuit when known. This is the forecast.'
        : 'Adds how each driver and car has done over the last few races. This is the forecast.',
    ),
  ];
  return stepsBlock(rows, nameA, nameB, why);
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
  drawChart(svg, null, ids, series, names, 'combined', 'driver', {
    ...(dates.length ? { xDomain: [Math.min(...dates) - 14 * 864e5, Math.max(...dates) + 14 * 864e5] } : {}),
    legend: false, // the names above the figures have the colours
    casing: true,
    height: Math.max(0, el.headToHeadChartWrap.clientHeight - CHART_PADDING), // as tall as the room the panel leaves it (0 while hidden: the renderer then takes its own)
    colors: new Map([
      [ids[0], 'var(--s1)'], // driver A, as in the bar and over the name
      [ids[1], 'var(--s2)'],
    ]),
  });
}

/** A constructed matchup: any driver and car, at any moment, dry or wet. Ratings only. */
function renderScenario(sides, wet, L) {
  el.headToHeadSessionField.hidden = true;
  el.headToHeadGridFields.hidden = true;
  el.headToHeadChartWrap.hidden = true;
  const circuitId = el.headToHeadCircuit.value || '';
  const r = forecasting.scenarioForecast(state.model, sides[0], sides[1], { wet, L, circuitId });
  el.headToHeadState.textContent = conditionsLine(wet, L, '');
  if (r.error) {
    el.headToHeadOut.innerHTML = `<p class="head-to-head-why">${esc(r.error)}</p>`;
    setNote('');
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
  const skill = (x) => state.model.wetFinal?.get(x.driverId) ?? 0;
  const row = (label, f, note = '') =>
    `<tr><th scope="row">${label}${note ? infoHtml(note) : ''}</th><td>${f(a)}</td><td>${f(b)}</td></tr>`;
  const grid = latestGridIds();
  const onGrid = grid.has(String(a.driverId)) && grid.has(String(b.driverId)) && a.driverId !== b.driverId;
  const today = onGrid ? forecasting.forecastPreWeekend(state.model, a.driverId, b.driverId, { L, circuitId }).p : null;
  const gapParts = [`driver ${signed(c.driver)}`, `car ${signed(c.car)}`];
  if (wet) gapParts.push(`wet skill ${signed(c.wet)}`);
  if (circuitId) gapParts.push(`circuit ${signed(c.track)}`);
  const stateSpace = forecasting.isStateSpace(state.model);
  const rows = [
    stepRow('Ratings alone', r.pPace, `Driver rating plus car rating: ${signed(r.gap)} points (${gapParts.join(', ')}).`),
    stepRow(
      stateSpace ? 'Calibrated' : 'Sharpened',
      r.dry,
      stateSpace
        ? 'Adjusted to how often gaps of this size have held up in past races.'
        : 'Gaps of this size have won more often than the raw ratings say.',
    ),
    ...(wet
      ? [
          stepRow(
            'In the wet',
            r.p,
            `Wet races are harder to call, so the sharpening is cut back by about a fifth (×${forecasting.WET_RATIO}).`,
          ),
        ]
      : []),
  ];
  el.headToHeadOut.innerHTML = `
    <div class="head-to-head-names"><div>${esc(a.name)}<small>${esc(carWhen(a))}</small><small>${esc(driverWhen(a))}</small></div><div>${esc(b.name)}<small>${esc(carWhen(b))}</small><small>${esc(driverWhen(b))}</small></div></div>
    <div class="head-to-head-figures" aria-label="${esc(nameA)} ${percent(pA)}, ${esc(nameB)} ${percent(1 - pA)}"><span>${percent(pA)}</span><span>${percent(1 - pA)}</span></div>
    <div class="head-to-head-bar" aria-hidden="true"><i style="flex:${pA}"></i><i style="flex:${1 - pA}"></i></div>
    ${stepsBlock(rows, nameA, nameB)}
    ${today === null ? '' : `<p class="head-to-head-why">Today’s forecast: ${percent(today)} for ${esc(nameA)}${infoHtml('For these two on the current grid. It also uses recent form, which a what-if cannot.')}</p>`}
    <table class="head-to-head-parts">
      <thead><tr><th></th><th scope="col">${esc(nameA)}</th><th scope="col">${esc(nameB)}</th></tr></thead>
      <tbody>
        ${row('Driver rating', (x) => x.driver.race.toFixed(0), 'Race rating of the driver at the moment chosen.')}
        ${row('Car rating', (x) => x.car.race.toFixed(0), 'Race rating of the car at the moment chosen.')}
        ${wet ? row('Wet skill', (x) => signed(skill(x)), 'In points, from the driver’s wet races.') : ''}
        ${row(`Retirement risk, ${L} laps`, (x) => percent(risk(x === a ? r.qA : r.qB)))}
      </tbody>
    </table>`;
  const notes = [a.driver.note, a.car.note, b.driver.note, b.car.note].filter(Boolean);
  setNote(
    `What-if matchup from ratings alone, with no recent form or qualifying. A rating is measured against the field of its own time, so comparing eras is a thought experiment.${notes.length ? ` ${[...new Set(notes)].join(' ')}` : ''}`,
  );
}

export function renderHeadToHead() {
  if (!state.model || !el.headToHeadA.value) return;
  hideInfoTip(); // the icons under the pointer are drawn again
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
    setNote('');
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
    <dl class="head-to-head-facts">
      <div><dt>Race-rating gap${infoHtml(`${nameA} minus ${nameB}${teammates ? ', same car' : ', car included'}${own ? `, with one standard deviation of the estimate (±${own.sd.toFixed(0)})` : ''}.`)}</dt><dd>${same ? '0' : signed(gap)}${own ? ` ± ${own.sd.toFixed(0)}` : ''} <small>points</small></dd></div>
      <div><dt>Retirement risk, ${r.L} laps${infoHtml(`The chance that each driver retires within ${r.L} laps: ${nameA} first, ${nameB} second.`)}</dt><dd>${swatches(percent(risk(r.qA)), percent(risk(r.qB)))}</dd></div>
    </dl>`;
  const form =
    r.forecastMode === 'post'
      ? 'with the full qualifying result'
      : r.forecastMode === 'grid'
        ? 'with the starting grid only'
        : 'before qualifying';
  el.headToHeadState.textContent = conditionsLine(
    false,
    r.L,
    { post: 'after qualifying', grid: 'grid only' }[r.forecastMode] ?? 'before qualifying',
  );
  setNote(
    `Chance of finishing ahead over ${r.L} laps, ${form}, with results through the ${r.snap.year} ${r.snap.name}. A dry race is assumed; change that under Conditions.`,
  );
  el.headToHeadChartWrap.hidden = same;
  lastForecast = same ? null : r;
  if (!same) drawHistory(r, state.model.dname);
}

export function initHeadToHead() {
  let chartHeight = 0;
  new ResizeObserver(() => {
    const height = el.headToHeadChartWrap.clientHeight;
    if (height > 0 && height !== chartHeight && lastForecast) {
      chartHeight = height;
      drawHistory(lastForecast, state.model.dname);
    }
  }).observe(el.headToHeadChartWrap);
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
