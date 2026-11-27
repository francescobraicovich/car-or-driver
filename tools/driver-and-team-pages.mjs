// The pages of the drivers, the teams and the pairs of teammates, written by the publishing script (tools/build-pages.mjs) from the same displayed
// ratings as Ratings and History: the retrospective ratings with their yearly uncertainty, on the 20-weekend display reference
// (site/js/model-loader.js). A driver's peak counts only after 20 Grand Prix starts, as in the Insights (packages/research/python/compute-findings.py).
// Every number comes from the data, so the pages change with each Grand Prix; the words never name a driver by a pronoun.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { csv } from '../packages/core/src/csv.js';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { centredRatings } from '../site/js/rating-reference.js';
import { withAnnualUncertainty } from '../site/js/retrospective-uncertainty.js';
import { pageTitle } from '../site/js/page-metadata.js';
import { INSIGHT_PAGES } from '../site/js/insight-page-metadata.js';
import { comparisonPath, seasonPath, TEAMMATE_PAGE_MINIMUM_RACES, teammatePath } from '../site/js/page-addresses.js';
import { comparedPairs } from '../site/js/question-pool.js';
import { INSIGHTS_DATA } from '../site/js/insights-data.js';
import { addressName, breadcrumbData, documentPage, escapeHtml, headTags } from './page-template.mjs';

export const DRIVER_PEAK_MINIMUM_STARTS = 20; // as DRIVER_PEAK_MINIMUM_STARTS in compute-findings.py
const NOT_STARTED = ['Did not start', 'Did not qualify', 'Did not prequalify', 'Withdrew']; // as NOT_STARTED in compute-findings.py

