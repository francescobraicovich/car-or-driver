import { readFile } from 'node:fs/promises';
import { replayMarket } from './replay.mjs';

try {
  if (process.argv.length !== 3) throw new Error('Usage: node research/prediction-markets/backtest/run.mjs INPUT.json');
  const document = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const report = {
    dataClassification: document.dataClassification === 'synthetic' ? 'synthetic demonstration' : 'unverified input',
    warning: 'Research simulation; results depend on input quality and execution assumptions.',
    result: replayMarket(document.input ?? document, document.options),
  };
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
