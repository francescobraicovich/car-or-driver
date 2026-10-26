import { state } from './state.js';
import { setRace } from './ratings-view.js';
import { esc } from './utils.js';

const $ = (id) => document.getElementById(id);
const fullDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function initGraph() {
  const page = $('graphPage');
  const canvas = $('graphPlot');
  const plot = canvas.getContext('2d');
  const timeline = $('graphTimeline');
  const picker = $('graphDriver');
  const detail = $('graphDetail');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let data = null;
  let view = null;
  let hover = null;
  let chosen = '830'; // Max Verstappen, when he has entered the graph by this weekend
  let pointer = null;
  let frame = 0;
  let rect = null;
  let positions = [];
  let scoreById = new Map();
  let pairById = new Map();
  let publishedById = new Map();

  const current = () => document.body.dataset.page === 'graph' && !page.hidden;
  const active = () => hover ?? (scoreById.has(chosen) ? chosen : null);
  const nameOf = (id) => state.profiles[id]?.slice(0, 2).join(' ') || state.model?.dname?.get?.(id) || `Driver ${id}`;
  const selectedSnap = () => state.model?.snaps[state.raceIndex];
  const record = (pair, id) => {
    const first = pair.a === id;
    return {
      other: first ? pair.b : pair.a,
      qual: first ? `${pair.qa}–${pair.qb}` : `${pair.qb}–${pair.qa}`,
      race: first ? `${pair.ra}–${pair.rb}` : `${pair.rb}–${pair.ra}`,
      advantage: first ? pair.qa + 1.5 * pair.ra - pair.qb - 1.5 * pair.rb : pair.qb + 1.5 * pair.rb - pair.qa - 1.5 * pair.ra,
    };
  };
  function showDetail() {
    const id = active();
    window.dispatchEvent(
      new CustomEvent('f1:row-hover', {
        detail: { id: id && selectedSnap()?.drivers.some((row) => String(row.driverId) === id) ? id : null },
      }),
    );
    if (!id) {
      detail.innerHTML =
        '<div class="graph-detail-empty"><strong>Explore a driver</strong><p>Hover a dot or choose a name to see ratings and teammate results. Green links favor that driver; pink links favor the teammate.</p></div>';
      return;
    }
    const node = scoreById.get(id);
    if (!node) return;
    const published = publishedById.get(id);
    const onGrid = selectedSnap().drivers.some((row) => String(row.driverId) === id);
    const rivals = [...pairById.values()]
      .filter((pair) => pair.a === id || pair.b === id)
      .map((pair) => record(pair, id))
      .sort((a, b) => Math.abs(b.advantage) - Math.abs(a.advantage));
    detail.innerHTML = `<div class="graph-detail-heading"><div><small>${onGrid ? 'ON THIS GRID' : 'CAREER RECORD'}</small><h3>${esc(nameOf(id))}</h3></div><span>${node[3]} starts</span></div>
      <div class="graph-detail-metrics"><div><span>${onGrid ? 'Published rating' : 'Last rating'}</span><strong>${published == null ? '—' : Math.round(published)}</strong></div><div><span>Graph only</span><strong>${node[1].toFixed(1)}</strong></div><div><span>Age at date</span><strong>${node[4] ?? 'Unknown'}</strong></div><div><span>Mean season</span><strong>${node[2].toFixed(1)}</strong></div></div>
      <h4>All teammates through this weekend</h4>
      <div class="graph-rivals">${rivals.length ? rivals.map((item) => `<div class="graph-rival ${item.advantage > 0 ? 'up' : item.advantage < 0 ? 'down' : 'even'}"><span>${esc(nameOf(item.other))}</span><span>Q ${item.qual}</span><span>R ${item.race}</span></div>`).join('') : '<p>No shared comparison yet.</p>'}</div>
      <p class="graph-note">The published number is the combined driver rating, last known if retired. The graph score uses teammate evidence alone. Q compares the last qualifying session both entered; R counts classified finishes. Green links favor this driver, pink their teammate.</p>`;
  }

  function buildAt(index) {
    const snap = data.snapshots[index];
    const own = state.model.snaps[index];
    if (String(snap.raceId) !== String(own.raceId)) throw Error('Graph and ratings weekends do not match');
    pairById = new Map();
    for (let i = 0; i <= index; i++)
      for (const [a, b, q, r] of data.snapshots[i].duels) {
        const key = `${a}:${b}`;
        const pair = pairById.get(key) ?? { a, b, qa: 0, qb: 0, ra: 0, rb: 0 };
        if (q > 0) pair.qa++;
        else if (q < 0) pair.qb++;
        if (r > 0) pair.ra++;
        else if (r < 0) pair.rb++;
        pairById.set(key, pair);
      }
    publishedById = new Map();
    for (let i = 0; i <= index; i++) for (const row of state.model.snaps[i].drivers) publishedById.set(String(row.driverId), row.combined);
    scoreById = new Map(snap.nodes.map((node) => [node[0], node]));
    view = { nodes: snap.nodes, grid: new Set(own.drivers.map((row) => String(row.driverId))), edges: [...pairById.values()] };
    if (hover && !scoreById.has(hover)) hover = null;
    picker.innerHTML =
      '<option value="">Choose driver</option>' +
      snap.nodes
        .slice()
        .sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])))
        .map((node) => `<option value="${node[0]}">${esc(nameOf(node[0]))}</option>`)
        .join('');
    picker.value = scoreById.has(chosen) ? chosen : '';
    timeline.max = String(data.snapshots.length - 1);
    timeline.value = String(index);
    $('graphWeekend').textContent = `${own.name.replace(/ Grand Prix$/, ' GP')} · ${fullDate.format(new Date(`${own.date}T12:00:00Z`))}`;
    $('graphFirst').textContent = state.model.snaps[0].year;
    $('graphLast').textContent = state.model.snaps.at(-1).year;
    showDetail();
    draw(performance.now());
  }

  function size() {
    rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    plot.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  function draw(now) {
    if (!current() || !view || !size()) return;
    const w = rect.width,
      h = rect.height;
    const left = 55,
      right = 18,
      top = 22,
      bottom = 39;
    const pw = w - left - right,
      ph = h - top - bottom;
    const firstYear = Number(state.model.snaps[0].year);
    const minYear = firstYear - 1,
      maxYear = Math.max(2027, Number(selectedSnap().year) + 1);
    const minScore = 890,
      maxScore = 1110;
    const xOf = (year) => left + ((year - minYear) / (maxYear - minYear)) * pw;
    const yOf = (score) => top + ((maxScore - score) / (maxScore - minScore)) * ph;
    plot.clearRect(0, 0, w, h);
    plot.font = '10px ui-monospace, SFMono-Regular, monospace';
    plot.textBaseline = 'middle';
    for (let year = Math.ceil(firstYear / 5) * 5; year <= maxYear; year += 5) {
      const x = xOf(year);
      plot.strokeStyle = 'rgba(28,39,66,.12)';
      plot.beginPath();
      plot.moveTo(x, top);
      plot.lineTo(x, h - bottom);
      plot.stroke();
      plot.fillStyle = '#697184';
      plot.textAlign = 'center';
      plot.fillText(String(year), x, h - 17);
    }
    for (let score = 900; score <= 1100; score += 50) {
      const y = yOf(score);
      plot.strokeStyle = 'rgba(28,39,66,.12)';
      plot.beginPath();
      plot.moveTo(left, y);
      plot.lineTo(w - right, y);
      plot.stroke();
      plot.fillStyle = '#697184';
      plot.textAlign = 'right';
      plot.fillText(String(score), left - 9, y);
    }
    plot.fillStyle = '#47516a';
    plot.textAlign = 'center';
    plot.fillText('AVERAGE YEAR RACED', left + pw / 2, h - 3);
    plot.save();
    plot.translate(12, top + ph / 2);
    plot.rotate(-Math.PI / 2);
    plot.fillText('TEAMMATE GRAPH SCORE', 0, 0);
    plot.restore();
    const id = active();
    const connected = new Set();
    if (id)
      for (const edge of view.edges) {
        if (edge.a === id) connected.add(edge.b);
        else if (edge.b === id) connected.add(edge.a);
      }
    const old = new Map(positions.map((p) => [p.id, p]));
    const moving = !reduced.matches;
    positions = view.nodes.map((node, index) => {
      const baseX = xOf(node[2]),
        baseY = yOf(node[1]);
      const distance = pointer ? Math.hypot(baseX - pointer.x, baseY - pointer.y) : Infinity;
      const focused = node[0] === id;
      const push = moving && !focused && distance < 70 ? ((70 - distance) / 70) ** 2 * 8 : 0;
      const drift = moving && !focused ? Math.sin(now / 1700 + index * 2.7) * 1.8 : 0;
      const targetX = baseX + drift + (pointer ? ((baseX - pointer.x) / (distance || 1)) * push : 0);
      const targetY =
        baseY +
        (moving && !focused ? Math.cos(now / 1950 + index * 1.9) * 1.5 : 0) +
        (pointer ? ((baseY - pointer.y) / (distance || 1)) * push : 0);
      const earlier = old.get(node[0]);
      return {
        id: node[0],
        baseX,
        baseY,
        x: earlier ? earlier.x + (targetX - earlier.x) * 0.22 : targetX,
        y: earlier ? earlier.y + (targetY - earlier.y) * 0.22 : targetY,
      };
    });
    const byId = new Map(positions.map((p) => [p.id, p]));
    for (const edge of view.edges) {
      const a = byId.get(edge.a),
        b = byId.get(edge.b);
      if (!a || !b) continue;
      const highlighted = id && (edge.a === id || edge.b === id);
      const advantage = highlighted ? record(edge, id).advantage : 0;
      plot.strokeStyle = highlighted ? (advantage > 0 ? '#198a65' : advantage < 0 ? '#d44778' : '#8c8c96') : 'rgba(46,61,101,.12)';
      plot.lineWidth = highlighted ? 2.2 : 0.7;
      plot.setLineDash(highlighted && advantage < 0 ? [5, 4] : []);
      plot.beginPath();
      plot.moveTo(a.x, a.y);
      plot.lineTo(b.x, b.y);
      plot.stroke();
    }
    plot.setLineDash([]);
    for (const point of positions) {
      const grid = view.grid.has(point.id);
      const focus = point.id === id;
      const faded = id && !focus && !connected.has(point.id);
      plot.globalAlpha = faded ? 0.28 : 1;
      plot.beginPath();
      plot.arc(point.x, point.y, focus ? 9 : grid ? 5.4 : 3.4, 0, Math.PI * 2);
      plot.fillStyle = focus ? '#eb330f' : grid ? '#1729a9' : '#909bad';
      plot.fill();
      if (grid || focus) {
        plot.strokeStyle = focus ? '#fff' : '#eef1f6';
        plot.lineWidth = focus ? 2 : 1.2;
        plot.stroke();
      }
      if (focus || (grid && w > 680)) {
        plot.font = focus ? 'bold 11px Arial, sans-serif' : '10px Arial, sans-serif';
        const label = nameOf(point.id).split(' ').at(-1);
        const placeLeft = point.x + 8 + plot.measureText(label).width > w - right;
        plot.textAlign = placeLeft ? 'right' : 'left';
        plot.fillStyle = focus ? '#ad240a' : '#253158';
        plot.fillText(label, point.x + (placeLeft ? -8 : 8), point.y - 7);
      }
    }
    plot.globalAlpha = 1;
  }
  function animate(now) {
    frame = 0;
    draw(now);
    if (current() && !reduced.matches && !document.hidden) frame = requestAnimationFrame(animate);
  }
  function start() {
    if (!frame && current() && !reduced.matches && !document.hidden) frame = requestAnimationFrame(animate);
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function sync() {
    if (!current()) {
      stop();
      hover = null;
      window.dispatchEvent(new CustomEvent('f1:row-hover', { detail: { id: null } }));
      return;
    }
    page.hidden = false;
    if (data && state.model?.snaps?.length === data.snapshots.length) buildAt(state.raceIndex);
    start();
  }
  async function load() {
    if (data) return sync();
    try {
      const response = await fetch('../data/teammate-graph.json', { cache: 'no-cache' });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      data = await response.json();
      if (data.format !== 1 || data.sourceHash !== state.modelSourceHash) throw Error('Graph data does not match the ratings');
      sync();
    } catch (error) {
      detail.textContent = `The graph could not load: ${error.message}`;
    }
  }
  canvas.addEventListener('pointermove', (event) => {
    if (!view) return;
    const box = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
    let nearest = null,
      distance = 15;
    for (const point of positions) {
      const d = Math.hypot(point.baseX - pointer.x, point.baseY - pointer.y);
      if (d < distance) {
        nearest = point.id;
        distance = d;
      }
    }
    const held = positions.find((point) => point.id === hover);
    const heldDistance = held ? Math.hypot(held.baseX - pointer.x, held.baseY - pointer.y) : Infinity;
    if (heldDistance < 22 && (nearest === null || nearest === hover || distance + 3 >= heldDistance)) nearest = hover;
    if (hover !== nearest) {
      hover = nearest;
      showDetail();
      draw(performance.now());
    }
    canvas.style.cursor = nearest ? 'pointer' : 'default';
    start();
  });
  canvas.addEventListener('pointerleave', () => {
    pointer = null;
    hover = null;
    showDetail();
    draw(performance.now());
  });
  canvas.addEventListener('click', () => {
    if (hover) {
      chosen = hover;
      picker.value = chosen;
      showDetail();
    }
  });
  picker.addEventListener('change', () => {
    chosen = picker.value || null;
    hover = null;
    showDetail();
    draw(performance.now());
  });
  timeline.addEventListener('input', () => setRace(Number(timeline.value)));
  $('graphClose').addEventListener('click', () => (location.hash = '#/'));
  window.addEventListener('keydown', (event) => {
    if (current() && event.key === 'Escape' && !event.defaultPrevented) location.hash = '#/';
  });
  window.addEventListener('f1:race-changed', () => {
    if (current() && data) buildAt(state.raceIndex);
  });
  window.addEventListener('f1:model-ready', () => {
    if (current()) load();
  });
  window.addEventListener('f1:workspace-changed', () => {
    page.hidden = document.body.dataset.page !== 'graph';
    if (current() && state.model) load();
    else sync();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      stop();
      draw(performance.now());
    } else start();
  });
  new ResizeObserver(() => draw(performance.now())).observe(canvas);
  sync();
}
