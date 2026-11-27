// The page of two drivers: who is better, and who would finish ahead (the head to head). One page for any two drivers: the publishing script
// writes it for the pairs people ask about and for every pair of teammates (tools/driver-and-team-pages.mjs), and the browser draws it for any
// other pair (pair-page.js, at /head-to-head?a=…&b=…), from the same functions and the same data:
//   { path, drivers: [driver, driver], teammates, forecasts }
//   driver:    { id, name, surname, path, first, last, current, best: {rating, date, grandPrix}, average, latest: {rating, date}, races, rows }
//              (best: the peak, counted after 20 Grand Prix starts, or the highest rating of a shorter career; rows: [{date, rating}])
//   teammates: null, or { teams, races, gap, record: {qualifying: [a, b], races: [a, b]}, seasons: [{year, teams, first, second}] }
//   forecasts: head-to-head-forecasts.js
// What matters comes first: the answer (the chance that each finishes ahead, in the same car, at their best), then the figures it rests on.
// The words never name a driver by a pronoun.
import { esc } from './utils.js';
import { ratingChart } from './rating-chart.js';

const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
export const dayOf = (date) => DAY.format(new Date(`${date}T00:00:00Z`));
const shortGrandPrix = (name) => name.replace(/ Grand Prix$/, ' GP');
const rounded = (value) => Math.round(value);
const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value))}`;
const yearSpan = (first, last) => (first === last ? String(first) : `${first}–${last}`);
const listOf = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
export const percent = (p) => (p >= 0.995 ? '>99%' : p < 0.005 ? '<1%' : `${Math.round(100 * p)}%`);
const link = (driver) => `<a href="${driver.path}">${esc(driver.name)}</a>`;
const score = ([won, lost]) => `<b class="${won > lost ? 'ahead' : won < lost ? 'behind' : 'level'}">${won}–${lost}</b>`;

/** The address of the page of two drivers: their own page if they have one (`pages`: "id:id" → path), else the head to head of the two. */
export function pairAddress(pages, firstId, secondId) {
  const key = [String(firstId), String(secondId)].sort().join(':');
  return pages[key] ?? `/head-to-head?a=${encodeURIComponent(firstId)}&b=${encodeURIComponent(secondId)}`;
}

/** The moments the page can take the two drivers at. */
export const MOMENTS = {
  best: 'At their best',
  latest: 'Latest',
  next: 'Next race',
  chosen: 'Chosen dates',
};

/** The forecast shown for a moment and a car (the next race is always in their own cars). */
export const forecastFor = (forecasts, moment, car) => (moment === 'next' ? forecasts.next : forecasts[moment]?.[car]);

/** The sentence that answers the question, for a forecast of the first driver finishing ahead. */
export function answerSentence(data, forecast, moment, car) {
  const [first, second] = data.drivers;
  if (!forecast || forecast.error) return forecast?.error ? esc(forecast.error) : 'No forecast for these two.';
  const [winner, loser, p] = forecast.p >= 0.5 ? [first, second, forecast.p] : [second, first, 1 - forecast.p];
  const how =
    moment === 'next'
      ? `In the next race, in their own cars`
      : `${car === 'same' ? 'In the same car' : 'Each in their own car'}, ${moment === 'best' ? 'each at their best' : moment === 'latest' ? 'each as last rated' : 'at the dates chosen'}`;
  if (Math.abs(forecast.p - 0.5) < 0.01)
    return `${how}, ${esc(first.surname)} and ${esc(second.surname)} would be level: each would finish ahead in half the races.`;
  if (moment === 'next') return `${how}, ${esc(winner.surname)} has a ${percent(p)} chance of finishing ahead of ${esc(loser.surname)}.`;
  return `${how}, ${esc(winner.surname)} would finish ahead of ${esc(loser.surname)} in ${percent(p)} of races.`;
}

/** When and in what each driver is taken, under the figures. */
export function whenLine(data, forecast, moment) {
  if (!forecast || forecast.error) return '';
  const [first, second] = data.drivers;
  if (moment === 'next')
    return `Before the next race · ${forecast.laps} laps${forecast.grid ? ` · from ${forecast.grid[0]} and ${forecast.grid[1]} on the grid` : ''}`;
  const at = (driver, date) => {
    const best = moment === 'best' && driver.best.date === date ? ` (${esc(shortGrandPrix(driver.best.grandPrix))})` : '';
    return `${esc(driver.surname)} on ${dayOf(date)}${best}`;
  };
  return `${at(first, forecast.dates[0])} · ${at(second, forecast.dates[1])} · ${forecast.car ? `both in the ${esc(forecast.car)} of ${forecast.dates[0].slice(0, 4)}` : 'each in their own car'} · ${forecast.laps} laps`;
}

/** How the forecast is built: the chance after each step, the rating gap and the chance of retiring. */
export function detailsHtml(data, forecast) {
  if (!forecast || forecast.error) return '';
  const [first, second] = data.drivers.map((driver) => esc(driver.surname));
  const steps = [
    ['From the ratings', forecast.steps.ratings, 'The overall strength of each, driver and car, as the ratings give it.'],
    [
      'With their uncertainty',
      forecast.steps.calibrated,
      'The ratings are estimates: their uncertainty, and how ratings have turned into results in the past.',
    ],
    ...(Number.isFinite(forecast.steps.grid)
      ? [['With the starting grid', forecast.steps.grid, 'The two places on the grid, as earlier races weigh them.']]
      : []),
    ['With retirements', forecast.steps.full, `The chance of each retiring over ${forecast.laps} laps. This is the forecast.`],
  ];
  return `<ol class="head-to-head-steps">${steps
    .map(
      ([label, p, note]) =>
        `<li><span class="step-label">${label}<small>${note}</small></span><span class="head-to-head-split small" aria-hidden="true"><i style="flex:${p}"></i><i style="flex:${1 - p}"></i></span><b>${percent(p)}</b></li>`,
    )
    .join('')}</ol>
    <p class="head-to-head-facts">The chance is ${first}’s of finishing ahead of ${second}. Rating gap: ${signed(forecast.gap)} ± ${rounded(forecast.sd)} points, ${first} minus ${second}${forecast.car ? ', the car the same' : ', cars included'}. Chance of retiring over ${forecast.laps} laps: ${first} ${percent(forecast.risk[0])}, ${second} ${percent(forecast.risk[1])}.</p>`;
}

/** The first panel: the two names, the choice of two other drivers, the answer and the ways to change the moment and the car. */
function headPanel(data, moment, car) {
  const [first, second] = data.drivers;
  const forecast = forecastFor(data.forecasts, moment, car);
  const p = forecast && !forecast.error ? forecast.p : 0.5;
  const option = (driver) => `<option value="${esc(driver.id)}" selected>${esc(driver.name)}</option>`;
  const button = (attribute, value, label, pressed, hidden = false) =>
    `<button type="button" ${attribute}="${value}" aria-pressed="${pressed}"${hidden ? ' hidden' : ''}>${label}</button>`;
  return `      <section class="document-panel profile head-to-head" id="headToHead">
        <h1 class="profile-name"><span class="profile-subject">F1 head to head</span><span class="profile-surname">${esc(first.surname)} <span class="profile-versus">vs</span> ${esc(second.surname)}</span></h1>
        <form class="pair-pick" action="/head-to-head" method="get">
          <label><span class="sr-only">First driver</span><select name="a">${option(first)}</select></label>
          <span class="pair-pick-versus" aria-hidden="true">vs</span>
          <label><span class="sr-only">Second driver</span><select name="b">${option(second)}</select></label>
          <button type="submit" class="document-button">Compare</button>
        </form>
        <p class="head-to-head-answer" data-answer aria-live="polite">${answerSentence(data, forecast, moment, car)}</p>
        <div class="head-to-head-result">
          <div class="head-to-head-sides"><span class="side-first"><b data-chance="0">${percent(p)}</b>${esc(first.name)}</span><span class="side-second"><b data-chance="1">${percent(1 - p)}</b>${esc(second.name)}</span></div>
          <div class="head-to-head-split" data-split aria-hidden="true"><i style="flex:${p}"></i><i style="flex:${1 - p}"></i></div>
          <p class="head-to-head-when" data-when>${whenLine(data, forecast, moment)}</p>
        </div>
        <div class="head-to-head-choices">
          <div class="head-to-head-modes" role="group" aria-label="When">${['best', 'latest', 'next', 'chosen']
            .map((name) =>
              button('data-moment', name, MOMENTS[name], name === moment, (name === 'next' && !data.forecasts.next) || name === 'chosen'),
            )
            .join('')}</div>
          <div class="head-to-head-modes" role="group" aria-label="Car">${button('data-car', 'same', 'Same car', car === 'same')}${button('data-car', 'own', 'Own cars', car === 'own')}</div>
        </div>
        <details class="head-to-head-conditions"${data.forecasts.next ? '' : ' hidden'}>
          <summary>Race conditions</summary>
          <div class="head-to-head-condition-fields">
            <label>Laps <input type="number" name="laps" min="1" max="100" step="1" value="${data.forecasts.next?.laps ?? 60}" inputmode="numeric" /></label>
            <label>${esc(first.surname)} on the grid <input type="number" name="gridA" min="1" max="30" step="1" inputmode="numeric" placeholder="—" /></label>
            <label>${esc(second.surname)} on the grid <input type="number" name="gridB" min="1" max="30" step="1" inputmode="numeric" placeholder="—" /></label>
          </div>
          <p class="panel-note">For the next race. The grid counts when both places are given; it does not change the ratings.</p>
        </details>
        <details class="head-to-head-details">
          <summary>How the forecast is built</summary>
          <div data-details>${detailsHtml(data, forecast)}</div>
        </details>
      </section>`;
}

const panel = (title, body, note = '') =>
  `      <section class="document-panel"><h2 class="panel-title">${title}</h2>${note ? `<p class="panel-note">${note}</p>` : ''}${body}</section>`;

/** The figures the answer rests on: the best rating of each, then the rest side by side. */
function sideBySidePanel(data) {
  const [first, second] = data.drivers;
  const figure = (driver, tone) =>
    `<div class="profile-figure figure-${tone}"><span class="figure-label">${esc(driver.surname)}’s best</span><span class="figure-value">${rounded(driver.best.rating)}</span><span class="figure-note">${dayOf(driver.best.date)} · ${esc(shortGrandPrix(driver.best.grandPrix))}</span></div>`;
  const row = (label, x, y) =>
    `<tr><th scope="row">${label}</th><td class="number rating">${x}</td><td class="number rating">${y}</td></tr>`;
  const both = first.current && second.current;
  return panel(
    'Who is better',
    `<div class="profile-figures">${figure(first, 'first')}${figure(second, 'second')}</div>
      <table class="document-table"><thead><tr><th scope="col"></th><th scope="col" class="number">${esc(first.surname)}</th><th scope="col" class="number">${esc(second.surname)}</th></tr></thead><tbody>${[
        row('Career average', rounded(first.average), rounded(second.average)),
        row(both ? 'Current rating' : 'Current or final rating', rounded(first.latest.rating), rounded(second.latest.rating)),
        row('Grands Prix rated', first.races, second.races),
        row('Seasons', yearSpan(first.first, first.last), yearSpan(second.first, second.last)),
      ].join('')}</tbody></table>`,
    'The best rating counts after 20 Grand Prix starts (the highest rating, for a shorter career). Each rating measures a driver against the leading field of the day, with the car taken out, so drivers of different years share one scale; comparing eras is still a thought experiment.',
  );
}

/** Two teammates: who beat whom in the same car, and season by season. */
function teammatesPanel(data) {
  const together = data.teammates;
  if (!together) return '';
  const [first, second] = data.drivers;
  const [a, b] = [esc(first.surname), esc(second.surname)];
  const leader = Math.abs(together.gap) < 0.5 ? null : together.gap > 0 ? a : b;
  const figure = (label, value, note) =>
    `<div class="profile-figure"><span class="figure-label">${label}</span><span class="figure-value">${value}</span><span class="figure-note">${note}</span></div>`;
  return panel(
    `Teammates at ${esc(listOf(together.teams))}`,
    `<div class="profile-figures compact">${figure('Qualifying', score(together.record.qualifying), `${a}–${b}: qualified ahead`)}${figure('Races', score(together.record.races), `${a}–${b}: finished ahead, in ${together.races} races together`)}${figure('Average gap', signed(Math.abs(together.gap)), leader ? `In favour of ${leader}` : 'Level')}</div>
      <table class="document-table"><thead><tr><th scope="col">Season</th><th scope="col">Team</th><th scope="col" class="number">${a}</th><th scope="col" class="number">${b}</th><th scope="col" class="number">Gap</th></tr></thead><tbody>${together.seasons
        .map(
          (season) =>
            `<tr><th scope="row">${season.year}</th><td>${esc(listOf(season.teams))}</td><td class="number rating">${rounded(season.first)}</td><td class="number rating">${rounded(season.second)}</td><td class="number">${signed(season.first - season.second)}</td></tr>`,
        )
        .join('')}</tbody></table>`,
    'Teammates share the car, so beating a teammate is the cleanest measure of a driver. The ratings are the averages over each season; the gap is the first named minus the second.',
  );
}

/** The two careers, with a marker at the moment each is taken: dragging a marker (or its slider) takes the driver at another date. */
function chartPanel(data, forecast) {
  const [first, second] = data.drivers;
  const markerAt = (driver, date) => driver.rows.findLast((row) => row.date <= date) ?? driver.rows[0];
  const markers = forecast?.dates ? [markerAt(first, forecast.dates[0]), markerAt(second, forecast.dates[1])] : [];
  const slider = (driver, index) =>
    `<label class="career-slider career-slider-${index + 1}"><span>${esc(driver.surname)}</span><input type="range" min="0" max="${driver.rows.length - 1}" step="1" value="${Math.max(0, driver.rows.indexOf(markers[index]))}" data-slider="${index}" aria-label="The moment of ${esc(driver.name)}’s career" /></label>`;
  return `      <section class="document-panel head-to-head-careers"><h2 class="panel-title">Race by race</h2><p class="panel-note">The two driver ratings after each Grand Prix. Drag a marker, or a slider, to compare the two at any moment of their careers.</p>
        <div data-chart>${ratingChart(
          [
            { label: first.name, rows: first.rows },
            { label: second.name, rows: second.rows },
          ],
          `The driver ratings of ${first.name} and ${second.name} after each Grand Prix`,
          'pair',
          markers,
        )}</div>
        <div class="career-sliders">${slider(first, 0)}${slider(second, 1)}</div>
      </section>`;
}

/** The links on from the page. */
function morePanel(data) {
  const [first, second] = data.drivers;
  const history = `/history?v=1&amp;h=driver&amp;drivers=${first.id}%2C${second.id}&amp;from=${Math.min(first.first, second.first)}&amp;to=${Math.max(first.last, second.last)}`;
  return panel(
    'More',
    `<p>Each career on its own: ${link(first)} and ${link(second)}. The two with other drivers: <a href="${history}">compare in history</a>. Other pairs: <a href="/head-to-head">head to head</a> and <a href="/teammates">teammates compared</a>.</p>`,
  );
}

/** Every panel of the page of two drivers, as first shown: at their best, in the same car. */
export function headToHeadPanels(data, moment = 'best', car = 'same') {
  const forecast = forecastFor(data.forecasts, moment, car);
  return [headPanel(data, moment, car), sideBySidePanel(data), teammatesPanel(data), chartPanel(data, forecast), morePanel(data)]
    .filter(Boolean)
    .join('\n');
}

/** The data of the page, for its script (a script element the browser does not run). */
export const pageData = (data) => `<script type="application/json" id="pairData">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
