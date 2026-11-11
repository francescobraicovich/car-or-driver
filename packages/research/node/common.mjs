// Shared node harness: load the vendored CSVs, build models, score backtests.
import { readFile } from 'node:fs/promises';
import { REQUIRED_CSVS, createDataset } from '../../core/src/dataset.js';

const OPTIONAL = ['circuits.csv']; // absent: no circuit names or home-race flags

/** Load `dir` into `{ raw, maps, lapSnapshots, lapPace }` (no global state). */
export async function loadData(dir = 'data') {
  const texts = {};
  await Promise.all(
    [...REQUIRED_CSVS, 'lap_times.csv', ...OPTIONAL].map(async (name) => {
      try {
        texts[name] = await readFile(`${dir}/${name}`, 'utf8');
      } catch (e) {
        if (!OPTIONAL.includes(name)) throw e;
      }
    }),
  );
  return createDataset(texts);
}
