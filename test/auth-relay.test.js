import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spavik, SpavikAuthError } from '../dist/esm/index.js';

for (const apiKey of ['', 'sk-spv-admin-fixture', 'opaque-token']) {
  for (const status of [200, 401, 403]) {
    test(`API decides credentials: ${apiKey || 'absent'}, status ${status}`, async () => {
      const previous = process.env.SPAVIK_API_KEY;
      process.env.SPAVIK_API_KEY = 'environment-must-not-leak';
      try {
        const calls = [];
        const client = new Spavik({ apiKey, fetch: async (url, options) => {
          calls.push(options);
          return new Response(JSON.stringify(status === 200 ? { plan: 'free' } : { message: 'API_KEY_INVALID' }), { status, headers: { 'content-type': 'application/json' } });
        }});
        if (status === 200) assert.equal((await client.usage()).plan, 'free');
        else await assert.rejects(() => client.usage(), SpavikAuthError);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].headers['X-Spavik-Api-Key'], apiKey || undefined);
        assert.equal(calls[0].headers.Authorization, undefined);
      } finally {
        if (previous === undefined) delete process.env.SPAVIK_API_KEY;
        else process.env.SPAVIK_API_KEY = previous;
      }
    });
  }
}

test('omitted key reads environment', () => {
  const previous = process.env.SPAVIK_API_KEY;
  try {
    process.env.SPAVIK_API_KEY = 'configured-key';
    assert.equal(new Spavik().cleApi, 'configured-key');
    delete process.env.SPAVIK_API_KEY;
    assert.equal(new Spavik().cleApi, '');
  } finally {
    if (previous === undefined) delete process.env.SPAVIK_API_KEY;
    else process.env.SPAVIK_API_KEY = previous;
  }
});
