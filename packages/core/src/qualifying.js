// Qualifying helpers: time parsing, disruption treatment, pairwise observations.
export function parseQualTime(s) {
  s = (s || '').trim();
  if (!s || s === '\\N') return NaN;
  const a = s.split(':');
  let sec;
  if (a.length === 2) sec = 60 * +a[0] + +a[1];
  else sec = +s;
  return Number.isFinite(sec) ? sec : NaN;
}

/**
 * Classify a qualifying row: which session is the deepest valid evidence,
 * and whether a later expected session was disrupted (censored, not slow).
 */
export function qualifyingTreatment(q, year) {
  const pos = +q.position;
  const t1 = parseQualTime(q.q1);
  const t2 = parseQualTime(q.q2);
  const t3 = parseQualTime(q.q3);
  if (!Number.isFinite(t1)) {
    return { deep: '—', treatment: 'No valid Q1 time — qualifying pace censored', disrupted: true };
  }
  if (year >= 2006 && pos <= 10 && !Number.isFinite(t3)) {
    return {
      deep: Number.isFinite(t2) ? 'Q2' : 'Q1',
      treatment: 'Expected Q3 but no valid Q3 time — Q3 disrupted/censored',
      disrupted: true,
    };
  }
  if (year >= 2006 && pos <= 15 && !Number.isFinite(t2)) {
    return { deep: 'Q1', treatment: 'Expected Q2 but no valid Q2 time — Q2 disrupted/censored', disrupted: true };
  }
  return {
    deep: Number.isFinite(t3) ? 'Q3' : Number.isFinite(t2) ? 'Q2' : 'Q1',
    treatment: 'Valid timed qualifying evidence',
    disrupted: false,
  };
}

/**
 * Build pairwise observations comparing the latest segment in which BOTH
 * drivers set a valid time (Q3 > Q2 > Q1). Never compare across segments.
 */
export function buildQualObservations(qrows) {
  const segs = ['q1', 'q2', 'q3'];
  const rank = {};
  for (const s of segs) {
    const arr = qrows
      .map((q) => ({ id: q.driverId, t: parseQualTime(q[s]) }))
      .filter((x) => Number.isFinite(x.t))
      .sort((a, b) => a.t - b.t);
    rank[s] = new Map(arr.map((x, i) => [x.id, i + 1]));
  }
  const obs = [];
  for (let i = 0; i < qrows.length; i++) {
    for (let j = i + 1; j < qrows.length; j++) {
      const x = qrows[i];
      const y = qrows[j];
      let seg = null,
        tx,
        ty;
      for (const s of ['q3', 'q2', 'q1']) {
        tx = parseQualTime(x[s]);
        ty = parseQualTime(y[s]);
        if (Number.isFinite(tx) && Number.isFinite(ty)) {
          seg = s;
          break;
        }
      }
      if (!seg) continue;
      const rx = rank[seg].get(x.driverId);
      const ry = rank[seg].get(y.driverId);
      if (!rx || !ry || rx === ry) continue;
      obs.push({ x, y, obs: tx < ty ? 1 : 0, gap: Math.abs(rx - ry), dt: Math.abs(tx - ty), seg, tx, ty });
    }
  }
  return obs;
}
