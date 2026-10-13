import { rm, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await rm('dist', { recursive: true, force: true });
for (const config of ['tsconfig.json', 'tsconfig.cjs.json']) {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', config], { stdio: 'inherit' });
}
await mkdir('dist/cjs', { recursive: true });
await writeFile('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }) + '\n');
// Les deux points d'entree partagent les memes classes d'erreur en CommonJS.
for (const entry of ['index', 'webhooks']) {
  await writeFile(`dist/${entry}.cjs`, `module.exports = require('./cjs/${entry}.js');\n`);
}
