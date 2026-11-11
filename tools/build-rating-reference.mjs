// A small display supplement lets the first-screen file use the same dated references as the full history.
import { readFile, writeFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { buildRatingReference } from '../site/js/rating-reference.js';

const { model, sourceHash, licence } = deserialize(await readFile('data/model.json', 'utf8'));
const reference = { ...buildRatingReference(model, sourceHash), licence };
await writeFile('data/rating-reference.json', `${JSON.stringify(reference)}\n`);
console.log(`Published ${reference.snapshots.length} rating references with a ${reference.halfLife}-weekend half-life.`);
