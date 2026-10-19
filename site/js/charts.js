import { state } from './state.js';
import { el } from './dom.js';
import { renderPlot, renderLegend, splitSegments } from './chart-renderer.js';

const hiddenSeries = new WeakMap();

export function metricValue(p, m, t) {
  if (['race', 'qual', 'combined', 'effective'].includes(m)) return p[m];
  if (t === 'driver' && m === 'clean') return Number.isFinite(p.clean) ? 100 * p.clean : NaN;
  if (t === 'driver' && m === 'incident') return p.incidentElo;
  if (t === 'car' && m === 'survival') return Number.isFinite(p.survival) ? 100 * p.survival : NaN;
  if (t === 'car' && m === 'reliability') return p.reliabilityElo;
  return NaN;
}

export function metricLabel(metric) {
  const laps = state.model?.params?.stdLaps || 60;
  return (
    {
      race: 'Race pace (rating)',
      qual: 'Qualifying pace (rating)',
      combined: 'Combined pace (rating)',
      effective: 'Effective pace (rating)',
      clean: `Clean ${laps}-lap race (%)`,
      incident: 'Incident rating',
      survival: `${laps}-lap survival (%)`,
      reliability: 'Reliability (rating)',
      packagePace: 'Package pace (rating)',
      packageEffective: 'Effective package pace (rating)',
    }[metric] || metric
  );
}

export function smoothSeries(h, radius) {
  radius = Math.max(0, Math.round(+radius || 0));
  if (!radius || h.length < 3) return h.map((x) => ({ ...x }));
  const out = [];
  for (let i = 0; i < h.length; i++) {
    let num = 0;
    let den = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(h.length - 1, i + radius); j++) {
      const ti = Date.parse(h[i].date) || new Date(h[i].year, 0, 1).getTime();
      const tj = Date.parse(h[j].date) || new Date(h[j].year, 0, 1).getTime();
      if (Math.abs(tj - ti) > 240 * 86400000) continue;
      const w = radius + 1 - Math.abs(j - i);
      num += h[j].v * w;
      den += w;
    }
    out.push({ ...h[i], v: den ? num / den : h[i].v });
  }
  return out;
}

export function carContinuitySeries(h, mode, fade) {
  if (mode === 'raw' || h.length < 2) return h.map((x) => ({ ...x }));
  const out = [];
  for (const group of splitSegments(h)) {
    let seasonStart = 0,
      lastYear = null,
      lastDisplayed = null,
      seasonGap = 0;
    for (const point of group) {
      const p = { ...point };
      if (lastYear === null || p.year !== lastYear) {
        seasonStart = 0;
        seasonGap = lastDisplayed === null ? 0 : lastDisplayed - p.v;
        lastYear = p.year;
      } else seasonStart++;
      const t = Math.min(1, seasonStart / Math.max(1, +fade || 1));
      p.v += seasonGap * (mode === 'index' ? 1 : 0.5 * (1 + Math.cos(Math.PI * t)));
      out.push(p);
      lastDisplayed = p.v;
    }
  }
  return out;
}

export function datedSeries(rawSeries, metric, type, snaps = state.model?.snaps || []) {
  const sequence = new Map(snaps.map((s, i) => [String(s.raceId), i]));
  return rawSeries.map((p) => ({
    ...p,
    sequence: sequence.get(String(p.raceId)),
    raw: metricValue(p, metric, type),
    v: metricValue(p, metric, type),
  }));
}

export function prepareChartSeries(rawSeries, metric, type) {
  let h = datedSeries(rawSeries, metric, type);
  if (type === 'car' && metric !== 'survival') h = carContinuitySeries(h, el.carContinuity?.value || 'raw', +el.bridgeRaces?.value || 5);
  return smoothSeries(h, +el.smoothWindow?.value || 0);
}

export function drawChart(svg, legend, ids, hist, names, metric, type, extra = {}) {
  if (!svg) return;
  if (!hiddenSeries.has(svg)) hiddenSeries.set(svg, new Set());
  const hidden = hiddenSeries.get(svg);
  const series = ids.map((id) => ({ id, name: names.get(id) || id, points: prepareChartSeries(hist.get(id) || [], metric, type) }));
  const redraw = () => drawChart(svg, legend, ids, hist, names, metric, type, extra);
  const visual = type === 'car' && metric !== 'survival' && (el.carContinuity?.value ?? 'raw') !== 'raw';
  renderPlot(svg, {
    series: series.filter((s) => !hidden.has(s.id)),
    domainSeries: series,
    type,
    label: metricLabel(metric) + (visual ? ' · visual continuity' : ''),
    probability: ['clean', 'survival'].includes(metric),
    ...extra,
  });
  renderLegend(svg, legend, series, type, hidden, redraw);
}