const rounded = (value) => Math.round(value);
const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value))}`;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const yearSpan = (first, last) => (first === last ? String(first) : `${first}–${last}`);
const listOf = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** Each driver's Grand Prix start dates, in order, from the results tables (a start: any result but did not start, qualify or prequalify, or withdrew). */
async function startDates(root) {
  const table = async (name) => csv(await readFile(join(root, 'data', name), 'utf8'));
  const [results, races, statuses] = await Promise.all([table('results.csv'), table('races.csv'), table('status.csv')]);
  const dateOf = new Map(races.map((race) => [race.raceId, race.date]));
  const notStarted = new Set(statuses.filter((status) => NOT_STARTED.includes(status.status)).map((status) => status.statusId));
  const dates = new Map();
  for (const result of results) {
    if (notStarted.has(result.statusId)) continue;
    if (!dates.has(result.driverId)) dates.set(result.driverId, []);
    dates.get(result.driverId).push(dateOf.get(result.raceId));
  }
  for (const list of dates.values()) list.sort();
  return dates;
}

/**
 * How often each of two teammates beat the other, over all their weekends together, as the Graph counts it (site/js/graph-view.js): in qualifying,
 * who qualified ahead; in the race, who finished ahead (or, when that cannot be compared, who was faster on matched laps). From the weekly duels in
 * data/teammate-graph.json, keyed by the two ids in order: `${low}:${high}` → { [id]: { qualifying, races } }.
 */
async function duelRecords(root) {
  const graph = JSON.parse(await readFile(join(root, 'data/teammate-graph.json'), 'utf8'));
  const records = new Map();
  for (const snapshot of graph.snapshots)
    for (const [first, second, qualifying, race] of snapshot.duels) {
      const [low, high] = [String(first), String(second)].sort();
      const sign = String(first) === low ? 1 : -1; // (a duel is told from the first driver's side)
      const key = `${low}:${high}`;
      if (!records.has(key)) records.set(key, { [low]: { qualifying: 0, races: 0 }, [high]: { qualifying: 0, races: 0 } });
      const record = records.get(key);
      if (qualifying) record[qualifying * sign > 0 ? low : high].qualifying++;
      if (race) record[race * sign > 0 ? low : high].races++;
    }
  return records;
}

/** How many of `dates` (sorted) are on or before `date`. */
function countUpTo(dates, date) {
  let low = 0;
  let high = dates.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (dates[middle] <= date) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The displayed ratings of every driver and car at every weekend, as the site shows them, and what the pages say about each.
 * @param {string} root the repository
 */
export async function readRatings(root) {
  const read = async (name) => deserialize(await readFile(join(root, 'data', name), 'utf8'));
  const [retrospective, reference, filtered] = await Promise.all([
    read('retrospective.json'),
    read('rating-reference.json'),
    read('model.json'),
  ]);
  const display = centredRatings(withAnnualUncertainty(retrospective.model), reference, retrospective.refitHash);
  const people = new Map(csv(await readFile(join(root, 'data/drivers.csv'), 'utf8')).map((person) => [person.driverId, person]));
  const starts = await startDates(root);

  const drivers = new Map();
  const teams = new Map();
  const pairs = new Map();
  for (const snapshot of display.snaps) {
    const weekend = { raceId: String(snapshot.raceId), date: snapshot.date, year: snapshot.year, grandPrix: snapshot.name };
    const carNames = new Map(snapshot.cars.map((car) => [String(car.constructorId), car.name]));
    for (const car of snapshot.cars) {
      const id = String(car.constructorId);
      if (!teams.has(id)) teams.set(id, { id, name: car.name, rows: [], drivers: new Map() });
      teams.get(id).rows.push({ ...weekend, rating: car.overall, sd: car.overallSd });
    }
    const byTeam = new Map();
    for (const row of snapshot.drivers) {
      const id = String(row.driverId);
      const teamId = String(row.constructorId);
      if (!drivers.has(id)) {
        const person = people.get(id);
        drivers.set(id, {
          id,
          name: row.name,
          forename: person?.forename || row.name.split(' ').slice(0, -1).join(' '),
          surname: person?.surname || row.name.split(' ').at(-1),
          nationality: person?.nationality,
          rows: [],
        });
      }
      const rated = { ...weekend, teamId, team: carNames.get(teamId) ?? row.car, rating: row.overall, sd: row.overallSd };
      rated.starts = countUpTo(starts.get(id) ?? [], weekend.date);
      drivers.get(id).rows.push(rated);
      teams.get(teamId)?.drivers.set(id, row.name);
      if (!byTeam.has(teamId)) byTeam.set(teamId, []);
      byTeam.get(teamId).push({ id, rating: row.overall });
    }
    for (const [teamId, mates] of byTeam)
      for (let i = 0; i < mates.length; i++)
        for (let j = i + 1; j < mates.length; j++) {
          const [a, b] = [mates[i], mates[j]].sort((x, y) => (x.id < y.id ? -1 : 1));
          const key = `${a.id}:${b.id}`;
          if (!pairs.has(key)) pairs.set(key, { a: a.id, b: b.id, races: [] });
          pairs.get(key).races.push({ ...weekend, teamId, team: carNames.get(teamId), a: a.rating, b: b.rating });
        }
  }

  // addresses, unique (a name shared by two people would take the id of the second)
  const assign = (entities, prefix) => {
    const taken = new Set();
    for (const entity of entities) {
      let name = addressName(entity.name);
      if (taken.has(name)) name = `${name}-${entity.id}`;
      taken.add(name);
      entity.path = `${prefix}/${name}`;
    }
  };
  assign(drivers.values(), '/drivers');
  assign(teams.values(), '/teams');
  const records = await duelRecords(root);
  for (const pair of pairs.values()) {
    pair.record = records.get(`${pair.a}:${pair.b}`) ?? { [pair.a]: { qualifying: 0, races: 0 }, [pair.b]: { qualifying: 0, races: 0 } };
    pair.drivers = [drivers.get(pair.a), drivers.get(pair.b)].sort((x, y) => (x.path < y.path ? -1 : 1));
    pair.flip = pair.drivers[0].id !== pair.a; // the ratings of the first named are `b`
    pair.path = teammatePath(pair.drivers[0].path, pair.drivers[1].path);
  }

  for (const driver of drivers.values()) {
    const peakRows = driver.rows.filter((row) => row.starts >= DRIVER_PEAK_MINIMUM_STARTS);
    driver.peak = peakRows.length ? best(peakRows, (x, y) => y.rating - x.rating) : null;
    driver.lowest = best(driver.rows, (x, y) => x.rating - y.rating);
    driver.latest = driver.rows.at(-1);
    driver.first = driver.rows[0].year;
    driver.last = driver.latest.year;
  }
  for (const team of teams.values()) {
    team.peak = best(team.rows, (x, y) => y.rating - x.rating);
    team.lowest = best(team.rows, (x, y) => x.rating - y.rating);
    team.latest = team.rows.at(-1);
    team.first = team.rows[0].year;
    team.last = team.latest.year;
  }
  const latest = display.snaps.at(-1);
  // the pairs of drivers compared on a page of their own: the duels the questions of the front page may ask about (question-pool.js)
  const comparisons = comparedPairs(display, filtered.driverProfiles, INSIGHTS_DATA.champions).map(({ ids, path }) => {
    const pair = ids.map((id) => drivers.get(id)).sort((x, y) => (x.path < y.path ? -1 : 1));
    if (comparisonPath(pair[0].path, pair[1].path) !== path) throw Error(`the front page and the build give ${path} different addresses`);
    return { path, drivers: pair };
  });
  // each finished season: the ratings after its last Grand Prix, and the average over it
  const seasons = [];
  for (const year of new Set(display.snaps.map((snapshot) => snapshot.year))) {
    if (year >= latest.year) continue;
    const last = display.snaps.findLast((snapshot) => snapshot.year === year);
    const average = (rows) => mean(rows.filter((row) => row.year === year).map((row) => row.rating));
    seasons.push({
      year,
      path: seasonPath(year),
      last: { raceId: String(last.raceId), grandPrix: last.name, date: last.date },
      drivers: [...last.drivers]
        .sort((x, y) => y.overall - x.overall)
        .map((row) => {
          const driver = drivers.get(String(row.driverId));
          return { driver, team: teams.get(String(row.constructorId)), rating: row.overall, average: average(driver.rows) };
        }),
      cars: [...last.cars]
        .sort((x, y) => y.overall - x.overall)
        .map((row) => {
          const team = teams.get(String(row.constructorId));
          return { team, rating: row.overall, average: average(team.rows) };
        }),
    });
  }
  return {
    drivers,
    teams,
    pairs,
    comparisons,
    seasons,
    lastRace: filtered.lastRace,
    firstDate: display.snaps[0].date,
    current: {
      weekend: { year: latest.year, grandPrix: latest.name, date: latest.date },
      drivers: [...latest.drivers]
        .sort((x, y) => y.overall - x.overall)
        .map((row) => ({
          driver: drivers.get(String(row.driverId)),
          rating: row.overall,
          sd: row.overallSd,
          team: teams.get(String(row.constructorId)),
        })),
      cars: [...latest.cars]
        .sort((x, y) => y.overall - x.overall)
        .map((row) => ({ team: teams.get(String(row.constructorId)), rating: row.overall, sd: row.overallSd })),
    },
  };
}

/** The first row by `order`; on a tie, the earliest weekend. */
function best(rows, order) {
  return rows.reduce((found, row) => (order(row, found) < 0 ? row : found));
}

// ── the chart of a rating over time, drawn at build time (no script: it is part of the page) ─────────────────

const CHART = { width: 760, height: 260, left: 46, right: 14, top: 14, bottom: 28 };
const GAP_DAYS = 300; // a break in the line where a driver or car missed more than this (a season; the delayed start of 2020 was 217 days)

/**
 * An SVG chart of one or two ratings over time, with the level of the leading field (1000).
 * @param {{label: string, rows: {date: string, rating: number}[]}[]} series
 * @param {string} title  what the chart shows, for screen readers
 * @param {'driver'|'car'|'pair'} kind  whose: a driver's line is blue, a car's red, and of two teammates the first red and the second blue
 */
export function ratingChart(series, title, kind) {
  const all = series.flatMap((entry) => entry.rows);
  const time = (date) => Date.parse(date);
  const [start, end] = [Math.min(...all.map((row) => time(row.date))), Math.max(...all.map((row) => time(row.date)))];
  const low = Math.floor(Math.min(1000, ...all.map((row) => row.rating)) / 25) * 25;
  const high = Math.ceil(Math.max(1000, ...all.map((row) => row.rating)) / 25) * 25;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const x = (date) => (CHART.left + (end === start ? plotWidth / 2 : ((time(date) - start) / (end - start)) * plotWidth)).toFixed(1);
  const y = (value) => (CHART.top + ((high - value) / (high - low)) * plotHeight).toFixed(1);
  const runs = (rows) => {
    const parts = [[]];
    rows.forEach((row, index) => {
      if (index && time(row.date) - time(rows[index - 1].date) > GAP_DAYS * 864e5) parts.push([]);
      parts.at(-1).push(row);
    });
    return parts;
  };
  const step = high - low > 300 ? 100 : high - low > 120 ? 50 : 25;
  const ticks = [];
  for (let value = low; value <= high; value += step) ticks.push(value);
  const [firstYear, lastYear] = [new Date(start).getUTCFullYear(), new Date(end).getUTCFullYear()];
  const yearStep = Math.max(1, Math.ceil((lastYear - firstYear + 1) / 8));
  const years = [];
  for (let year = firstYear; year <= lastYear; year += yearStep) years.push(year);
  const yearX = (year) => x(new Date(Math.max(start, Math.min(end, time(`${year}-01-01`)))).toISOString().slice(0, 10));
  const drawn = series
    .map((entry, index) =>
      runs(entry.rows)
        .map((run) =>
          run.length === 1
            ? `<circle class="chart-point chart-series-${index + 1}" cx="${x(run[0].date)}" cy="${y(run[0].rating)}" r="3" />`
            : `<polyline class="chart-line chart-series-${index + 1}" points="${run.map((row) => `${x(row.date)},${y(row.rating)}`).join(' ')}" />`,
        )
        .join(''),
    )
    .join('');
  const legend =
    series.length > 1
      ? `<p class="chart-legend">${series.map((entry, index) => `<span class="chart-key chart-series-${index + 1}">${escapeHtml(entry.label)}</span>`).join('')}</p>`
      : '';
  return `<figure class="rating-chart rating-chart-${kind}">
  <svg viewBox="0 0 ${CHART.width} ${CHART.height}" role="img" aria-label="${escapeHtml(title)}" preserveAspectRatio="xMidYMid meet">
    ${ticks.map((value) => `<line class="chart-grid${value === 1000 ? ' chart-field' : ''}" x1="${CHART.left}" x2="${CHART.width - CHART.right}" y1="${y(value)}" y2="${y(value)}" /><text class="chart-tick" x="${CHART.left - 8}" y="${y(value)}" text-anchor="end" dominant-baseline="middle">${value}</text>`).join('')}
    ${years.map((year) => `<text class="chart-tick" x="${yearX(year)}" y="${CHART.height - 8}" text-anchor="middle">${year}</text>`).join('')}
    ${drawn}
  </svg>
  ${legend}<figcaption>1000, the dashed line, is the level of the leading field.</figcaption>
