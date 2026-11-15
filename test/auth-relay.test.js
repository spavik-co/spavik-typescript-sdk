import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spavik, SpavikAuthError } from '../dist/esm/index.js';

const SANS_CLE = 'no API key: set SPAVIK_API_KEY or pass apiKey. Nothing was sent.';

function avecEnv(nom, valeur, corps) {
  const previous = process.env[nom];
  if (valeur === undefined) delete process.env[nom];
  else process.env[nom] = valeur;
  try {
    return corps();
  } finally {
    if (previous === undefined) delete process.env[nom];
    else process.env[nom] = previous;
  }
}

for (const apiKey of ['sk-spv-admin-fixture', 'opaque-token']) {
  for (const status of [200, 401, 403]) {
    test(`API decides credentials: ${apiKey}, status ${status}`, () => avecEnv('SPAVIK_API_KEY', 'environment-must-not-leak', async () => {
      const calls = [];
      const client = new Spavik({ apiKey, fetch: async (url, options) => {
        calls.push(options);
        return new Response(JSON.stringify(status === 200 ? { plan: 'free' } : { message: 'API_KEY_INVALID' }), { status, headers: { 'content-type': 'application/json' } });
      }});
      if (status === 200) assert.equal((await client.usage()).plan, 'free');
      else await assert.rejects(() => client.usage(), SpavikAuthError);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].headers['X-Spavik-Api-Key'], apiKey);
      assert.equal(calls[0].headers.Authorization, undefined);
    }));
  }
}

test('without a key, nothing is sent and the error says how to fix it', () => avecEnv('SPAVIK_API_KEY', 'environment-must-not-leak', async () => {
  const calls = [];
  // Une chaine vide ne reprend pas la cle de l'environnement.
  const client = new Spavik({ apiKey: '', fetch: async () => { calls.push(1); return Response.json({}); } });
  for (const appel of [() => client.usage(), () => client.model('mdl_x'), () => client.restore('mdl_x')]) {
    await assert.rejects(appel, (exc) => {
      assert.ok(exc instanceof SpavikAuthError);
      assert.equal(exc.message, SANS_CLE);
      return true;
    });
  }
  assert.equal(calls.length, 0);
}));

test('public routes need no key', () => avecEnv('SPAVIK_API_KEY', undefined, async () => {
  const calls = [];
  const client = new Spavik({ fetch: async (url, options) => {
    calls.push(options);
    return Response.json(new URL(url).pathname === '/v1/engines' ? [{ id: 'presage-2' }] : [{ id: 'presage', label: 'Presage', is_default: true }]);
  } });
  assert.equal((await client.engines())[0].id, 'presage-2');
  assert.equal((await client.engineFamilies())[0].id, 'presage');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['X-Spavik-Api-Key'], undefined);
}));

for (const code of ['TOKEN_INVALID', 'AUTH_REQUIRED']) {
  test(`${code} from the gateway is an authentication error`, async () => {
    const client = new Spavik({ apiKey: 'sk-spv-api-fixture', fetch: async () => new Response(
      JSON.stringify({ status: 'error', message: code, messageDetail: 'Access token is invalid or expired.' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ) });
    await assert.rejects(() => client.usage(), (exc) => exc instanceof SpavikAuthError && exc.code === code);
  });
}

test('omitted key reads environment', () => {
  avecEnv('SPAVIK_API_KEY', 'configured-key', () => assert.equal(new Spavik().cleApi, 'configured-key'));
  avecEnv('SPAVIK_API_KEY', undefined, () => assert.equal(new Spavik().cleApi, ''));
});

test('SPAVIK_BASE_URL is read when the client is built, not at import', () => {
  avecEnv('SPAVIK_BASE_URL', 'https://test-api.example.invalid/', () => {
    assert.equal(new Spavik({ apiKey: 'k' }).baseUrl, 'https://test-api.example.invalid');
  });
  avecEnv('SPAVIK_BASE_URL', undefined, () => {
    assert.equal(new Spavik({ apiKey: 'k' }).baseUrl, 'https://api.spavik.co');
  });
  avecEnv('SPAVIK_BASE_URL', 'https://ignored.example.invalid', () => {
    assert.equal(new Spavik({ apiKey: 'k', baseUrl: 'https://explicit.example.invalid' }).baseUrl, 'https://explicit.example.invalid');
  });
});

test('without process, the client still builds and refuses locally', async () => {
  const descripteur = Object.getOwnPropertyDescriptor(globalThis, 'process');
  const client = (() => {
    Object.defineProperty(globalThis, 'process', { value: undefined, configurable: true, writable: true });
    try {
      return new Spavik({ fetch: async () => Response.json({}) });
    } finally {
      Object.defineProperty(globalThis, 'process', descripteur);
    }
  })();
  assert.equal(client.cleApi, '');
  assert.equal(client.baseUrl, 'https://api.spavik.co');
  await assert.rejects(() => client.usage(), SpavikAuthError);
});
