// Text rendering of an evaluation: a scorecard (every headline metric next to its synthetic null and a verdict), the
// predictive tables, and a comparison of two saved evaluations.
import { describe, groupOrder, verdict } from './catalog.js';
import { fmtCI } from './stats.js';

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : 'n/a');
const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : 'n/a');

/**
 * The scorecard of the structural metrics: value [95% CI], the synthetic null(s) and a verdict against each.
 * @param {object} headline
 * @param {Record<string, Record<string, { mean: number, sd: number }>>} nulls  by mode ('same': the filter as evaluated on real
 *        data; 'tuned': tuned to the world), each a map from metric key to its spread across synthetic worlds
 */
export function scorecard(headline, nulls = {}) {
  const modes = Object.keys(nulls).filter((m) => Object.keys(nulls[m]).length);
  const tag = { same: 'S', tuned: 'T' };
  const groups = new Map();
  for (const [key, est] of Object.entries(headline)) {
    const d = describe(key);
    if (!d || (d.kind === 'lower' && key.startsWith('predictive'))) continue;
    if (!groups.has(d.group)) groups.set(d.group, []);
    groups.get(d.group).push({ key, d, est });
  }
  const fmtNull = (n) => (n ? `${f3(n.mean)}${Number.isFinite(n.sd) ? ` ±${f3(n.sd).replace(/^0\./, '.')}` : ''}` : '');
  const lines = [
    "verdict (S / T): ok = the real value's interval contains the null, high / low = it lies above / below it. The null is the same diagnostic of the same filter on a synthetic world drawn from the shipped settings, so a verdict says whether the real data behave as the filter's assumptions imply, NOT whether the filter is free of leaks (see the recovery section for that). S: filter as evaluated (shipped likelihood weight); T: filter tuned to the world",
  ];
  const order = [...groups.keys()].sort((a, b) => groupOrder(a) - groupOrder(b));
  for (const g of order) {
    lines.push(
      '',
      `## ${g}`,
      `${pad('metric', 84)}${pad('value [95% CI]', 27)}${modes.map((m) => pad(`null ${tag[m] ?? m}`, 14)).join('')}verdict`,
    );
    for (const { key, d, est } of groups.get(g)) {
      const cells = modes.map((m) => nulls[m][key]);
      const v = modes
        .map((m, i) => {
          const r = verdict(d.kind, est, cells[i] ? cells[i].mean : NaN);
          return r && r !== 'ok' ? `${tag[m] ?? m}:${r}` : r ? `${tag[m] ?? m}:ok` : '';
        })
        .filter(Boolean)
        .join(' ');
      const target = !modes.length && Number.isFinite(d.target) ? `(target ${d.target})` : '';
      lines.push(`${pad(d.label.slice(0, 82), 84)}${pad(fmtCI(est), 27)}${cells.map((c) => pad(fmtNull(c), 14)).join('')}${target}${v}`);
    }
  }
  return lines.join('\n');
}

/**
 * Recovery on synthetic worlds: the filter's absolute quality where the truth is known (error against the true levels,
 * truth inside the error bars, leak against the TRUE car swing). Unlike the scorecard, nothing here depends on how the real
 * data behave: a filter that leaks reads high whatever the data are. `!` marks a mean whose 95% interval over the worlds
 * excludes the target (0 for a leak or bias, 1 for z², 0.9 for coverage).
 * @param {Record<string, Record<string, { mean: number, sd: number, n: number }>>} nulls  by mode, as for scorecard
 */
export function recoveryReport(nulls = {}) {
  const modes = Object.keys(nulls).filter((m) => Object.keys(nulls[m]).some((k) => k.startsWith('truth.')));
  if (!modes.length) return '';
  const tag = { same: 'filter as evaluated', tuned: 'filter tuned to the world' };
  const keys = [...new Set(modes.flatMap((m) => Object.keys(nulls[m]).filter((k) => k.startsWith('truth.'))))].sort();
  const lines = [];
  let last = '';
  for (const key of keys) {
    const d = describe(key);
    if (d && d.group !== last) {
      last = d.group;
      lines.push('', `## ${d.group}; columns: ${modes.map((m) => tag[m] ?? m).join(' | ')}`);
    }
    const cells = modes.map((m) => {
      const n = nulls[m][key];
      if (!n) return '';
      const flag =
        d &&
        Number.isFinite(d.target) &&
        Number.isFinite(n.sd) &&
        ['bias', 'ratio'].includes(d.kind) &&
        Math.abs(n.mean - d.target) > (1.96 * n.sd) / Math.sqrt(n.n)
          ? ' !'
          : '';
      return `${f3(n.mean)}${Number.isFinite(n.sd) ? ` ±${f3(n.sd).replace(/^0\./, '.')}` : ''}${flag}`;
    });
    lines.push(
      `${pad((d ? d.label : key).slice(0, 82), 84)}${cells.map((c) => pad(c, 18)).join('')}${d && Number.isFinite(d.target) ? `(target ${d.target})` : ''}`,
    );
  }
  return lines.join('\n');
}