</figure>`;
}

// ── the parts of a page ─────────────────────────────────────────────────

const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const dayOf = (row) => DAY.format(new Date(`${row.date}T00:00:00Z`));
const shortGrandPrix = (name) => name.replace(/ Grand Prix$/, ' GP');
const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const link = (entity) => `<a href="${entity.path}">${escapeHtml(entity.name)}</a>`;
/** A year, linked to the page of its season when the season is over. */
const seasonLink = (ratings, year) => {
  const season = ratings.seasons.find((candidate) => candidate.year === year);
  return season ? `<a href="${season.path}">${year}</a>` : `${year}`;
};
const insightPath = (id) => `/insights/${INSIGHT_PAGES[id].slug}`;

/** The name of a page as the site writes names: what it is, a small first line and a large second (the card of a row in the ratings). */
const nameHeading = (subject, first, second) =>
  `<h1 class="profile-name"><span class="profile-subject">${subject}</span>${first ? `<span class="profile-first">${escapeHtml(first)}</span>` : ''}<span class="profile-surname">${second}</span></h1>`;

/** The two figures of a profile: where the driver or car is now, and the peak in red, with its date. */
const figures = (items) =>
  `<div class="profile-figures">${items.map(({ label, value, note, peak, tone }) => `<div class="profile-figure${peak ? ' figure-peak' : ''}${tone ? ` figure-${tone}` : ''}"><span class="figure-label">${label}</span><span class="figure-value">${value}</span><span class="figure-note">${note}</span></div>`).join('')}</div>`;

const buttons = (items) =>
  `<div class="profile-actions">${items.map(([label, href], index) => `<a class="document-button${index === 0 ? ' primary' : ''}" href="${href}">${label}</a>`).join('')}</div>`;

const panel = (title, body, note = '') =>
  `      <section class="document-panel"><h2 class="panel-title">${title}</h2>${note ? `<p class="panel-note">${note}</p>` : ''}${body}</section>`;

/** The current ratings of the drivers or of the cars, as a table (the Ratings page and the lists of drivers and teams show it). */
export function currentTable(ratings, kind) {
  const rows =
    kind === 'drivers'
      ? ratings.current.drivers.map(
          (row, index) =>
            `<tr><td class="number">${index + 1}</td><th scope="row">${link(row.driver)}</th><td>${row.team ? link(row.team) : ''}</td><td class="number rating">${rounded(row.rating)}</td></tr>`,
        )
      : ratings.current.cars.map(
          (row, index) =>
            `<tr><td class="number">${index + 1}</td><th scope="row">${link(row.team)}</th><td class="number rating">${rounded(row.rating)}</td></tr>`,
        );
  const head =
    kind === 'drivers'
      ? '<th scope="col">#</th><th scope="col">Driver</th><th scope="col">Car</th><th scope="col" class="number">Rating</th>'
      : '<th scope="col">#</th><th scope="col">Car</th><th scope="col" class="number">Rating</th>';
  return `<table class="document-table"><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

const page = ({ base, path, title, description, trail, content, data = [], type }) => ({
  path,
  html: documentPage({
    head: headTags({ base, path, title, description, type, data: [breadcrumbData(base, trail), ...data] }),
    trail,
    content,
  }),
});

