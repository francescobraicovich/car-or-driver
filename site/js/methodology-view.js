// The Methodology: a card of slides (slide-deck.js), one for each of the eight parts of the text (methodology-content.js), with its diagram
// (methodology-diagram.js) and the settings filled in, the settings tables, and the accuracy figures and charts from the loaded model.
import { state } from './state.js';
import { renderPlot } from './chart-renderer.js';
import { hasRatingsDiag, ratingsWindows, seasonLossSeries } from './backtest-figures.js';
import { drawOddsCurve, drawRatingThroughTime, drawUncertaintyByExperience } from './methodology-figures.js';
import { initCareerGraph, initSplitLab } from './methodology-interactives.js';
import { NAIVE_LOGLOSS, summarizeBacktest } from '../../packages/core/src/backtest.js';
import { TUNED_ELO } from '../../packages/core/src/presets/tuned-elo.js';
import { MODEL_SETTINGS } from '../../packages/core/src/presets/model-settings.js';
import { STATE_SPACE } from '../../packages/core/src/presets/state-space.js';
import { HYBRID } from '../../packages/core/src/presets/hybrid.js';
import { STATE_SPACE_FIT } from '../../packages/core/src/presets/state-space-fit.js';
import { STATE_SPACE_DEFAULTS, STATE_SPACE_WINDOW } from '../../packages/core/src/state-space/filter.js';
import { CONTENT_HTML } from './methodology-content.js';
import { DIAGRAM_HTML } from './methodology-diagram.js';
import { createDeck } from './slide-deck.js';

const $ = (id) => document.getElementById(id);

// Parameters that define what the model is scored on. They are never searched.
const FIXED = new Set(['alpha', 'cap', 'tmBoost', 'qTmBoost', 'orderW', 'paceW', 'partialExp', 'qualOn']);

// [group, [key, what it does]]. Values come from the model's settings, so this table cannot go stale.
const PARAMETERS = [
  [
    'Scale and combination',
    [
      ['scale', 'Rating points for a tenfold change in the odds. Smaller means fewer points per unit of probability.'],
      ['qualWeight', 'Share of qualifying in combined pace.'],
      ['qualOn', 'Whether qualifying is part of combined pace.'],
      ['homeAdv', 'Bonus for racing at home (0 = none).'],
    ],
  ],
  [
    'What a pair is worth',
    [
      ['tmBoost', 'How many times a teammate pair counts in the race score.'],
      ['qTmBoost', 'The same weight in qualifying.'],
      ['alpha', 'How fast a pair’s weight grows with the size of the gap.'],
      ['cap', 'The most a pair can weigh.'],
      ['orderW', 'Weight of finishing-order evidence.'],
      ['paceW', 'Weight of lap-pace evidence.'],
      ['partialExp', 'How much a retiree’s pair counts as the share of the race completed grows.'],
    ],
  ],
  [
    'Circuit and wet-weather skills',
    [
      ['circK', 'Learning rate of a driver’s circuit offset.'],
      ['circCarry', 'Share of that offset kept over the winter.'],
      ['wetK', 'Learning rate of a driver’s wet-weather skill.'],
    ],
  ],
  [
    'Reliability',
    [
      ['relHalf', 'Half-life, in races, of a car’s failure record.'],
      ['relPrior', 'Laps of average behaviour a car’s failure rate starts from.'],
      ['relWinter', 'Share of a car’s failure record kept over the winter.'],
      ['incHalf', 'Half-life, in races, of a driver’s incident record.'],
      ['incPrior', 'Laps of average behaviour a driver’s incident rate starts from.'],
      ['stdLaps', 'The standard race distance for effective pace and survival.'],
      ['hazardW', 'How much retirement risk is folded into the probabilities the model is scored on.'],
    ],
  ],
];

