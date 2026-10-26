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
export function qualifyingTreatment(q, year, qrows = []) {
  const pos = +q.position;
  const t1 = parseQualTime(q.q1);
  const t2 = parseQualTime(q.q2);
  const t3 = parseQualTime(q.q3);
  if (!Number.isFinite(t1)) {
    return { deep: '—', treatment: 'No valid Q1 time — qualifying pace censored', disrupted: true };
  }
  if (censoredQ1Outliers(qrows).has(q.driverId)) {
    return { deep: '—', treatment: 'Isolated extreme Q1 lap — qualifying pace censored', disrupted: true };
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
 * A lone Q1 lap far slower than both the field and the driver's teammate is
 * usually an interrupted attempt, not evidence of normal qualifying pace.
 * Require a timed teammate and a multi-session format so weak but valid laps
 * at the back of the grid are retained.
 */
export function censoredQ1Outliers(qrows) {
  if (!qrows.some((q) => Number.isFinite(parseQualTime(q.q2)))) return new Set();
  const timed = qrows
    .map((q) => parseQualTime(q.q1))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (timed.length < 10) return new Set();
  const middle = Math.floor(timed.length / 2);
  const median = timed.length % 2 ? timed[middle] : (timed[middle - 1] + timed[middle]) / 2;
  return new Set(
    qrows
      .filter((q) => {
        const lap = parseQualTime(q.q1);
        if (!Number.isFinite(lap) || Number.isFinite(parseQualTime(q.q2)) || Number.isFinite(parseQualTime(q.q3)) || lap <= median * 1.05)
          return false;
        const teammates = qrows
          .filter((other) => other.driverId !== q.driverId && other.constructorId === q.constructorId)
          .map((other) => parseQualTime(other.q1))
          .filter(Number.isFinite);
        return teammates.length > 0 && teammates.every((other) => lap > other * 1.05);
      })
      .map((q) => q.driverId),
  );
}

/**
 * Build pairwise observations comparing the latest segment in which BOTH
 * drivers set a valid time (Q3 > Q2 > Q1). Never compare across segments.
 */
export function buildQualObservations(qrows) {
  const censored = censoredQ1Outliers(qrows);
  qrows = qrows.filter((q) => !censored.has(q.driverId));
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