function teammatesOf(ratings, driver) {
  return [...ratings.pairs.values()]
    .filter((pair) => pair.a === driver.id || pair.b === driver.id)
    .map((pair) => {
      const own = pair.a === driver.id ? 'a' : 'b';
      const other = ratings.drivers.get(own === 'a' ? pair.b : pair.a);
      return {
        pair,
        other,
        qualifying: [pair.record[driver.id].qualifying, pair.record[other.id].qualifying],
        races: [pair.record[driver.id].races, pair.record[other.id].races],
        teams: [...new Set(pair.races.map((race) => race.team))],
        years: yearSpan(pair.races[0].year, pair.races.at(-1).year),
        gap: mean(pair.races.map((race) => race[own] - race[own === 'a' ? 'b' : 'a'])),
        last: pair.races.at(-1).date,
      };
    })
    .sort((x, y) => (x.last < y.last ? 1 : x.last > y.last ? -1 : 0));
}

const GAP_SCALE = 60; // rating points that fill half of a gap bar

/** Wins against a teammate, as "12–3", green when ahead and pink when behind. */
const score = ([won, lost]) => `<b class="${won > lost ? 'ahead' : won < lost ? 'behind' : 'level'}">${won}–${lost}</b>`;
/** A driver's qualifying and race record against a teammate, for a line of the list. */
const recordLine = (qualifying, races) => `<span class="versus-record">Qualifying ${score(qualifying)} · Races ${score(races)}</span>`;

/** A list of teammates (or of the drivers of a car): who, where and when, and the gap as a bar either side of level. */
const versusList = (rows) =>
  `<ol class="versus-list">${rows
    .map(({ name, meta, gap, compare, record }) => {
      const side = gap > 0.5 ? 'ahead' : gap < -0.5 ? 'behind' : 'level';
      return `<li class="versus-row"><span class="versus-who">${name}<span class="versus-meta">${meta}</span>${record ?? ''}</span><span class="versus-bar" aria-hidden="true"><i class="${side}" style="width:${((Math.min(Math.abs(gap), GAP_SCALE) / GAP_SCALE) * 50).toFixed(1)}%"></i></span><span class="versus-gap ${side}">${signed(gap)}</span>${compare ? `<a class="versus-link" href="${compare}">Compare</a>` : '<span></span>'}</li>`;
    })
    .join('')}</ol>`;

// ── the pages ───────────────────────────────────────────────────────────

function driverPage(ratings, driver, base) {
  const seasons = new Map();
  for (const row of driver.rows) {
    if (!seasons.has(row.year)) seasons.set(row.year, []);
    seasons.get(row.year).push(row);
  }
  const mates = teammatesOf(ratings, driver);
  const rank = ratings.current.drivers.findIndex((row) => row.driver === driver);
  const team = ratings.teams.get(driver.latest.teamId);
  const surname = escapeHtml(driver.surname);
  const latestMate = mates[0]?.other;
  const total = (kind) => mates.reduce(([won, lost], mate) => [won + mate[kind][0], lost + mate[kind][1]], [0, 0]);
  const compared = ratings.comparisons.filter((comparison) => comparison.drivers.includes(driver));
  const historyHref = `/history?v=1&amp;h=driver&amp;drivers=${[driver.id, latestMate?.id].filter(Boolean).join('%2C')}&amp;from=${driver.first}&amp;to=${driver.last}`;
  const content = [
    `      <section class="document-panel profile">
        ${nameHeading('F1 driver rating', driver.forename, surname)}
        <p class="profile-meta">${link(team)} · ${yearSpan(driver.first, driver.last)} · the driver, with the car taken out</p>
        ${figures([
          rank >= 0
            ? {
                label: 'Current rating',
                value: rounded(driver.latest.rating),
                note: `${ordinal(rank + 1)} of ${ratings.current.drivers.length} on the grid`,
              }
            : { label: 'Final rating', value: rounded(driver.latest.rating), note: `Last raced in ${driver.last}` },
          driver.peak
            ? {
                label: 'Peak rating',
                value: rounded(driver.peak.rating),
                note: `${dayOf(driver.peak)} · ${escapeHtml(shortGrandPrix(driver.peak.grandPrix))}`,
                peak: true,
              }
            : { label: 'Peak rating', value: '—', note: `Counted after ${DRIVER_PEAK_MINIMUM_STARTS} Grand Prix starts`, peak: true },
        ])}
        ${buttons([
          [
            latestMate ? `Head to head with ${escapeHtml(latestMate.surname)}` : 'Head to head',
            `/head-to-head?a=${driver.id}${latestMate ? `&amp;b=${latestMate.id}` : ''}`,
          ],
          ['Compare in history', historyHref],
        ])}
      </section>`,
    mates.length
      ? panel(
          `${surname} against every teammate`,
          `${figures([
            { label: 'Qualifying against teammates', value: score(total('qualifying')), note: 'Qualified ahead – behind' },
            { label: 'Races against teammates', value: score(total('races')), note: 'Finished ahead – behind' },
          ]).replace('profile-figures', 'profile-figures compact')}${versusList(
            mates.map((mate) => ({
              name: link(mate.other),
              meta: `${escapeHtml(listOf(mate.teams))} · ${mate.years} · ${mate.pair.races.length} ${mate.pair.races.length === 1 ? 'race' : 'races'}`,
              record: recordLine(mate.qualifying, mate.races),
              gap: mate.gap,
              compare: mate.pair.races.length >= TEAMMATE_PAGE_MINIMUM_RACES ? mate.pair.path : null,
            })),
          )}`,
          `Teammates share the car, so beating a teammate is the cleanest measure of a driver. Qualifying counts who qualified ahead; races, who finished ahead (or, when that cannot be compared, who was faster on matched laps). The bar is ${surname}’s average rating minus the teammate’s, in their races together.`,
        )
      : '',
    compared.length
      ? panel(
          `${surname} compared with other drivers`,
          `<ul class="driver-list">${compared.map((comparison) => `<li><a href="${comparison.path}">${escapeHtml(comparison.drivers[0].name)} vs ${escapeHtml(comparison.drivers[1].name)}</a></li>`).join('')}</ul>`,
        )
      : '',
    panel(
      `${surname}’s rating, race by race`,
      `${ratingChart([{ label: driver.name, rows: driver.rows }], `${driver.name}'s driver rating after each Grand Prix`, 'driver')}${buttons([['Compare in history', historyHref]])}`,
    ),
    panel(
      'Season by season',
      `<table class="document-table"><thead><tr><th scope="col">Season</th><th scope="col">Team</th><th scope="col" class="number">Rating</th></tr></thead><tbody>${[
        ...seasons,
      ]
        .reverse()
        .map(
          ([year, rows]) =>
            `<tr><th scope="row">${seasonLink(ratings, year)}</th><td>${listOf([...new Set(rows.map((row) => row.teamId))].map((id) => link(ratings.teams.get(id))))}</td><td class="number rating">${rounded(mean(rows.map((row) => row.rating)))}</td></tr>`,
        )
        .join('')}</tbody></table>`,
      'The average rating over the season.',
    ),
  ].join('\n');
  return page({
    base,
    path: driver.path,
    title: pageTitle(`${driver.name} F1 driver rating`),
    description: `How good is ${driver.name} with the car taken out? ${driver.name}'s Formula 1 driver rating ${yearSpan(driver.first, driver.last)}, the peak, and the gap to every teammate.`,
    trail: [
      ['Drivers', '/drivers'],
      [driver.name, driver.path],
    ],
    content,
    type: 'profile',
    data: [
      {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: pageTitle(`${driver.name} F1 driver rating`),
        url: new URL(driver.path, base).href,
        mainEntity: { '@type': 'Person', name: driver.name, ...(driver.nationality ? { nationality: driver.nationality } : {}) },
      },
    ],
  });
}

