// The head to head of two drivers, in the page (head-to-head-content.js writes it; the data of the page is in #pairData). The forecasts the page
// opens with are worked out when it is published, so changing the moment (their best, their latest, the next race) or the car changes nothing but
// the figures. Taking the drivers at other dates (a marker dragged on the chart, or a slider) or changing the conditions of the next race needs the
// ratings: they are fetched then, once. Choosing two other drivers opens their page, or, for a pair without one, /head-to-head?a=…&b=…, which this
// script draws from the published ratings.
import { deserialize } from '../../packages/core/src/json-serialization.js';
import { withHistories } from '../../packages/core/src/weekend-histories.js';
import { centredRatings } from './rating-reference.js';
import { withAnnualUncertainty } from './retrospective-uncertainty.js';
import { CHART, chartScale, markerAttributes } from './rating-chart.js';
import { RACE_LAPS, headToHeadForecasts, momentForecast, nextRaceForecast } from './head-to-head-forecasts.js';
import { answerSentence, detailsHtml, forecastFor, headToHeadPanels, pairAddress, percent, whenLine } from './head-to-head-content.js';
import { esc } from './utils.js';

const fetchJson = async (path) => {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  return deserialize(await response.text());
};

let drivers = null; // the list of every driver and the pages of the pairs (/head-to-head-drivers.json), fetched once
const driverList = () => (drivers ??= fetchJson('/head-to-head-drivers.json'));

let historical = null; // the published historical ratings with their histories, and the displayed ones: fetched once, when first needed
function historicalRatings() {
  historical ??= Promise.all([fetchJson('/data/retrospective.json'), fetchJson('/data/rating-reference.json')]).then(
    ([retrospective, reference]) => {
      const yearly = withAnnualUncertainty(retrospective.model);
      return { model: withHistories(yearly), display: withHistories(centredRatings(yearly, reference, retrospective.refitHash)) };
    },
  );
  return historical;
}
let current = null; // the current ratings (the next race): fetched once, when first needed
const currentRatings = () => (current ??= fetchJson('/data/model.json').then((file) => file.model));

/** The choice of two other drivers: every driver, the current grid first; a choice opens the page of the two. */
async function fillPickers(form, chosen, { keepButton = false } = {}) {
  const list = await driverList();
  const grid = new Set(list.grid);
  const byName = [...list.drivers].sort((x, y) => x.name.localeCompare(y.name, 'en'));
  const options = (selected) =>
    `<optgroup label="Current grid">${list.grid
      .map((id) => list.drivers.find((driver) => driver.id === id))
      .map((driver) => `<option value="${esc(driver.id)}"${driver.id === selected ? ' selected' : ''}>${esc(driver.name)}</option>`)
      .join('')}</optgroup><optgroup label="Other drivers, A–Z">${byName
      .filter((driver) => !grid.has(driver.id))
      .map((driver) => `<option value="${esc(driver.id)}"${driver.id === selected ? ' selected' : ''}>${esc(driver.name)}</option>`)
      .join('')}</optgroup>`;
  const [a, b] = [form.elements.a, form.elements.b];
  a.innerHTML = options(chosen[0]);
  b.innerHTML = options(chosen[1]);
  form.querySelector('button[type="submit"]').hidden = !keepButton; // (a choice opens the page at once; the button is for the two already chosen)
  const open = () => {
    if (a.value && b.value && a.value !== b.value) location.assign(pairAddress(list.pages, a.value, b.value));
  };
  a.addEventListener('change', open);
  b.addEventListener('change', open);
  form.addEventListener('submit', (event) => {
    event.preventDefault(); // (the security policy sends no form: the button opens the page of the two itself)
    open();
  });
}

