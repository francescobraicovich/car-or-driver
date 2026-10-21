// Head-to-head view: who finishes ahead over a race distance, with the two
// drivers' rating histories underneath for context.
import { state } from './state.js';
import { el } from './dom.js';
import { drawChart } from './charts.js';
import { moveTimeCursor } from './chart-renderer.js';
import { esc } from './utils.js';
import { hideInfoTip, infoHtml, setInfo } from './info-tip.js';
import { scrubWeekends, setRace } from './ratings-view.js';

const percent = (x) => `${Math.round(100 * x)}%`;
const surname = (name) => name.trim().split(/\s+/).slice(-1)[0];
const sessionNames = { pre: 'Before qualifying', post: 'After qualifying' };
const signed = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(0)}`;
const SIDES = ['A', 'B'];
const CHART_PADDING = 8; // pixels of the plate (CSS .head-to-head-chart) above and below the chart
let lastChart = null; // what the chart under the figures was drawn for ({ ids, markers }), to draw it again when the room it has changes
let sameCar = true; // both drivers are given the same car, so that the gap is the drivers' alone
let todayCache = { key: '', p: 0 }; // the forecast for the pair on today's grid, which does not change while a date is dragged
let resolved = null; // the moment each driver is at, as the forecast took it: { A: { raceId, date, rating }, B: ... }
const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const dayText = (iso) => (iso ? dayFormat.format(Date.parse(iso)) : '');
const setNote = (text) => setInfo(el.headToHeadNote, text); // what used to be a paragraph at the foot is behind the "i" beside the conditions
/** A bar split between driver A and driver B: the share of each, with the line at even odds drawn by the style sheet. */
const split = (p, className) =>
  `<span class="${className}" aria-hidden="true"><i style="flex:${p}"></i><i style="flex:${1 - p}"></i></span>`;
/**
 * The head of a result: the two names (each over a rule in the driver's colour, with what is under it), the chance of each in large figures with the
 * rating the forecast took for the driver and the date of the weekend it is from, and the bar. A side is { name, lines, rating, date }.
 */
const topHtml = (a, b, pA, labelA, labelB) => {
  const moment = (x) => `<span class="head-to-head-moment"><em>${x.rating}</em><small>${dayText(x.date)}</small></span>`;
  const small = (x) => x.lines.map((line) => `<small>${esc(line)}</small>`).join('');
  const reading = (label, p, x) => `${label} ${percent(p)}, rating ${x.rating} on ${dayText(x.date)}`;
  return `
    <div class="head-to-head-names"><div>${esc(a.name)}${small(a)}</div><div>${esc(b.name)}${small(b)}</div></div>
    <div class="head-to-head-figures" aria-label="${esc(reading(labelA, pA, a))}; ${esc(reading(labelB, 1 - pA, b))}">
      <span class="head-to-head-figure"><b>${percent(pA)}</b>${moment(a)}</span>
      <span class="head-to-head-figure"><b>${percent(1 - pA)}</b>${moment(b)}</span>
    </div>
    <div class="head-to-head-bar" aria-hidden="true"><i style="flex:${pA}"></i><i style="flex:${1 - pA}"></i></div>`;
};
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
        <label class="field" id="headToHeadCarField${s}">Car<select id="headToHeadCar${s}"></select></label>
        <div class="head-to-head-when" id="headToHeadCarRow${s}" hidden>
          <label class="field">Car from<select id="headToHeadCarWhen${s}"><option value="same">Same time as the driver</option><option value="prime">Prime</option><option value="latest">Latest</option><option value="date">A specific date…</option></select></label>
          <label class="field" id="headToHeadCarDateField${s}" hidden>Date<input type="date" id="headToHeadCarDate${s}" /></label>
        </div>
      </details>`,
    );
    for (const node of host.querySelectorAll('[id]')) side[node.id] = node;
    for (const id of ['When', 'Date', 'Car', 'CarWhen', 'CarDate']) {
      const changed = () => {
        renderHeadToHead();
        if (id === 'When' || id === 'Date') followMoment(s); // the moment of the driver changed: the race goes to that weekend
      };
      side[`headToHead${id}${s}`].addEventListener('change', changed);
      side[`headToHead${id}${s}`].addEventListener('input', changed);
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
  side[`headToHeadCarField${s}`].hidden = sameCar; // the car is the same for both: there is nothing to choose
  side[`headToHeadCarRow${s}`].hidden = sameCar || !car;
  side[`headToHeadCarDateField${s}`].hidden = sameCar || !car || carWhen !== 'date';
  el[`headToHeadSide${s}`].querySelector('summary').textContent = sameCar ? 'Another season' : 'Another season or car';
  el[`headToHeadPrime${s}`].setAttribute('aria-pressed', String(when === 'prime'));
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

/**
 * The two sides as the forecast takes them. With the same car on, both are given the car of driver A at his moment, by the same car and the same
 * explicit date (not "their own": that resolves against each driver's own weekends, and the forecast would then take them for different cars).
 */
function matchup() {
  const sides = SIDES.map(readSide);
  if (!sameCar) return sides;
  const first = forecasting.resolveSide(state.model, sides[0]);
  if (first.error) return sides;
  const shared = { carId: first.constructorId, carWhen: { kind: 'date', date: first.car.to } };
  return sides.map((x) => ({ ...x, ...shared }));
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

/** The two drivers' race ratings over both careers, with a marker for the moment each is taken at. */
function drawHistory() {
  const svg = el.headToHeadChart;
  if (!lastChart) {
    svg.replaceChildren();
    return;
  }
  const { ids, markers } = lastChart;
  const series = new Map(ids.map((id) => [id, state.model.dh.get(id) || []]));
  const dates = [...series.values()].flat().map((p) => Date.parse(p.date));
  drawChart(svg, null, ids, series, state.model.dname, 'race', 'driver', {
    ...(dates.length ? { xDomain: [Math.min(...dates) - 14 * 864e5, Math.max(...dates) + 14 * 864e5] } : {}),
    legend: false, // the names above the figures have the colours
    casing: true,
    height: Math.max(0, el.headToHeadChartWrap.clientHeight - CHART_PADDING), // as tall as the room the panel leaves it (0 while hidden: the renderer then takes its own)
    colors: new Map(
      ids.length === 2
        ? [
            [ids[0], 'var(--s1)'], // driver A, as in the bar and over the name
            [ids[1], 'var(--s2)'],
          ]
        : [[ids[0], 'var(--ink-3)']], // one driver at two moments: one line, and the markers have the two colours
    ),
    timeCursor: { markers, onScrub: scrub },
  });
}

/** Shows weekend number `index` of the ratings, and with it the race at the bottom right. */
function goToWeekend(index, announce) {
  if (index >= 0 && index !== state.raceIndex) setRace(index, { announce });
}
const weekendOfRace = (raceId) => state.model.snaps.findIndex((snap) => String(snap.raceId) === String(raceId));
/** The last weekend on or before a time (the first one, before them all). */
const weekendAt = (time) =>
  Math.max(
    0,
    state.model.snaps.findLastIndex((snap) => Date.parse(snap.date) <= time),
  );
/** After a change of the moment of driver `s` (his prime, a date): the race goes to the weekend that moment is from. */
function followMoment(s) {
  if (resolved) goToWeekend(weekendOfRace(resolved[s].raceId), true);
}

/**
 * Dragging along the chart sets the date of both drivers (each within his own career, as the date field would have it). The chart is not drawn
 * again meanwhile (its markers move: drawing it would drop the drag), the moves are taken once a frame, and the weekends count as going by: the
 * race on the page waits for the weekend the drag stops at, and the address is told once, at the end.
 */
let dragActive = false; // the date is being dragged: the chart is not drawn again meanwhile
let draggedTo = 0;
let dragFrame = 0;
function scrub(time, phase) {
  const apply = () => {
    dragFrame = 0;
    const iso = new Date(draggedTo).toISOString().slice(0, 10);
    for (const s of SIDES) {
      const [from, to] = span(state.model.dh.get(el[`headToHead${s}`].value));
      side[`headToHeadWhen${s}`].value = 'date';
      side[`headToHeadDate${s}`].value = iso < from ? from : iso > to ? to : iso;
    }
    renderHeadToHead();
    goToWeekend(weekendAt(draggedTo), false);
  };
  draggedTo = time;
  if (phase === 'start') {
    dragActive = true;
    scrubWeekends(true);
  }
  if (phase !== 'end') {
    if (!dragFrame) dragFrame = requestAnimationFrame(apply);
    return;
  }
  cancelAnimationFrame(dragFrame);
  apply();
  dragActive = false;
  scrubWeekends(false);
  const snap = state.model.snaps[state.raceIndex];
  window.dispatchEvent(new CustomEvent('f1:race-changed', { detail: { index: state.raceIndex, raceId: snap.raceId, date: snap.date } }));
}

/** Tells the race on the page which two drivers are being compared (it lights their dots and rows in A's colour and B's). */
function announceVersus() {
  const [a, b] = [el.headToHeadA.value, el.headToHeadB.value];
  window.dispatchEvent(new CustomEvent('f1:versus-drivers', { detail: { a, b: b === a ? null : b } }));
}

/** The chart under the figures, with a marker for the moment of each driver (A in the first colour, B in the second). */
function showMoments() {
  const ids = [el.headToHeadA.value, el.headToHeadB.value];
  const markers = [
    { time: Date.parse(resolved.A.date), color: 'var(--s1)' },
    { time: Date.parse(resolved.B.date), color: 'var(--s2)' },
  ];
  showChart(ids[0] === ids[1] ? [ids[0]] : ids, markers);
  if (document.body.dataset.page === 'head-to-head') announceVersus();
}

/** Draws the chart again, or only moves its markers if it is already drawn for these two drivers. */
function showChart(ids, markers) {
  const same = lastChart && lastChart.ids.join() === ids.join();
  lastChart = { ids, markers };
  el.headToHeadChartWrap.hidden = false;
  if (same && el.headToHeadChart.childElementCount) moveTimeCursor(el.headToHeadChart, markers);
  else drawHistory();
}

/** A constructed matchup: any driver and car, at any moment, dry or wet. Ratings only. */
function renderScenario(sides, wet, L) {
  el.headToHeadSessionField.hidden = true;
  el.headToHeadGridFields.hidden = true;
  const circuitId = el.headToHeadCircuit.value || '';
  const r = forecasting.scenarioForecast(state.model, sides[0], sides[1], { wet, L, circuitId });
  el.headToHeadState.textContent = conditionsLine(wet, L, '');
  if (r.error) {
    el.headToHeadOut.innerHTML = `<p class="head-to-head-why">${esc(r.error)}</p>`;
    el.headToHeadChartWrap.hidden = true;
    el.headToHeadCarName.textContent = '';
    resolved = lastChart = null;
    setNote('');
    return;
  }
  const { a, b } = r;
  const sameName = a.name === b.name;
  // under the name: the moment of the driver's career ("2026", "prime, 2022": the name is above), and the car at its moment ("2026 Red Bull")
  const moment = (label, name) => (label.endsWith(` ${name}`) ? label.slice(0, -name.length - 1) : label);
  const driverWhen = (x) => `${x.driver.prime ? 'prime, ' : ''}${moment(x.driver.label, x.name)}`;
  const carWhen = (x) => `${x.car.prime ? 'prime, ' : ''}${x.car.label}`;
  const tag = (x) => (sameName ? `${surname(x.name)} (${driverWhen(x)})` : surname(x.name));
  const [nameA, nameB] = [tag(a), tag(b)];
  const pA = r.p;
  const risk = (q) => 1 - (1 - q) ** L;
  const c = r.components;
  const grid = latestGridIds();
  const onGrid = grid.has(String(a.driverId)) && grid.has(String(b.driverId)) && a.driverId !== b.driverId;
  const todayKey = `${a.driverId}|${b.driverId}|${L}|${circuitId}`;
  if (onGrid && todayCache.key !== todayKey)
    todayCache = { key: todayKey, p: forecasting.forecastPreWeekend(state.model, a.driverId, b.driverId, { L, circuitId }).p };
  const today = onGrid ? todayCache.p : null;
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
  const head = (x) => ({ name: x.name, lines: sameCar ? [] : [carWhen(x)], rating: Math.round(x.driver.race), date: x.driver.to });
  const [headA, headB] = [head(a), head(b)];
  resolved = {
    A: { raceId: a.driver.points[0].raceId, date: a.driver.to, rating: headA.rating },
    B: { raceId: b.driver.points[0].raceId, date: b.driver.to, rating: headB.rating },
  };
  el.headToHeadCarName.textContent = sameCar ? carWhen(a) : ''; // the shared car, said once
  el.headToHeadOut.innerHTML = `
    ${topHtml(headA, headB, pA, nameA, nameB)}
    ${stepsBlock(rows, nameA, nameB)}
    ${today === null ? '' : `<p class="head-to-head-why">Today’s forecast: ${percent(today)} for ${esc(nameA)}${infoHtml('For these two on the current grid, in their own cars and with recent form.')}</p>`}
    <dl class="head-to-head-facts">
      <div><dt>Rating gap${infoHtml(`${nameA} minus ${nameB}, in points: ${gapParts.join(', ')}.`)}</dt><dd>${signed(r.gap)} <small>points</small></dd></div>
      <div><dt>Retirement risk, ${L} laps${infoHtml(`The chance that each driver retires within ${L} laps: ${nameA} first, ${nameB} second.`)}</dt><dd>${swatches(percent(risk(r.qA)), percent(risk(r.qB)))}</dd></div>
    </dl>`;
  const notes = [a.driver.note, a.car.note, b.driver.note, b.car.note].filter(Boolean);
  setNote(
    `${sameCar ? 'Both drivers in the same car, so the gap is the drivers’ alone, from ratings only. ' : 'What-if matchup from ratings alone. '}No recent form or qualifying. A rating is measured against the field of its own time, so comparing eras is a thought experiment.${notes.length ? ` ${[...new Set(notes)].join(' ')}` : ''}`,
  );
  showMoments();
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
    el.headToHeadSameCar.setAttribute('aria-pressed', String(sameCar));
    for (const s of SIDES) syncSide(s);
    const sides = matchup();
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
    el.headToHeadCarName.textContent = '';
    resolved = lastChart = null;
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
  const latestOf = (id) => state.model.dh.get(String(id)).at(-1);
  const sideOf = (x) => {
    const point = latestOf(x.driverId);
    return { name: x.name, lines: [x.car], rating: Math.round(point.race), date: point.date, raceId: point.raceId };
  };
  const [headA, headB] = [sideOf(r.a), sideOf(r.b)];
  resolved = { A: headA, B: headB };
  el.headToHeadCarName.textContent = '';
  el.headToHeadOut.innerHTML = `
    ${topHtml(headA, headB, pA, r.a.name, r.b.name)}
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
  showMoments();
}

export function initHeadToHead() {
  let chartHeight = 0;
  new ResizeObserver(() => {
    const height = el.headToHeadChartWrap.clientHeight;
    if (height > 0 && height !== chartHeight && lastChart && !dragActive) {
      chartHeight = height;
      drawHistory();
    }
  }).observe(el.headToHeadChartWrap);
  el.headToHeadSameCar.addEventListener('click', () => {
    sameCar = !sameCar;
    renderHeadToHead();
  });
  for (const s of SIDES)
    el[`headToHeadPrime${s}`].addEventListener('click', () => {
      // a driver's prime is the weekend his rating was highest; pressing it again goes back to his latest
      const when = side[`headToHeadWhen${s}`];
      when.value = when.value === 'prime' ? 'latest' : 'prime';
      renderHeadToHead();
      followMoment(s);
    });
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
  // the ratings and the race go back to the weekend they were at when the view was opened, however it is left (a date dragged here is an exploration)
  let weekendOnOpen = null;
  window.addEventListener('f1:workspace-changed', () => {
    const open = document.body.dataset.page === 'head-to-head';
    if (state.model && open) {
      weekendOnOpen ??= state.raceIndex;
      renderHeadToHead();
    }
    if (!open && weekendOnOpen !== null) {
      goToWeekend(weekendOnOpen, true);
      weekendOnOpen = null;
    }
  });
}
