// CSV export of per-weekend ratings.
import { state } from './state.js';
import { loadExportRows } from './model-loader.js';

export async function exportCSV() {
  if (!state.model) return;
  const rows = await loadExportRows();
  const h = [
    'date',
    'year',
    'round',
    'race',
    'driver',
    'constructor',
    'driverRaceRating',
    'driverQualifyingRating',
    'driverCombinedRating',
    'driverEffectiveRating',
    'driverClean60',
    'driverIncidentRating',
    'carRaceRating',
    'carQualifyingRating',
    'carCombinedRating',
    'carSurvival60',
    'carReliabilityRating',
    'carEffectiveRating',
    'packagePaceRating',
    'packageEffectiveRating',
  ];
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [h.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.year,
        r.round,
        q(r.name),
        q(r.driver),
        q(r.constructor),
        r.driverRace.toFixed(4),
        r.driverQual.toFixed(4),
        r.driverCombined.toFixed(4),
        r.driverEffective.toFixed(4),
        r.driverClean.toFixed(8),
        r.driverIncidentElo.toFixed(4),
        r.carRace.toFixed(4),
        r.carQual.toFixed(4),
        r.carCombined.toFixed(4),
        r.carSurvival.toFixed(8),
        r.carReliabilityElo.toFixed(4),
        r.carEffective.toFixed(4),
        r.packagePace.toFixed(4),
        r.packageEffective.toFixed(4),
      ].join(','),
    );
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = 'driver_or_car_ratings_since_2000_CC-BY-NC-SA-4.0.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
