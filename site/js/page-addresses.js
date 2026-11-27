// The addresses of the pages of the drivers, the teams, the pairs of teammates, the comparisons of two drivers and the seasons, which the
// publishing script writes (tools/driver-and-team-pages.mjs) and the questions on the front page link to (question-pool.js): both take them from
// here.

/** A name as part of an address: `Kimi Räikkönen` is `kimi-raikkonen`. */
export const addressName = (name) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // (the accents NFKD splits off)
    .toLowerCase()
    .replace(/&amp;|&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A pair of teammates has a page of its own from this many Grands Prix together. */
export const TEAMMATE_PAGE_MINIMUM_RACES = 5;

/** The address of a page about two drivers, under `folder`, from the addresses of their two pages (in either order). */
const pairPath = (folder, firstPath, secondPath) => {
  const [a, b] = [firstPath, secondPath].sort();
  return `/${folder}/${a.split('/').pop()}-vs-${b.split('/').pop()}`;
};
/** The page of two teammates. */
export const teammatePath = (firstPath, secondPath) => pairPath('teammates', firstPath, secondPath);
/** The page comparing two drivers who were not teammates (or not for long). */
export const comparisonPath = (firstPath, secondPath) => pairPath('compare', firstPath, secondPath);
/** The page of a season. */
export const seasonPath = (year) => `/seasons/${year}`;
