import { fileURLToPath } from 'node:url';
import { Spavik } from '../dist/esm/index.js';

if (process.argv.includes('--help')) {
  console.log('Usage: node examples/backtest.mjs [csv-path]');
  process.exit(0);
}
if (!process.env.SPAVIK_API_KEY) throw new Error('Set SPAVIK_API_KEY in your environment.');
const csv = process.argv[2] ?? fileURLToPath(new URL('./data/sales.csv', import.meta.url));
const client = new Spavik();
const report = await client.backtest(csv, { target: 'sales', horizon: 7, timestamp: 'date', itemId: 'store', pointEstimate: 'median', quantiles: [0.1, 0.5, 0.9] });
console.log(JSON.stringify(report, null, 2));