/** Predictive tables: loss by window, calibration, slices. */
export function predictiveReport(pred) {
  const out = [];
  const sessions = Object.keys(pred.slopes);
  out.push(`calibration multipliers (fitted on the fit window): ${sessions.map((s) => `${s} ${f4(pred.slopes[s])}`).join(', ')}`);
  out.push('', `${pad('window', 12)}${pad('pairs', 8)}${sessions.map((s) => lpad(s, 11)).join('')}${lpad('combined', 11)}`);
  for (const cell of pred.table)
    out.push(
      `${pad(cell.label, 12)}${pad(cell.pair, 8)}${sessions.map((s) => lpad(f4(cell[s].loss), 11)).join('')}${lpad(f4(cell.combined), 11)}`,
    );
  out.push('', 'walk-forward multiplier (refitted each year on the fit window and after), log-loss by window');
  for (const s of sessions) {
    const years = pred.walkForward[s];
    out.push(`  ${s}: ${years.map((y) => `${y.year} ${f4(y.loss)}`).join('  ')}`);
  }
  out.push('', 'calibration out of the fit window (slope through the origin; 1 = right, below 1 = over-confident)');
  for (const s of sessions) {
    const c = pred.calibration[s];
    out.push(`  ${pad(s, 6)}all ${f3(c.all)}  teammates ${f3(c.mates)}  other cars ${f3(c.cars)}  ECE ${f4(c.reliability.ece)}`);
    out.push(
      `    reliability (favourite): ${c.reliability.bins
        .filter((b) => b.n)
        .map((b) => `${(100 * b.p).toFixed(0)}%->${(100 * b.freq).toFixed(0)}%`)
        .join('  ')}`,
    );
  }
  for (const s of sessions) {
    const sl = pred.slices[s];
    const block = (title, obj) => {
      const rows = Object.entries(obj);
      if (!rows.length) return;
      out.push(`  ${s} by ${title}`);
      for (const [k, v] of rows)
        out.push(
          `    ${pad(k, 22)} n ${lpad(v.n, 7)}  loss ${f4(v.loss)}  slope ${f3(v.calSlope)}${v.meanSd ? `  mean gap sd ${v.meanSd.toFixed(1)}` : ''}`,
        );
    };
    out.push('');
    block('observation source', sl.source);
    block('weather', sl.wet);
    block("the model's own uncertainty (terciles of the gap variance)", sl.variance);
    block('link between the two drivers (cross-team pairs, via shared teammates in the last 3 seasons)', sl.link);
  }
  return out.join('\n');
}