// The state-space settings, in the order of the table. Values are read from the preset (race and qualifying). A setting with `where: 'race'` belongs to the race
// model only (its qualifying cell is empty); `from` names where its value lives.
const STATE_SPACE_PARAMETERS = [
  {
    key: 'beta',
    where: 'race',
    from: 'link',
    text: 'Weight of a driver’s qualifying level in their race strength (the race model reads qualifying).',
  },
  { key: 'gamma', where: 'race', from: 'link', text: 'The same for a car’s qualifying level.' },
  { key: 'sdD', text: 'Prior spread of a driver’s level (points).' },
  { key: 'sdNew', text: 'Prior spread of a driver at their first appearance.' },
  { key: 'sdC', text: 'Prior spread of a car’s level.' },
  { key: 'rho', text: 'Share of a car’s level kept over the winter.' },
  { key: 'winterC', text: 'Winter shake-up of a car’s level (standard deviation).' },
  { key: 'raceC', text: 'Drift of a car’s level per weekend (standard deviation).' },
  { key: 'yearD', text: 'Drift of a driver’s level per season (standard deviation).' },
  { key: 'tau', text: 'Weight of a weekend’s pairs, which are far from independent.' },
  { key: 'thetaT', text: 'Extra weight of teammate pairs.' },
  { key: 'mPace', text: 'Learning weight of lap-pace pairs, against finishing order.' },
  { key: 'mPart', text: 'Learning weight of retirement pairs.' },
  { key: 's', text: 'Rating points for a tenfold change in the odds.' },
  { key: 'sdJ', text: 'Jump in a driver’s level at a team change (standard deviation).' },
  { key: 'sdA', text: 'Starting spread of the driver’s fit with their car, zero when they arrive at a team.' },
  { key: 'rhoA', text: 'Share of that fit kept each weekend (race: close to 1, so it lasts while they stay).' },
  { key: 'rateA', text: 'Whether the fit is part of the published rating (off: the published rating is the portable level).' },
  { key: 'shrinkM', text: 'Pull of a driver’s level towards average at a team change (1 = none).' },
  { key: 'dipR', text: 'Starting penalty of a new driver’s temporary debut adjustment (points).' },
  { key: 'sdR', text: 'Starting spread of that adjustment.' },
  { key: 'rhoR', text: 'Share of the debut adjustment kept each weekend.' },
  {
    key: 'dip',
    where: 'race',
    from: 'adapt',
    text: 'Option, off: points a driver is expected to lose in their first weekend at a new team (0 = off).',
  },
  { key: 'rho', label: 'adapt rho', where: 'race', from: 'adapt', text: 'Option: share of that loss kept each following weekend.' },
  {
    key: 'varInfl',
    text: 'Multiplier on the displayed race-filter variance, calibrated from dated rating revisions; the complete blend has no separately calibrated covariance.',
  },
];

// The circuit and wet-weather skills that Head to head reads come from a per-driver track whose settings live in a preset of their own.
const P = { ...MODEL_SETTINGS, circK: TUNED_ELO.circK, circCarry: TUNED_ELO.circCarry, wetK: TUNED_ELO.wetK };
const derived = {
  scale2: 2 * MODEL_SETTINGS.scale,
  window: STATE_SPACE_WINDOW,
  slopeRace: STATE_SPACE_FIT.slopes.race.toFixed(2),
  slopeQual: STATE_SPACE_FIT.slopes.qual.toFixed(2),
  kCars: STATE_SPACE_FIT.scenario.cars.toFixed(2),
  kMates: STATE_SPACE_FIT.scenario.teammates.toFixed(2),
  kWet: STATE_SPACE_FIT.scenario.wetRatio.toFixed(2),
  'r.sqrtVarInfl': Math.sqrt(STATE_SPACE.race.varInfl).toFixed(1),
  ...Object.fromEntries(Object.entries(STATE_SPACE.race).map(([k, v]) => [`r.${k}`, +(+v).toPrecision(3)])),
  ...Object.fromEntries(Object.entries(STATE_SPACE.qual).map(([k, v]) => [`q.${k}`, +(+v).toPrecision(3)])),
  'link.beta': +(+STATE_SPACE.link.beta).toPrecision(2),
  'link.gamma': +(+STATE_SPACE.link.gamma).toPrecision(2),
  'adapt.dip': STATE_SPACE.adapt?.dip || 20,
  'adapt.rho': STATE_SPACE.adapt?.rho ?? 0.5,
  'adapt.state': STATE_SPACE.adapt?.dip ? 'on' : 'off',
  ...Object.fromEntries(
    Object.entries(HYBRID)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => [`hybrid.${key}`, value]),
  ),
  ...Object.fromEntries(Object.entries(HYBRID.ranking).map(([key, value]) => [`hybrid.ranking.${key}`, value])),
};
const show = (v) => (typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v));

