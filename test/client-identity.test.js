import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spavik, VERSION } from '../dist/esm/index.js';

for (const userAgent of [undefined, 'mon-agent/1.0']) {
test(`client identity and User-Agent ${userAgent ?? 'default'} survive retries`, async () => {
  let calls = 0;
  const client = new Spavik({
    apiKey: 'fixture-key', userAgent, baseUrl: 'https://api.test', backoff: () => 0,
    fetch: async (url, options) => {
      const headers = new Headers(options.headers);
      assert.equal(headers.get('X-Spavik-Client-Name'), 'spavik-sdk-javascript');
      assert.equal(headers.get('X-Spavik-Client-Version'), VERSION);
      assert.equal(headers.get('User-Agent'), userAgent ?? `spavik-javascript/${VERSION}`);
      assert.equal(headers.get('X-Spavik-Api-Key'), 'fixture-key');
      assert.equal(headers.has('Authorization'), false);
      assert.equal(headers.has('X-API-Key'), false);
      calls += 1;
      return new Response(JSON.stringify(calls === 1 ? { message: 'UNAVAILABLE' } : { plan: 'free' }), {
        status: calls === 1 ? 503 : 200, headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal((await client.usage()).plan, 'free');
  assert.equal(calls, 2);
});
}