/** Detail tables of the structural metrics that the scorecard compresses. */
export function detailReport(sessions) {
  const out = [];
  for (const [s, r] of Object.entries(sessions)) {
    out.push('', `# ${s}: details`);
    out.push(
      `  movers: ${r.movers.n} valid of ${r.movers.nAll} lineage-aware team changes; new-team duel counts: ${Object.entries(r.movers.gap)
        .map(([k, g]) => `k${k}: ${g.nMovers} mover / ${g.nStayers} stayer`)
        .join(', ')}`,
    );
    out.push('  mover rating step (points, net of stable drivers):');
    out.push(`    ${pad('after', 10)}${lpad('n', 5)}${lpad('rms', 8)}${lpad('stable rms', 12)}${lpad('mean|step|', 12)}`);
    for (const [k, st] of Object.entries(r.movers.step))
      out.push(
        `    ${pad(`${k} races`, 10)}${lpad(st.n, 5)}${lpad(f3(st.rms), 8)}${lpad(f3(st.controlRms), 12)}${lpad(f3(st.meanAbs), 12)}`,
      );
    for (const [k, g] of Object.entries(r.movers.gap)) {
      out.push(
        `  frozen duels, first ${k}: log-loss movers ${f3(g.lossFrozen)} (stayers' slope), filter's own ${f3(g.lossOnline)}, coin ${f3(g.lossCoin)}; stayers frozen ${f3(g.lossFrozenStayers)}`,
      );
    }
    out.push(`  teammates of movers: ${r.teammates.n} valid lineup changes; allocation events ${r.teammates.alloc.n ?? 0}`);
    out.push('  car shocks (slope of driver change on car change):');
    for (const [name, g] of Object.entries(r.shocks.groups)) {
      out.push(
        `    ${pad(name, 32)} n ${lpad(g.n, 5)}  slope ${pad(fmtCI(g.slope), 26)} corr ${f3(g.corr)}  rms car ${f3(g.carRms)} driver ${f3(g.driverRms)}`,
      );
    }
    if (r.shocks.lineage.length) {
      out.push('  winters with a rename or takeover (car change net of stable cars; mean driver change of those who stayed):');
      for (const e of r.shocks.lineage)
        out.push(
          `    ${e.year} ${pad(e.carEvent, 9)} team ${pad(e.team, 5)} car ${lpad(e.dC.toFixed(1), 7)}  drivers ${lpad(e.dD.toFixed(1), 7)} (n ${e.n})`,
        );
    }
    out.push('  rookies: rating after k races minus after 40 (points):');
    out.push(
      `    ${Object.entries(r.rookies.curve)
        .map(([k, v]) => `k${k} ${fmtCI(v, 1)} (n ${v.n})`)
        .join('   ')}`,
    );
  }
  return out.join('\n');
}

/** Recovery and null block of a synthetic study. */
export function syntheticReport(study) {
  const lines = [
    `synthetic worlds (${study.session}, ${study.label ?? study.tauMode}): seeds ${study.seeds.join(', ')}; filter likelihood weight tau ${study.tau}`,
  ];
  const w = study.world;
  lines.push(
    `  world: sdNew ${w.sdNew}, yearD ${w.yearD}, sdC ${w.sdC}, rho ${w.rho}, winterC ${w.winterC} (x${w.regMult ?? 1} in regulation years), raceC ${w.raceC}, noise ${w.noise ?? 'gumbel'}`,
  );
  if (study.tuning)
    lines.push(`  tau tuned on a separate world: ${study.tuning.grid.map((t, i) => `${t}:${f4(study.tuning.losses[i])}`).join('  ')}`);
  return lines.join('\n');
}

/** Side-by-side of two saved evaluations (the `headline` maps), flagging changes beyond their intervals. */
export function compare(a, b, { labelA = 'A', labelB = 'B' } = {}) {
  const out = [`${pad('metric', 86)}${lpad(labelA, 12)}${lpad(labelB, 12)}${lpad('change', 10)}  note`];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  let lastGroup = '';
  for (const k of keys) {
    const d = describe(k);
    if (!d) continue;
    const va = a[k]?.est;
    const vb = b[k]?.est;
    if (!Number.isFinite(va) && !Number.isFinite(vb)) continue;
    if (d.group !== lastGroup) {
      out.push('', `## ${d.group}`);
      lastGroup = d.group;
    }
    const diff = vb - va;
    let note = '';
    // a change is flagged when the intervals do not overlap (or, for scores without intervals, by size)
    const ia = a[k];
    const ib = b[k];
    if (Number.isFinite(ia?.lo) && Number.isFinite(ib?.lo)) {
      if (ib.lo > ia.hi) note = 'up';
      else if (ib.hi < ia.lo) note = 'down';
    } else if (d.kind === 'lower' && Number.isFinite(diff) && Math.abs(diff) > 0.0005) note = diff < 0 ? 'better' : 'worse';
    out.push(
      `${pad(d.label.slice(0, 84), 86)}${lpad(f3(va), 12)}${lpad(f3(vb), 12)}${lpad(Number.isFinite(diff) ? (diff >= 0 ? '+' : '') + diff.toFixed(4) : '', 10)}  ${note}`,
    );
  }
  return out.join('\n');
}