function teamPage(ratings, team, base) {
  const seasons = new Map();
  for (const row of team.rows) {
    if (!seasons.has(row.year)) seasons.set(row.year, []);
    seasons.get(row.year).push(row);
  }
  const drivers = new Map(); // the drivers of the car, with their seasons in it
  for (const driver of ratings.drivers.values())
    for (const row of driver.rows)
      if (row.teamId === team.id) {
        if (!drivers.has(driver)) drivers.set(driver, []);
        drivers.get(driver).push(row);
      }
  const rank = ratings.current.cars.findIndex((row) => row.team === team);
  const name = escapeHtml(team.name);
  const driverRows = [...drivers]
    .sort(([, x], [, y]) => (x.at(-1).date < y.at(-1).date ? 1 : -1))
    .map(([driver, rows]) => `<li>${link(driver)} <span class="versus-meta">${yearSpan(rows[0].year, rows.at(-1).year)}</span></li>`)
    .join('');
  const content = [
    `      <section class="document-panel profile">
        ${nameHeading('F1 car rating', '', name)}
        <p class="profile-meta">${yearSpan(team.first, team.last)} · the car, with the drivers taken out</p>
        ${figures([
          rank >= 0
            ? {
                label: 'Current rating',
                value: rounded(team.latest.rating),
                note: `${ordinal(rank + 1)} of ${ratings.current.cars.length} cars`,
              }
            : { label: 'Final rating', value: rounded(team.latest.rating), note: `Last raced in ${team.last}` },
          {
            label: 'Peak rating',
            value: rounded(team.peak.rating),
            note: `${dayOf(team.peak)} · ${escapeHtml(shortGrandPrix(team.peak.grandPrix))}`,
            peak: true,
          },
        ])}
        ${buttons([
          ['Compare in history', `/history?v=1&amp;h=car&amp;cars=${team.id}&amp;from=${team.first}&amp;to=${team.last}`],
          ['Every team', '/teams'],
        ])}
      </section>`,
    panel(`Who drove the ${name}`, `<ul class="driver-list">${driverRows}</ul>`, 'Most recent first.'),
    panel(
      `The ${name} car, race by race`,
      ratingChart([{ label: team.name, rows: team.rows }], `The ${team.name} car rating after each Grand Prix`, 'car'),
    ),
    panel(
      'Season by season',
      `<table class="document-table"><thead><tr><th scope="col">Season</th><th scope="col" class="number">Car rating</th><th scope="col">Drivers</th></tr></thead><tbody>${[
        ...seasons,
      ]
        .reverse()
        .map(([year, rows]) => {
          const raced = [...drivers]
            .filter(([, driverRows]) => driverRows.some((row) => row.year === year))
            .map(([driver]) => link(driver));
          return `<tr><th scope="row">${seasonLink(ratings, year)}</th><td class="number rating">${rounded(mean(rows.map((row) => row.rating)))}</td><td>${listOf(raced)}</td></tr>`;
        })
        .join('')}</tbody></table>`,
      'The average car rating over the season.',
    ),
  ].join('\n');
  return page({
    base,
    path: team.path,
    title: pageTitle(`${team.name} F1 car rating`),
    description: `How fast was the ${team.name} car with the drivers taken out? The ${team.name} Formula 1 car rating ${yearSpan(team.first, team.last)}, its peak and its drivers.`,
    trail: [
      ['Teams', '/teams'],
      [team.name, team.path],
    ],
    content,
  });
}

