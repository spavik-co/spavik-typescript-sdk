import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('.');
const work = await mkdtemp(join(tmpdir(), 'spavik-package-'));
try {
  const report = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', work], { encoding: 'utf8' }));
  const packed = Array.isArray(report) ? report[0] : report['spavik'];
  assert(packed.files.some(file => file.path === 'dist/esm/index.d.ts'));
  assert(packed.files.some(file => file.path === 'dist/cjs/index.d.ts'));
  assert(!packed.files.some(file => file.path.startsWith('types/')));
  const consumer = join(work, 'consumer');
  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(work, packed.filename)], { cwd: consumer, stdio: 'pipe' });
  const manifest = JSON.parse(await readFile(join(consumer, 'node_modules/spavik/package.json'), 'utf8'));
  assert.equal(manifest.name, 'spavik');
  assert.equal(manifest.license, 'Apache-2.0');
  for (const name of ['LICENSE', 'NOTICE', 'CHANGELOG.md']) assert(packed.files.some(file => file.path === name));
  assert(!packed.files.some(file => /(^|\/)\.env($|\.)/.test(file.path)));
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);

  const verify = `
    const assert = await import('node:assert/strict');
    const { createHmac } = await import('node:crypto');
    const sdk = loadRoot();
    const webhook = loadWebhook();
    assert.equal(typeof sdk.Spavik, 'function');
    const calls = [];
    const client = new sdk.Spavik({ apiKey: 'sk-spv-api-fixture', baseUrl: 'https://fixture.invalid',
      fetch: async (url, init) => {
        calls.push({url, init});
        return new Response(JSON.stringify({ credit_balance: 7 }), {headers: {'content-type':'application/json'}});
      }
    });
    assert.equal((await client.usage()).credit_balance, 7);
    assert.equal(calls[0].init.headers['X-Spavik-Api-Key'], 'sk-spv-api-fixture');
    assert.equal(calls[0].url, 'https://fixture.invalid/v1/usage');
    const body = '{"type":"model.trained"}';
    const stamp = Math.floor(Date.now() / 1000);
    const signature = 't=' + stamp + ',v1=' + createHmac('sha256', 'fixture').update(stamp + '.').update(body).digest('hex');
    assert.equal((await webhook.verifier(body, {'Spavik-Signature':signature}, 'fixture')).type, 'model.trained');
    await assert.rejects(webhook.verifier(body, {}, 'fixture'), sdk.SpavikSignatureError);
    assert.equal(webhook.verifier, sdk.verifier);
    delete globalThis.crypto;
    assert.equal((await webhook.verifier(body, {'Spavik-Signature':signature}, 'fixture')).type, 'model.trained');
  `;
  await writeFile(join(consumer, 'esm.mjs'), `import * as rootModule from 'spavik';
import * as webhookModule from 'spavik/webhooks';
const loadRoot = () => rootModule;
const loadWebhook = () => webhookModule;
${verify}`);
  await writeFile(join(consumer, 'commonjs.cjs'), `const loadRoot = () => require('spavik');
const loadWebhook = () => require('spavik/webhooks');
(async () => { ${verify} })().catch(error => { console.error(error); process.exitCode = 1; });`);
  for (const file of ['esm.mjs', 'commonjs.cjs']) {
    execFileSync(process.execPath, [file], { cwd: consumer, stdio: 'inherit' });
  }
  for (const extension of ['mts', 'cts']) {
    await cp(join(root, 'test/types/consumer.ts'), join(consumer, `consumer.${extension}`));
  }
  const compilerOptions = { strict: true, noEmit: true, target: 'ES2022', lib: ['ES2022', 'DOM'], types: [], module: 'NodeNext', moduleResolution: 'NodeNext', skipLibCheck: false };
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions, include: ['*.mts', '*.cts']}));
  const tsc = join(root, 'node_modules/typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '-p', consumer], { stdio: 'inherit' });
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {...compilerOptions, module: 'ESNext', moduleResolution: 'Bundler'}, include: ['*.mts']}));
  execFileSync(process.execPath, [tsc, '-p', consumer], { stdio: 'inherit' });
  console.log('Installed archive verified: JavaScript ESM/CommonJS, shared errors, TypeScript NodeNext/Bundler, no runtime dependencies.');
} finally {
  await rm(work, { recursive: true, force: true });
}