/** The data of the page of two drivers without a page of their own, worked out here as the build works it out for the others. */
async function drawnData(firstId, secondId) {
  const [list, ratings] = await Promise.all([driverList(), historicalRatings()]);
  const summaries = [firstId, secondId].map((id) => list.drivers.find((driver) => driver.id === id));
  if (summaries.some((driver) => !driver)) return null;
  const pair = summaries.map((driver) => ({
    ...driver,
    rows: (ratings.display.dh.get(driver.id) ?? []).map((row) => ({ date: row.date, rating: Math.round(row.overall * 10) / 10 })),
  }));
  const bothOnGrid = summaries.every((driver) => list.grid.includes(driver.id));
  const forecasts = headToHeadForecasts(
    { historical: ratings.model, filtered: bothOnGrid ? await currentRatings() : { snaps: [{ drivers: [] }] } },
    summaries.map((driver) => ({ id: driver.id, best: driver.best.date })),
  );
  return { path: null, drivers: pair, teammates: null, forecasts };
}

/** The head to head on the page: the moment, the car, the dates and the conditions, and the figures they give. */
function runHeadToHead(data) {
  const root = document.getElementById('headToHead');
  const chart = document.querySelector('[data-chart] svg');
  const series = data.drivers.map((driver) => ({ label: driver.name, rows: driver.rows }));
  const scale = chartScale(series);
  const ids = data.drivers.map((driver) => driver.id);
  const view = { moment: 'best', car: 'same', chosen: null, next: data.forecasts.next, dates: null, work: 0 };
  const fields = root.querySelector('.head-to-head-conditions');
  const sliders = [...document.querySelectorAll('[data-slider]')];

  const forecast = () =>
    view.moment === 'chosen' ? view.chosen : view.moment === 'next' ? view.next : forecastFor(data.forecasts, view.moment, view.car);

  function show() {
    const shown = forecast();
    const p = shown && !shown.error ? shown.p : 0.5;
    root.querySelector('[data-chance="0"]').textContent = percent(p);
    root.querySelector('[data-chance="1"]').textContent = percent(1 - p);
    const [first, second] = root.querySelectorAll('[data-split] i');
    first.style.flex = String(p);
    second.style.flex = String(1 - p);
    root.querySelector('[data-answer]').innerHTML = answerSentence(data, shown, view.moment, view.car);
    root.querySelector('[data-when]').innerHTML = whenLine(data, shown, view.moment);
    root.querySelector('[data-details]').innerHTML = detailsHtml(data, shown);
    for (const button of root.querySelectorAll('[data-moment]')) {
      button.setAttribute('aria-pressed', String(button.dataset.moment === view.moment));
      if (button.dataset.moment === 'chosen') button.hidden = !view.chosen;
    }
    for (const button of root.querySelectorAll('[data-car]')) {
      button.setAttribute('aria-pressed', String(view.moment !== 'next' && button.dataset.car === view.car));
      button.disabled = view.moment === 'next'; // (the next race is in their own cars)
    }
    if (shown?.dates) placeMarkers(shown.dates);
  }

  /** The markers and the sliders at the date each driver is taken at. */
  function placeMarkers(dates) {
    data.drivers.forEach((driver, index) => {
      const at = driver.rows.findLastIndex((row) => row.date <= dates[index]);
      const row = driver.rows[Math.max(0, at)];
      const marker = chart?.querySelector(`.chart-marker[data-series="${index}"]`);
      if (marker) {
        const { x, y } = markerAttributes(scale, row);
        marker.setAttribute('transform', `translate(${x} 0)`);
        marker.querySelector('circle').setAttribute('cy', y);
      }
      if (sliders[index]) sliders[index].value = String(Math.max(0, at));
    });
  }

  /** The two drivers at the dates chosen: the historical ratings are fetched the first time. */
  async function choose(dates) {
    view.dates = dates;
    view.moment = 'chosen';
    placeMarkers(dates);
    const work = ++view.work;
    root.querySelector('[data-answer]').textContent = 'Working it out…';
    const ratings = await historicalRatings();
    if (work !== view.work) return; // (a later choice has been made meanwhile)
    view.chosen = momentForecast(
      ratings.model,
      ids,
      dates.map((date) => ({ kind: 'date', date })),
      view.car,
      RACE_LAPS,
    );
    show();
  }

  /** The next race in the conditions given (the distance, and both places on the grid when given). */
  async function conditions() {
    const number = (name) => {
      const value = Number(fields.querySelector(`[name="${name}"]`).value);
      return Number.isInteger(value) && value > 0 ? value : null;
    };
    const L = Math.min(100, number('laps') ?? RACE_LAPS);
    const [gridA, gridB] = [number('gridA'), number('gridB')];
    view.moment = 'next';
    const work = ++view.work;
    root.querySelector('[data-answer]').textContent = 'Working it out…';
    const model = await currentRatings();
    if (work !== view.work) return;
    try {
      view.next = nextRaceForecast(model, ids, { L, ...(gridA && gridB && gridA !== gridB ? { gridA, gridB } : {}) });
    } catch (error) {
      view.next = { error: error.message };
    }
    show();
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-moment], [data-car]');
    if (!button || button.disabled) return;
    if (button.dataset.car) {
      view.car = button.dataset.car;
      if (view.moment === 'chosen' && view.dates) return choose(view.dates);
    } else view.moment = button.dataset.moment;
    show();
  });
  fields?.addEventListener('change', conditions);

  // a marker follows the pointer along the time axis; the driver nearer the pointer in time is the one moved
  let dragged = null;
  const dateAt = (event) => {
    const box = chart.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * CHART.width;
    return new Date(scale.timeAt(x)).toISOString().slice(0, 10);
  };
  const nearest = (index, date) => {
    const rows = data.drivers[index].rows;
    const at = rows.findLastIndex((row) => row.date <= date);
    return rows[Math.max(0, at)].date;
  };
  const markedDates = () => view.dates ?? forecast()?.dates ?? data.drivers.map((driver) => driver.best.date);
  chart?.addEventListener('pointerdown', (event) => {
    const date = dateAt(event);
    const dates = markedDates();
    const distance = (index) => Math.abs(Date.parse(dates[index]) - Date.parse(date));
    dragged = distance(0) <= distance(1) ? 0 : 1;
    chart.setPointerCapture(event.pointerId);
    move(event);
  });
  const move = (event) => {
    if (dragged === null) return;
    const dates = [...markedDates()];
    dates[dragged] = nearest(dragged, dateAt(event));
    view.dates = dates;
    placeMarkers(dates);
  };
  chart?.addEventListener('pointermove', move);
  const release = () => {
    if (dragged === null) return;
    dragged = null;
    choose(view.dates);
  };
  chart?.addEventListener('pointerup', release);
  chart?.addEventListener('pointercancel', release);
  sliders.forEach((slider, index) => {
    slider.addEventListener('input', () => {
      const dates = [...markedDates()];
      dates[index] = data.drivers[index].rows[+slider.value].date;
      view.dates = dates;
      placeMarkers(dates);
    });
    slider.addEventListener('change', () => choose(view.dates));
  });
  show();
}

export async function initPairPage() {
  const index = document.getElementById('headToHeadIndex'); // the head to head of any two (/head-to-head)
  if (index) {
    const options = new URLSearchParams(location.search);
    const [a, b] = ['a', 'b'].map((key) => options.get(key));
    const form = index.querySelector('form');
    if (!a || !b || a === b) return fillPickers(form, [form.elements.a.value, form.elements.b.value], { keepButton: true });
    const list = await driverList();
    const page = list.pages[[a, b].sort().join(':')];
    if (page) return location.replace(page); // the two have a page of their own
    const data = await drawnData(a, b);
    if (!data) return fillPickers(form, [form.elements.a.value, form.elements.b.value]);
    const main = document.getElementById('content');
    main.innerHTML = headToHeadPanels(data);
    document.title = `${data.drivers[0].name} vs ${data.drivers[1].name}: head to head - Car or Driver`;
    fillPickers(main.querySelector('.pair-pick'), [a, b]);
    return runHeadToHead(data);
  }
  const data = JSON.parse(document.getElementById('pairData').textContent);
  fillPickers(
    document.querySelector('#headToHead .pair-pick'),
    data.drivers.map((driver) => driver.id),
  );
  runHeadToHead(data);
}