function pairPage(ratings, pair, base) {
  const [first, second] = pair.drivers;
  const [own, other] = pair.flip ? ['b', 'a'] : ['a', 'b'];
  const races = pair.races.map((race) => ({ ...race, first: race[own], second: race[other] }));
  const teams = [...new Set(races.map((race) => race.team))];
  const seasons = new Map();
  for (const race of races) {
    if (!seasons.has(race.year)) seasons.set(race.year, []);
    seasons.get(race.year).push(race);
  }
  const gap = mean(races.map((race) => race.first - race.second));
  const versus = (kind) => [pair.record[first.id][kind], pair.record[second.id][kind]];
  const [a, b] = [escapeHtml(first.surname), escapeHtml(second.surname)];
  const span = yearSpan(races[0].year, races.at(-1).year);
  const leader = Math.abs(gap) < 0.5 ? null : gap > 0 ? a : b;
  const shared = (driver) => driver.rows.filter((row) => races.some((race) => race.raceId === row.raceId));
  const content = [
    `      <section class="document-panel profile">
        ${nameHeading('F1 teammates compared', '', `${a} <span class="profile-versus">vs</span> ${b}`)}
        <p class="profile-meta">${link(first)} and ${link(second)} · ${escapeHtml(listOf(teams))} · ${span}</p>
        ${figures([
          { label: 'Average gap', value: signed(Math.abs(gap)), note: leader ? `In favour of ${leader}` : 'Level' },
          { label: 'Qualifying', value: score(versus('qualifying')), note: `${a}–${b}: qualified ahead` },
          { label: 'Races', value: score(versus('races')), note: `${a}–${b}: finished ahead, in ${races.length} races together` },
        ])}
        ${buttons([
          ['Head to head', `/head-to-head?a=${first.id}&amp;b=${second.id}`],
          [
            'Compare in history',
            `/history?v=1&amp;h=driver&amp;drivers=${first.id}%2C${second.id}&amp;from=${races[0].year}&amp;to=${races.at(-1).year}`,
          ],
        ])}
      </section>`,
    panel(
      'Race by race',
      ratingChart(
        [
          { label: first.name, rows: shared(first) },
          { label: second.name, rows: shared(second) },
        ],
        `The driver ratings of ${first.name} and ${second.name} in their races together`,
        'pair',
      ),
      'Teammates share the car, so the gap between their driver ratings compares the two drivers alone.',
    ),
    panel(
      'Season by season',
      `<table class="document-table"><thead><tr><th scope="col">Season</th><th scope="col">Team</th><th scope="col" class="number">${a}</th><th scope="col" class="number">${b}</th><th scope="col" class="number">Gap</th></tr></thead><tbody>${[
        ...seasons,
      ]
        .reverse()
        .map(
          ([year, rows]) =>
            `<tr><th scope="row">${year}</th><td>${escapeHtml(listOf([...new Set(rows.map((row) => row.team))]))}</td><td class="number rating">${rounded(mean(rows.map((row) => row.first)))}</td><td class="number rating">${rounded(mean(rows.map((row) => row.second)))}</td><td class="number">${signed(mean(rows.map((row) => row.first - row.second)))}</td></tr>`,
        )
        .join('')}</tbody></table>`,
      `The average ratings over the season; the gap is ${a}’s minus ${b}’s.`,
    ),
  ].join('\n');
  return page({
    base,
    path: pair.path,
    title: pageTitle(`${first.name} vs ${second.name}: who was better at ${listOf(teams)}?`),
    description: `${first.name} vs ${second.name}: who was the better driver when they were teammates at ${listOf(teams)} (${span})? Their driver ratings compared, race by race.`,
    trail: [
      ['Teammates', '/teammates'],
      [`${first.name} vs ${second.name}`, pair.path],
    ],
    content,
  });
}

/** The first panel of a list: its name and what it lists. */
const listHeading = (title, lead) => `      <section class="document-panel profile">
        <h1 class="list-title">${title}</h1>
        <p class="profile-meta">${lead}</p>
      </section>`;

function driverIndex(ratings, base) {
  const everyone = [...ratings.drivers.values()].sort(
    (x, y) => x.surname.localeCompare(y.surname, 'en') || x.name.localeCompare(y.name, 'en'),
  );
  const content = [
    listHeading(
      'F1 driver ratings',
      `Every Formula 1 driver since 1994, rated with the car taken out. Who is the best of all time? <a href="${insightPath('driver-peak-ratings')}">The ranking</a>.`,
    ),
    panel('The current grid', currentTable(ratings, 'drivers')),
    panel(
      'Every driver since 1994',
      `<table class="document-table"><thead><tr><th scope="col">Driver</th><th scope="col">Seasons</th><th scope="col" class="number">Peak</th></tr></thead><tbody>${everyone
        .map(
          (driver) =>
            `<tr><th scope="row">${link(driver)}</th><td>${yearSpan(driver.first, driver.last)}</td><td class="number rating">${driver.peak ? rounded(driver.peak.rating) : '—'}</td></tr>`,
        )
        .join('')}</tbody></table>`,
      `By surname. The peak counts after ${DRIVER_PEAK_MINIMUM_STARTS} Grand Prix starts. Every pair of teammates: <a href="/teammates">teammates compared</a>. Drivers who were not teammates: <a href="/compare">drivers compared</a>.`,
    ),
  ].join('\n');
  return page({
    base,
    path: '/drivers',
    title: pageTitle('F1 driver ratings: every driver since 1994'),
    description: `Every Formula 1 driver since 1994 rated with the car taken out: the current grid and all ${everyone.length} drivers, their peaks and their teammates.`,
    trail: [['Drivers', '/drivers']],
    content,
  });
}

function teamIndex(ratings, base) {
  const all = [...ratings.teams.values()].sort((x, y) => x.name.localeCompare(y.name, 'en'));
  const content = [
    listHeading(
      'F1 car ratings',
      `Every Formula 1 car since 1994, rated with the drivers taken out. Which was the best of all time? <a href="${insightPath('car-peak-ratings')}">The ranking</a>.`,
    ),
    panel('The current cars', currentTable(ratings, 'cars')),
    panel(
      'Every team since 1994',
      `<table class="document-table"><thead><tr><th scope="col">Team</th><th scope="col">Seasons</th><th scope="col" class="number">Peak</th></tr></thead><tbody>${all
        .map(
          (team) =>
            `<tr><th scope="row">${link(team)}</th><td>${yearSpan(team.first, team.last)}</td><td class="number rating">${rounded(team.peak.rating)}</td></tr>`,
        )
        .join('')}</tbody></table>`,
      'The fastest car of each season: <a href="/seasons">the seasons since 1994</a>.',
    ),
  ].join('\n');
  return page({
    base,
    path: '/teams',
    title: pageTitle('F1 car ratings: every team since 1994'),
    description: `Every Formula 1 car since 1994 rated with the drivers taken out: the current cars and all ${all.length} teams, with their peaks and their drivers.`,
    trail: [['Teams', '/teams']],
    content,
  });
}

