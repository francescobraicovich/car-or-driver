import assert from 'node:assert/strict';
import { filterBoundaryBooks } from '../research/prediction-markets/pmdata/full-window/filter_boundary_books.mjs';

const start = Date.parse('2026-08-20T00:00:00Z');
const syntheticCandidate = { type: 'book', received: start, source: start };
const sourceNotMidnight = { type: 'book', received: start, source: start - 10 };
const subsequentBook = { type: 'book', received: start + 1, source: start };
const tradeAtBoundary = { type: 'last_trade_price', received: start, source: start };
const result = filterBoundaryBooks([syntheticCandidate, sourceNotMidnight, subsequentBook, tradeAtBoundary], start);
assert.equal(result.excluded, 1);
assert.deepEqual(result.rows, [sourceNotMidnight, subsequentBook, tradeAtBoundary]);
assert.throws(() => filterBoundaryBooks(null, start), /Capture rows/);
assert.throws(() => filterBoundaryBooks([], NaN), /finite start/);
console.log('PASS conservative PMData midnight book exclusion');