// KaTeX is served from this site (site/vendor/katex) and loads on first use. Until it arrives, the LaTeX source stays visible,
// which is readable on its own.
const KATEX = new URL('../vendor/katex/', import.meta.url).href;
let katexLoad = null;
function loadKatex() {
  if (window.katex) return Promise.resolve(window.katex);
  katexLoad ??= new Promise((resolve) => {
    const css = document.createElement('link');
    Object.assign(css, { rel: 'stylesheet', href: `${KATEX}katex.min.css` });
    document.head.append(css);
    const script = document.createElement('script');
    script.src = `${KATEX}katex.min.js`;
    script.onload = () => resolve(window.katex);
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
  return katexLoad;
}

async function typeset() {
  const katex = await loadKatex();
  if (!katex) return;
  for (const node of $('methodologyCard').querySelectorAll('.math:not(.typeset)')) {
    katex.render(node.textContent, node, { displayMode: node.classList.contains('block'), throwOnError: false });
    node.classList.add('typeset');
  }
}

/** The text with the settings filled in. */
const filledText = () => {
  const values = { ...P, ...derived };
  return CONTENT_HTML.replace('<!--DIAGRAM-->', DIAGRAM_HTML).replace(/\{\{([\w.]+)\}\}/g, (_, name) => show(values[name]));
};

/** The tables of settings, from the model's own settings (so that they cannot go stale). */
function fillTables() {
  const cell = (row, session) => {
    if (row.where === 'race' && session === 'q') return '—';
    const v =
      row.from === 'link'
        ? STATE_SPACE.link[row.key]
        : row.from === 'adapt'
          ? STATE_SPACE.adapt?.[row.key]
          : { ...STATE_SPACE_DEFAULTS, ...STATE_SPACE[session === 'r' ? 'race' : 'qual'] }[row.key];
    return show(typeof v === 'boolean' ? v : +(+v).toPrecision(3));
  };
  const ssRows = STATE_SPACE_PARAMETERS.map(
    (row) =>
      `<tr><th scope="row" class="left"><code>${row.label ?? row.key}</code></th><td class="left">${row.text}</td><td><b>${cell(row, 'r')}</b></td><td><b>${cell(row, 'q')}</b></td></tr>`,
  );
  $('methodologyParams').innerHTML =
    `<table class="params"><thead><tr><th scope="col" class="left">Setting</th><th scope="col" class="left">What it does</th><th scope="col">Race</th><th scope="col">Qualifying</th></tr></thead><tbody>${ssRows.join('')}</tbody></table>`;
  const rows = PARAMETERS.map(
    ([group, items]) =>
      `<tr class="group"><th colspan="4" scope="colgroup">${group}</th></tr>` +
      items
        .map(
          ([key, text]) =>
            `<tr><th scope="row" class="left"><code>${key}</code></th><td class="left">${text}</td><td><b>${show(P[key])}</b></td><td>${FIXED.has(key) ? 'Fixed' : 'Tuned'}</td></tr>`,
        )
        .join(''),
  );
  $('methodologyScoring').innerHTML =
    `<table class="params"><thead><tr><th scope="col" class="left">Parameter</th><th scope="col" class="left">What it does</th><th scope="col">Value</th><th scope="col">Status</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');

/** Ratings alone, against a coin flip on identical observations. */
function renderRatings() {
  const has = hasRatingsDiag(state.model);
  $('methodologyRatingsStats').hidden = !has;
  $('methodologyRatingsChartWrap').hidden = !has;
  $('methodologyWindows').replaceChildren();
  if (!has) return;
  const windows = ratingsWindows(state.model);
  const recent = windows.at(-1);
  $('methodologyRatingsValue').firstChild.textContent = f3(recent.ratings.combinedLogLoss);
  $('methodologyRatingsLabel').textContent = 'These ratings, 2016 to now';
  $('methodologyCoinValue').firstChild.textContent = f3(NAIVE_LOGLOSS);
  $('methodologyRatingsWeekends').firstChild.textContent = String(
    summarizeBacktest(state.model, { burnIn: 20, fromYear: 2016, diag: 'ssDiag' }).weekends,
  );
  $('methodologyWindows').innerHTML = windows
    .map(
      ({ label, ratings }) =>
        `<tr><th scope="row" class="left">${label}</th><td>${f3(NAIVE_LOGLOSS)}</td><td><b>${f3(ratings.combinedLogLoss)}</b></td><td>${Math.round(100 * (1 - ratings.combinedLogLoss / NAIVE_LOGLOSS))}%</td></tr>`,
    )
    .join('');
  const seasons = summarizeBacktest(state.model, { burnIn: 20, fromYear: 2008, diag: 'ssDiag' }).seasons;
  const line = (id, name, color, pick) => ({
    id,
    name,
    color,
    dash: '',
    points: seasons.flatMap((s) => {
      const point = { date: `${s.year}-07-01`, year: s.year, contiguous: true, v: pick(s) };
      return id === 'naive' ? [{ ...point, date: `${s.year}-01-01` }, point, { ...point, date: `${s.year}-12-31` }] : [point];
    }),
  });
  renderPlot($('methodologyRatingsChart'), {
    series: [
      line('ratings', 'These ratings', 'var(--s1)', (s) => s.combinedLogLoss),
      line('naive', 'Coin flip', 'var(--ink-3)', () => NAIVE_LOGLOSS),
    ],
    type: 'backtest',
    label: 'Forecast error from the ratings alone, by season · lower is better',
    height: 300,
  });
}

/** The figures that need the loaded ratings, drawn once; each redraws itself when its width changes. */
let figuresDrawn = false;
function drawModelFigures() {
  if (figuresDrawn) return;
  figuresDrawn = true;
  drawUncertaintyByExperience($('methodologyUncertaintyChart'), state.model);
  const name = drawRatingThroughTime($('methodologyTimelineChart'), state.model);
  if (name)
    $('methodologyTimelineCaption').textContent =
      `${name}: the published rating after each of their last 48 weekends, with the race filter’s approximate standard deviation either side. The band does not include uncertainty from the full hybrid blend.`;
}

function render() {
  if (!state.model?.snaps.length) return;
  renderRatings();
  drawModelFigures();
  const since = 2016;
  const recent = summarizeBacktest(state.model, { burnIn: 20, fromYear: since }).overall;
  if (!recent.weekends && !recent.totalWeight) return;
  $('methodologyForecastStats').hidden = false;
  $('methodologyAccuracy').textContent = Number.isFinite(recent.raceAcc) ? `${Math.round(100 * recent.raceAcc)}%` : '—';
  $('methodologyAccuracyLabel').textContent = `Favourite finishes ahead, ${since}–now`;
  $('methodologyLoss').firstChild.textContent = Number.isFinite(recent.combinedLogLoss) ? recent.combinedLogLoss.toFixed(3) : '—';
  $('methodologyLossNote').textContent = 'A coin flip scores 0.693; lower is better.';
  const weekends = summarizeBacktest(state.model, { burnIn: 20, fromYear: since }).weekends;
  $('methodologyWeekends').firstChild.textContent = String(weekends);
  $('methodologyWeekendsNote').textContent = 'Race and qualifying, each forecast from earlier weekends only.';

  const seasons = summarizeBacktest(state.model, { burnIn: 20, fromYear: 2008 }).seasons;
  const wrap = $('methodologyForecastChartWrap');
  wrap.hidden = !seasons.length;
  if (!seasons.length) return;
  const series = seasonLossSeries(seasons);
  renderPlot($('methodologyForecastChart'), {
    series,
    type: 'backtest',
    label: 'Forecast error by season · lower is better',
    height: 320,
  });
}

const LABELS = {
  'method-overview': 'Overview',
  'method-data': 'Data',
  'method-ratings': 'Ratings',
  'method-forecasts': 'Forecasts',
  'method-backtesting': 'Backtesting',
  'method-limits': 'Limits',
  'method-settings': 'Settings',
  'method-references': 'References',
};

export function initMethodology() {
  // the eight parts of the text, one slide each (a link in the text that names a part leads to its slide: slide-deck.js)
  const text = document.createElement('div');
  text.innerHTML = filledText();
  const parts = [...text.querySelectorAll(':scope > .method-part')];
  createDeck({
    page: 'methodology',
    title: 'Methodology',
    before:
      '<p class="deck-intro">A guided account of how results become driver ratings, car ratings and forecasts. Start with the observable comparisons, then follow how the model learns from them.</p>',
    groups: [
      {
        slides: parts.map((part) => ({
          id: part.id,
          label: LABELS[part.id],
          title: part.querySelector('h3').textContent.replace(/^\d+\.\s*/, ''),
          html: `<div class="deck-text">${part.outerHTML}</div>`,
        })),
      },
    ],
    firstShown: () => {
      drawOddsCurve($('methodologyOddsChart'), MODEL_SETTINGS.scale);
      initSplitLab($('methodologySplitLab'));
      initCareerGraph($('methodologyCareerGraph'));
      render();
      typeset();
    },
  });
  fillTables();
  window.addEventListener('f1:model-ready', render);
  window.addEventListener('f1:workspace-changed', () => {
    if (document.body.dataset.page === 'methodology') {
      render();
      typeset();
    }
  });
}