function teammateIndex(ratings, base) {
  const pairs = [...ratings.pairs.values()]
    .filter((pair) => pair.races.length >= TEAMMATE_PAGE_MINIMUM_RACES)
    .sort((x, y) =>
      x.races.at(-1).date < y.races.at(-1).date ? 1 : x.races.at(-1).date > y.races.at(-1).date ? -1 : y.races.length - x.races.length,
    );
  const content = [
    listHeading(
      'F1 teammates compared',
      `Every pair of Formula 1 teammates since 1994 with at least ${TEAMMATE_PAGE_MINIMUM_RACES} races together, most recent first. Who beat a teammate by the most? <a href="${insightPath('teammate-gaps')}">The biggest gaps</a>.`,
    ),
    panel(
      'Every pair of teammates',
      versusList(
        pairs.map((pair) => {
          const gap = mean(pair.races.map((race) => (pair.flip ? race.b - race.a : race.a - race.b)));
          return {
            name: `<a href="${pair.path}">${escapeHtml(pair.drivers[0].name)} vs ${escapeHtml(pair.drivers[1].name)}</a>`,
            meta: `${escapeHtml(listOf([...new Set(pair.races.map((race) => race.team))]))} · ${yearSpan(pair.races[0].year, pair.races.at(-1).year)} · ${pair.races.length} races`,
            gap,
            compare: null,
          };
        }),
      ),
      'The bar is the first-named driver’s average rating minus the second’s.',
    ),
  ].join('\n');
  return page({
    base,
    path: '/teammates',
    title: pageTitle('F1 teammates compared: every pair since 1994'),
    description: `Every pair of Formula 1 teammates since 1994 compared by driver rating: ${pairs.length} pairings, and who was the better driver in the same car.`,
    trail: [['Teammates', '/teammates']],
    content,
  });
}

/** The most a driver reached: the peak (after the starts the Insights require), or else the highest rating. */
const highest = (driver) => driver.peak ?? best(driver.rows, (x, y) => y.rating - x.rating);

function comparisonPage(ratings, comparison, base) {
  const [first, second] = comparison.drivers;
  const [a, b] = [escapeHtml(first.surname), escapeHtml(second.surname)];
  const current = (driver) => ratings.current.drivers.some((row) => row.driver === driver);
  const [peakA, peakB] = [highest(first), highest(second)];
  const [averageA, averageB] = [first, second].map((driver) => mean(driver.rows.map((row) => row.rating)));
  const ahead = (x, y) => (Math.round(x) === Math.round(y) ? 'level' : x > y ? a : b);
  const gap = (x, y) => Math.abs(Math.round(x) - Math.round(y));
  const answer = (measure, x, y) =>
    ahead(x, y) === 'level' ? `level on ${measure}` : `${ahead(x, y)} is ahead on ${measure} by ${gap(x, y)}`;
  const leader = ahead(peakA.rating, peakB.rating);
  const summary =
    leader !== 'level' && leader === ahead(averageA, averageB)
      ? `${leader} is ahead on peak rating by ${gap(peakA.rating, peakB.rating)} and on career average by ${gap(averageA, averageB)}`
      : `${answer('peak rating', peakA.rating, peakB.rating)}, and ${answer('career average', averageA, averageB)}`;
  const row = (label, x, y) =>
    `<tr><th scope="row">${label}</th><td class="number rating">${x}</td><td class="number rating">${y}</td></tr>`;
  const span = (driver) => yearSpan(driver.first, driver.last);
  const content = [
    `      <section class="document-panel profile">
        ${nameHeading('F1 drivers compared', '', `${a} <span class="profile-versus">vs</span> ${b}`)}
        <p class="profile-meta">${link(first)} (${span(first)}) and ${link(second)} (${span(second)}): ${summary}.</p>
        ${figures([
          {
            label: `${a}’s peak`,
            value: rounded(peakA.rating),
            note: `${dayOf(peakA)} · ${escapeHtml(shortGrandPrix(peakA.grandPrix))}`,
            tone: 'first',
          },
          {
            label: `${b}’s peak`,
            value: rounded(peakB.rating),
            note: `${dayOf(peakB)} · ${escapeHtml(shortGrandPrix(peakB.grandPrix))}`,
            tone: 'second',
          },
        ])}
        ${buttons([
          ['Head to head', `/head-to-head?a=${first.id}&amp;b=${second.id}`],
          [
            'Compare in history',
            `/history?v=1&amp;h=driver&amp;drivers=${first.id}%2C${second.id}&amp;from=${Math.min(first.first, second.first)}&amp;to=${Math.max(first.last, second.last)}`,
          ],
        ])}
      </section>`,
    panel(
      'Side by side',
      `<table class="document-table"><thead><tr><th scope="col"></th><th scope="col" class="number">${a}</th><th scope="col" class="number">${b}</th></tr></thead><tbody>${[
        row('Peak rating', rounded(peakA.rating), rounded(peakB.rating)),
        row('Career average', rounded(averageA), rounded(averageB)),
        row(
          current(first) && current(second) ? 'Current rating' : 'Current or final rating',
          rounded(first.latest.rating),
          rounded(second.latest.rating),
        ),
        row('Grands Prix rated', first.rows.length, second.rows.length),
        row('Seasons', span(first), span(second)),
      ].join('')}</tbody></table>`,
      `The peak counts after ${DRIVER_PEAK_MINIMUM_STARTS} Grand Prix starts (the highest rating, for a shorter career). Each rating measures a driver against the leading field of the day, so drivers of different years share one scale; comparing eras is still a thought experiment.`,
    ),
    panel(
      'Race by race',
      ratingChart(
        [
          { label: first.name, rows: first.rows },
          { label: second.name, rows: second.rows },
        ],
        `The driver ratings of ${first.name} and ${second.name} after each Grand Prix`,
        'pair',
      ),
    ),
    panel(
      'More',
      `<p>Each career on its own: ${link(first)} and ${link(second)}. Every comparison: <a href="/compare">drivers compared</a>.</p>`,
    ),
  ].join('\n');
  return page({
    base,
    path: comparison.path,
    title: pageTitle(`${first.name} vs ${second.name}: who is the better F1 driver?`),
    description: `Who is the better Formula 1 driver, ${first.name} or ${second.name}? Their driver ratings with the car taken out, compared: peaks, career averages and every race.`,
    trail: [
      ['Drivers compared', '/compare'],
      [`${first.name} vs ${second.name}`, comparison.path],
    ],
    content,
  });
}

