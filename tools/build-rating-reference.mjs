// A small display supplement lets the first-screen file use the same dated references as the full history.
// It is built from the historical ratings that Ratings, History and Graph display, so it runs after tools/build-retrospective.mjs.
import { readFile, writeFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { buildRatingReference } from '../site/js/rating-reference.js';

const { model, refitHash, licence } = deserialize(await readFile('data/retrospective.json', 'utf8'));
const reference = { ...buildRatingReference(model, refitHash), licence };
await writeFile('data/rating-reference.json', `${JSON.stringify(reference)}\n`);
console.log(
  `Published ${reference.snapshots.length} rating references: the median of the highest-rated ${reference.fieldSize.drivers} drivers and ${reference.fieldSize.cars} cars, with a ${reference.halfLife}-weekend half-life.`,
);
