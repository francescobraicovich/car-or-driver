import { findMoves, findTeamChanges } from './events.js';
import { arrivalImpact, teammateMetrics } from './teammates.js';
import { shockMetrics } from './shocks.js';
import { revisionMetrics } from './diagnostics.js';

/** Structural diagnostics for the same rating snapshots used by the website. */
export function structuralDiagnostics(idx, run, { fromYear = 2008, toYear = 2025, boot = {} } = {}) {
  const changes = findTeamChanges(idx, findMoves(idx)).filter((change) => change.year >= fromYear && change.year <= toYear);
  return {
    teammates: teammateMetrics(idx, run, changes, { boot }),
    teammateArrivals: arrivalImpact(idx, run, changes, { boot }),
    shocks: shockMetrics(idx, run, { fromYear, toYear, boot }),
    revisions: revisionMetrics(idx, run, { fromYear, toYear, boot }),
  };
}
