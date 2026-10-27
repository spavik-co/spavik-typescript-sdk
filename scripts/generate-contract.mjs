// Regenere les constantes depuis le contrat SDK versionne, sans reseau.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const data = JSON.parse(await readFile(new URL('contract/sdk.json', root), 'utf8'));
const literal = value => JSON.stringify(value, null, 2);
const names = Object.keys(data.OPERATIONS).map(name => JSON.stringify(name)).join(' | ');
const output = `// Genere par scripts/generate-contract.mjs ; ne pas modifier directement.
import type { OperationInfo } from './types.js';

export const API_VERSION = ${literal(data.API_VERSION)};
export const CONTRACT_SOURCE = ${literal(data.CONTRACT_SOURCE)};
export const OPERATIONS: Record<${names}, OperationInfo> = ${literal(data.OPERATIONS)};
export const ERROR_FAMILY_BY_CODE: Record<string, string> = ${literal(data.ERROR_FAMILY_BY_CODE)};
export const KEY_PREFIXES = ${literal(data.KEY_PREFIXES)};
`;
const target = new URL('src/contract.ts', root);
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== output) {
    throw new Error('Generated contract is stale. Run npm run contract.');
  }
  console.log('Generated contract is current.');
} else {
  await writeFile(target, output);
}
