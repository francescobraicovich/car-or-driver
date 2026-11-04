import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script = 'research/prediction-markets/backtest/run.mjs';
const fixture = 'research/prediction-markets/backtest/synthetic-example.json';
const execution = spawnSync(process.execPath, [script, fixture], { encoding: 'utf8' });
assert.equal(execution.status, 0, execution.stderr);
const report = JSON.parse(execution.stdout);
assert.equal(report.dataClassification, 'synthetic demonstration');
assert.equal(report.result.fills.length, 2);
assert.ok(Math.abs(report.result.profit - 0.2) < 1e-9);
const invalid = spawnSync(process.execPath, [script], { encoding: 'utf8' });
assert.equal(invalid.status, 1);
assert.match(invalid.stderr, /Usage:/);
const unverified = spawnSync(process.execPath, [script, 'research/prediction-markets/polymarket/british-2026-hamilton-verstappen.json'], {
  encoding: 'utf8',
});
assert.equal(unverified.status, 1);
assert.match(unverified.stderr, /Verified coverage/);
console.log('PASS market-making command line');
