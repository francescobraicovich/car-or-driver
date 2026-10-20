// The ratings list on the front page, reduced to what is printed: a rank, a name, a rating, its error bar, a bar made of characters, and the change
// since the entry's previous weekend. Pure: tested in Node.

export const BAR_WIDTH = 14;

const whole = (value) => String(Math.round(value));
const signedChange = (change) => {
  if (!Number.isFinite(change) || Math.abs(change) < 0.05) return '';
  return `${change > 0 ? '▲' : '▼'}${Math.abs(change).toFixed(1)}`;
};

/** The bar for a rating among the ratings shown: the lowest gets one block, the highest all of them. */
export function bar(value, low, high) {
  if (!Number.isFinite(value) || high <= low) return '░'.repeat(BAR_WIDTH);
  const filled = 1 + Math.round(((value - low) / (high - low)) * (BAR_WIDTH - 1));
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

/**
 * @param rows  rows from ratingRows(): { rank, name, car?, value, combinedSd, change, id }
 * @returns     rows ready to print, best first
 */
export function ledgerRows(rows) {
  const values = rows.map((row) => row.value).filter(Number.isFinite);
  const low = Math.min(...values) - 15;
  const high = Math.max(...values);
  return rows
    .filter((row) => Number.isFinite(row.value))
    .map((row, index) => ({
      id: row.id,
      rank: String(index + 1),
      name: row.name,
      team: row.car || '',
      rating: whole(row.value),
      deviation: Number.isFinite(row.combinedSd) ? `±${whole(row.combinedSd)}` : '',
      bar: bar(row.value, low, high),
      change: signedChange(row.change),
      value: row.value,
    }));
}

/** What a screen reader says for a row, instead of the bars and arrows: "1, Mercedes, rating 1101, plus or minus 16, up 3.0 since the previous weekend". */
export function spokenRow(row, subject) {
  const parts = [row.rank, row.name];
  if (subject === 'driver' && row.team) parts.push(row.team);
  parts.push(`rating ${row.rating}`);
  if (row.deviation) parts.push(`plus or minus ${row.deviation.replace('±', '')}`);
  if (row.change) parts.push(`${row.change.startsWith('▲') ? 'up' : 'down'} ${row.change.slice(1)} since the previous weekend`);
  return parts.join(', ');
}