function comparisonIndex(ratings, base) {
  const content = [
    listHeading(
      'F1 drivers compared',
      `${ratings.comparisons.length} comparisons of two Formula 1 drivers, with the car taken out, the most asked about first. Drivers who were teammates are compared on <a href="/teammates">their own pages</a>.`,
    ),
    panel(
      'Every comparison',
      `<ul class="driver-list">${ratings.comparisons
        .map(
          ({ path, drivers: [first, second] }) =>
            `<li><a href="${path}">${escapeHtml(first.name)} vs ${escapeHtml(second.name)}</a> <span class="versus-meta">${yearSpan(Math.min(first.first, second.first), Math.max(first.last, second.last))}</span></li>`,
        )
        .join('')}</ul>`,
    ),
  ].join('\n');
  return page({
    base,
    path: '/compare',
    title: pageTitle('F1 drivers compared: who is the better driver?'),
    description: `Who is the better Formula 1 driver? ${ratings.comparisons.length} comparisons of two drivers, with the car taken out: peaks, career averages and every race.`,
    trail: [['Drivers compared', '/compare']],
    content,
  });
}

function seasonPage(ratings, season, index, base) {
  const [first, second, third] = season.drivers;
  const car = season.cars[0];
  const [previous, next] = [ratings.seasons[index - 1], ratings.seasons[index + 1]];
  const driverRows = season.drivers
    .map(
      (row, place) =>
        `<tr><td class="number place">${place + 1}</td><th scope="row">${link(row.driver)}</th><td>${row.team ? link(row.team) : ''}</td><td class="number rating">${rounded(row.rating)}</td><td class="number">${rounded(row.average)}</td></tr>`,
    )
    .join('');
  const carRows = season.cars
    .map(
      (row, place) =>
        `<tr><td class="number place">${place + 1}</td><th scope="row">${link(row.team)}</th><td class="number rating">${rounded(row.rating)}</td><td class="number">${rounded(row.average)}</td></tr>`,
    )
    .join('');
  const content = [
    `      <section class="document-panel profile">
        <p class="profile-subject">F1 season ${season.year}</p>
        <h1 class="list-title">Who was the best F1 driver in ${season.year}?</h1>
        <p class="profile-meta">By driver rating at the end of the season, with the car taken out, ${link(first.driver)} led, ahead of ${link(second.driver)} and ${link(third.driver)}. The fastest car was the ${link(car.team)}.</p>
        ${figures([
          { label: 'Best driver', value: rounded(first.rating), note: escapeHtml(first.driver.name), tone: 'second' },
          { label: 'Fastest car', value: rounded(car.rating), note: escapeHtml(car.team.name), tone: 'first' },
        ])}
        ${buttons([
          [`The ratings at the end of ${season.year}`, `/ratings?v=1&amp;race=${season.last.raceId}`],
          [
            'Compare in history',
            `/history?v=1&amp;h=driver&amp;drivers=${[first, second, third].map((row) => row.driver.id).join('%2C')}&amp;from=${season.year}&amp;to=${season.year}`,
          ],
        ])}
      </section>`,
    panel(
      `The drivers at the end of ${season.year}`,
      `<table class="document-table"><thead><tr><th scope="col" class="place">#</th><th scope="col">Driver</th><th scope="col">Car</th><th scope="col" class="number">Rating</th><th scope="col" class="number">Season average</th></tr></thead><tbody>${driverRows}</tbody></table>`,
      `The driver ratings after the ${escapeHtml(season.last.grandPrix)}, the last race of the season, and the average over the season.`,
    ),
    panel(
      `The cars at the end of ${season.year}`,
      `<table class="document-table"><thead><tr><th scope="col" class="place">#</th><th scope="col">Car</th><th scope="col" class="number">Rating</th><th scope="col" class="number">Season average</th></tr></thead><tbody>${carRows}</tbody></table>`,
    ),
    `      <section class="document-panel"><nav class="document-neighbours" aria-label="Other seasons">${previous ? `<a rel="prev" href="${previous.path}">← ${previous.year}</a>` : '<span></span>'}<a href="/seasons">Every season</a>${next ? `<a rel="next" href="${next.path}">${next.year} →</a>` : '<span></span>'}</nav></section>`,
  ].join('\n');
  return page({
    base,
    path: season.path,
    title: pageTitle(`Who was the best F1 driver in ${season.year}? Driver and car ratings`),
    description: `The best Formula 1 drivers and cars of the ${season.year} season, rated with the car and the driver separated: the ratings at the end of the season and the average over it.`,
    trail: [
      ['Seasons', '/seasons'],
      [String(season.year), season.path],
    ],
    content,
  });
}

function seasonIndex(ratings, base) {
  const rows = [...ratings.seasons]
    .reverse()
    .map(
      (season) =>
        `<tr><th scope="row"><a href="${season.path}">${season.year}</a></th><td>${link(season.drivers[0].driver)}</td><td>${link(season.cars[0].team)}</td></tr>`,
    )
    .join('');
  const content = [
    listHeading(
      'Who was the best F1 driver of each season?',
      `Every Formula 1 season since ${ratings.seasons[0].year}, with the best driver and the fastest car by rating at its end, the car and the driver separated.`,
    ),
    panel(
      'Every season',
      `<table class="document-table"><thead><tr><th scope="col">Season</th><th scope="col">Best driver</th><th scope="col">Fastest car</th></tr></thead><tbody>${rows}</tbody></table>`,
    ),
  ].join('\n');
  return page({
    base,
    path: '/seasons',
    title: pageTitle('The best F1 driver of each season since 1994'),
    description: `Who was the best Formula 1 driver of each season, and the fastest car? Every season since ${ratings.seasons[0].year}, rated with the car and the driver separated.`,
    trail: [['Seasons', '/seasons']],
    content,
  });
}

/** Every page of the drivers, the teams, the teammates, the comparisons and the seasons. */
export function driverAndTeamPages(ratings, base) {
  return [
    driverIndex(ratings, base),
    teamIndex(ratings, base),
    teammateIndex(ratings, base),
    comparisonIndex(ratings, base),
    seasonIndex(ratings, base),
    ...ratings.comparisons.map((comparison) => comparisonPage(ratings, comparison, base)),
    ...ratings.seasons.map((season, index) => seasonPage(ratings, season, index, base)),
    ...[...ratings.drivers.values()].map((driver) => driverPage(ratings, driver, base)),
    ...[...ratings.teams.values()].map((team) => teamPage(ratings, team, base)),
    ...[...ratings.pairs.values()]
      .filter((pair) => pair.races.length >= TEAMMATE_PAGE_MINIMUM_RACES)
      .map((pair) => pairPage(ratings, pair, base)),
  ];
}
