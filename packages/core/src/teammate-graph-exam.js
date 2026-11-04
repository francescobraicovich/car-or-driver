import { MODEL_SETTINGS } from './presets/model-settings.js';
import { createTeammateGraph } from './teammate-graph.js';

// Keep only one observation per pair and session. Equal-quality conflicting
// duplicates provide no unambiguous comparison, independent of row order.
function selectObservation(selected, candidate) {
  const key = JSON.stringify([candidate.a, candidate.b]);
  const old = selected.get(key);
  if (!old || candidate.priority > old.priority || (candidate.priority === old.priority && candidate.weight > old.weight)) {
    selected.set(key, candidate);
  } else if (candidate.priority === old.priority && candidate.weight === old.weight && candidate.outcome !== old.outcome) {
    old.conflict = true;
  }
}

export function teammateGraphExam(weekends, options) {
  const graph = (options.createGraph ?? createTeammateGraph)(options);
  return weekends.map((weekend) => {
    const entrants = new Map(weekend.rows.map((row) => [String(row.driverId), String(row.constructorId)]));
    const qualifying = new Map();
    const race = new Map();
    for (const { ob, session } of weekend.replayObs) {
      let a = String(ob.x.driverId);
      let b = String(ob.y.driverId);
      if (a === b || !entrants.has(a) || !entrants.has(b) || entrants.get(a) !== entrants.get(b)) continue;
      if (ob.obs !== 0 && ob.obs !== 1) continue;
      let outcome = ob.obs === 1 ? 1 : -1;
      if (a > b) {
        [a, b] = [b, a];
        outcome = -outcome;
      }
      if (
        session === 'qual' &&
        ['q1', 'q2', 'q3'].includes(ob.seg) &&
        Number.isFinite(ob.tx) &&
        Number.isFinite(ob.ty) &&
        ob.tx !== ob.ty
      ) {
        selectObservation(qualifying, { a, b, outcome, weight: 1, priority: 1, source: 'qual' });
      } else if (session === 'race') {
        const priority = { finish: 3, paceW: 2, partial: 1 }[ob.source];
        if (!priority || !(ob.base > 0) || !Number.isFinite(ob.base)) continue;
        const coverage = ob.source === 'finish' ? 1 : ob.base / (ob.source === 'paceW' ? MODEL_SETTINGS.paceW : 1);
        selectObservation(race, { a, b, outcome, weight: 1.5 * Math.min(1, coverage), priority, source: ob.source });
      }
    }
    const observations = [...qualifying.values(), ...race.values()].filter((item) => !item.conflict);
    return { raceId: String(weekend.info.raceId), observations, ...graph.advance(weekend.info.date, entrants.keys(), observations) };
  });
}
