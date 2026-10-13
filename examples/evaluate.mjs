import { fileURLToPath } from 'node:url';
import { Spavik } from '../dist/esm/index.js';

if (process.argv.includes('--help')) {
  console.log('Usage: node examples/evaluate.mjs [csv-path]');
  process.exit(0);
}
if (!process.env.SPAVIK_API_KEY) throw new Error('Set SPAVIK_API_KEY in your environment.');
const csv = process.argv[2] ?? fileURLToPath(new URL('./data/churn.csv', import.meta.url));
const client = new Spavik();
const report = await client.evaluate(csv, { target: 'churn' });
console.log(JSON.stringify(report, null, 2));
