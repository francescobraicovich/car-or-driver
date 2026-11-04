/** Conservatively omit exact-midnight books that may be reconstructed snapshots. */
export function filterBoundaryBooks(rows, start) {
  if (!Array.isArray(rows) || !Number.isFinite(start)) throw new Error('Capture rows and a finite start are required');
  const retained = rows.filter((row) => !(row.type === 'book' && row.received === start && row.source === start));
  return { rows: retained, excluded: rows.length - retained.length };
}
