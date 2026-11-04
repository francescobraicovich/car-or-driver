// Regenerate only from the original pre-form 619-weekend reference.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { loadData } from '../packages/research/node/common.mjs';
import { collectExam } from '../packages/core/src/state-space/exam.js';
import { runPublishedRatings } from '../packages/core/src/state-space/build.js';
import { ratingDigest, ratingValues } from '../research/current-form/rating-digest.mjs';
import { ratingSignature } from './rating-signature.mjs';

const data = await loadData();
const { model, weekends } = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
const reference = weekends.slice(0, 619);
assert.equal(String(reference.at(-1)?.info.raceId), '1186', 'reference calendar ends at race 1186');
const runs = runPublishedRatings(reference, model.params.tmBoost);
const digest = '941ccb58a8b3a3d7a939c22c2fe0065a8085fe9b60228a44adeaa56a63604048';
assert.equal(ratingDigest(runs), digest, 'original raw digest must match before generating the fixture');
const signature = ratingSignature(ratingValues(runs));
await writeFile('tests/fixtures/long-term-rating-signature.json', `${JSON.stringify({ referenceDigest: digest, ...signature })}\n`);
console.log(`Generated signature for ${signature.count} numbers in ${signature.chunks.length} chunks`);
