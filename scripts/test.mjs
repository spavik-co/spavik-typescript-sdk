import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Node 18 ne developpe pas les motifs de fichiers du lanceur de tests.
const files = (await readdir('test')).filter(name => name.endsWith('.test.js')).sort();
const result = spawnSync(process.execPath, ['--test', ...files.map(name => `test/${name}`)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
