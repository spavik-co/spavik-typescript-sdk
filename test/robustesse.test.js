// Robustesse des entrees, du transport et des retours.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  Model, Spavik, SpavikDataError, SpavikError, SpavikRateLimited, SpavikSignatureError, SpavikTransportError, verify,
} from '../dist/esm/index.js';
import { ApiSimulee, CHURN, CLE, erreur } from './api-simulee.js';

function client(api, options = {}) {
  return new Spavik({ apiKey: CLE, baseUrl: 'http://api.test', fetch: api.fetch, backoff: () => 0, ...options });
}

const lent = (ms) => async (_url, init) => new Promise((resolve, reject) => {
  const minuterie = setTimeout(() => resolve(Response.json({ plan: 'free' })), ms);
  init.signal.addEventListener('abort', () => { clearTimeout(minuterie); reject(init.signal.reason); }, { once: true });
});

test('the client timeout replaces the operation deadline', async () => {
  const spavik = new Spavik({ apiKey: 'k', timeout: 20, maxRetries: 1, fetch: lent(300) });
  const debut = Date.now();
  await assert.rejects(() => spavik.usage(), (exc) => exc instanceof SpavikTransportError && /timed out/.test(exc.message));
  assert.ok(Date.now() - debut < 250);
  // Plus long que le delai par defaut d'une operation : il est respecte aussi.
  const patient = new Spavik({ apiKey: 'k', timeout: 1000, maxRetries: 1, fetch: lent(30) });
  assert.equal((await patient.usage()).plan, 'free');
});

test('an invalid timeout is refused', () => {
  for (const timeout of [0, -1, Number.NaN, '50']) {
    assert.throws(() => new Spavik({ apiKey: 'k', timeout }), SpavikDataError);
  }
});

test('models() follows has_more past 200 models and caps the page size', async () => {
  const api = new ApiSimulee();
  for (let i = 0; i < 450; i += 1) {
    const id = `mdl_${String(i).padStart(4, '0')}`;
    api.modeles.set(id, { id, latest_version: 1 });
  }
  const vus = [];
  for await (const m of client(api).models({ limit: 500 })) vus.push(m.id);
  assert.equal(vus.length, 450);
  assert.equal(new Set(vus).size, 450);
  const pages = api.appels.filter((a) => a.chemin === '/v1/models');
  assert.deepEqual(pages.map((a) => a.params.get('limit')), ['200', '200', '200']);
  assert.deepEqual(pages.map((a) => a.params.get('offset')), ['0', '200', '400']);
});

test('models() stops on an empty page or has_more false', async () => {
  let appels = 0;
  const spavik = new Spavik({ apiKey: 'k', fetch: async () => {
    appels += 1;
    return Response.json({ data: appels === 1 ? [{ id: 'mdl_a' }] : [], pagination: { has_more: true } });
  } });
  const vus = [];
  for await (const m of spavik.models({ limit: 1 })) vus.push(m.id);
  assert.deepEqual(vus, ['mdl_a']);
  assert.equal(appels, 2);
  await assert.rejects(async () => { for await (const _ of spavik.models({ limit: 0 })); }, SpavikDataError);
});

test('a caller idempotency key is sent and reused on every attempt', async () => {
  const api = new ApiSimulee();
  const spavik = client(api);
  const modele = await spavik.train(CHURN, { target: 'churn', idempotencyKey: 'train-key' });
  api.repondra(`/v1/models/${modele.id}/predict`, erreur(503, 'ENGINE_UNAVAILABLE'));
  await modele.predict({ plan: 'pro' }, { idempotencyKey: 'predict-key' });
  await modele.submitOutcomes({ features: { plan: 'pro' }, actual: 1 }, { idempotencyKey: 'outcomes-key' });
  await modele.refresh({ idempotencyKey: 'refresh-key' });
  const serie = Array.from({ length: 28 }, (_, i) => ({ date: `2026-07-${i + 1}`, ventes: i }));
  await spavik.forecast(serie, { target: 'ventes', horizon: 2, idempotencyKey: 'forecast-key' });
  const cles = (fin) => api.appels.filter((a) => a.chemin.endsWith(fin) && a.methode === 'POST').map((a) => a.entetes['Idempotency-Key']);
  assert.deepEqual(cles('/v1/models'), ['train-key']);
  assert.deepEqual(cles('/predict'), ['predict-key', 'predict-key']);
  assert.deepEqual(cles('/outcomes'), ['outcomes-key']);
  assert.deepEqual(cles('/refresh'), ['refresh-key']);
  assert.deepEqual(cles('/v1/forecast'), ['forecast-key']);
  for (const idempotencyKey of ['', 'x'.repeat(256), 42]) {
    await assert.rejects(() => modele.predict({ plan: 'pro' }, { idempotencyKey }), SpavikDataError);
  }
});

test('a failed call can be replayed with its key without a second charge', async () => {
  const api = new ApiSimulee();
  const modele = await client(api).train(CHURN, { target: 'churn' });
  // La reponse est perdue apres le debit : la premiere tentative a abouti cote API.
  const chemin = `/v1/models/${modele.id}/predict`;
  const depart = api.solde;
  let erreurFinale;
  const perdu = client(api, { maxRetries: 1, fetch: async (url, init) => {
    await api.fetch(url, init);
    throw new TypeError('socket closed');
  } });
  await assert.rejects(() => new Model(perdu, { id: modele.id }).predict({ plan: 'pro' }), (exc) => { erreurFinale = exc; return true; });
  assert.ok(erreurFinale.idempotencyKey);
  await modele.predict({ plan: 'pro' }, { idempotencyKey: erreurFinale.idempotencyKey });
  assert.equal(depart - api.solde, 1);
  assert.equal(api.compte(chemin), 2);
});

test('evaluate sends task and max_samples, never engine_family', async () => {
  const api = new ApiSimulee();
  await client(api).evaluate(CHURN, { target: 'churn', task: 'classification', maxSamples: 500, explain: true });
  assert.deepEqual(api.appels.at(-1).corps, { target: 'churn', data: CHURN, task: 'classification', max_samples: 500, explain: true });
  await assert.rejects(() => client(api).evaluate(CHURN, { target: 'churn', engineFamily: 'presage' }),
    (exc) => exc instanceof SpavikDataError && /unknown option 'engineFamily'/.test(exc.message));
});

test('unknown options are refused by name, with nothing sent', async () => {
  const api = new ApiSimulee();
  const spavik = client(api);
  const modele = new Model(spavik, { id: 'mdl_x' });
  const cas = [
    () => spavik.train(CHURN, { target: 'churn', engine: 'presage-2' }),
    () => spavik.forecast(CHURN, { target: 'churn', horizon: 1, explain: true }),
    () => spavik.backtest(CHURN, { target: 'churn', horizn: 2 }),
    () => modele.predict(CHURN, { engine: 'presage-2' }),
    () => modele.submitOutcomes({ features: { a: 1 }, actual: 1 }, { key: 'x' }),
    () => modele.refresh({ force: true }),
    async () => { for await (const _ of spavik.models({ page: 2 })); },
  ];
  for (const appel of cas) {
    await assert.rejects(appel, (exc) => exc instanceof SpavikDataError && /unknown option '/.test(exc.message) && /Nothing was sent/.test(exc.message));
  }
  await assert.rejects(() => spavik.backtest(CHURN, { target: 'churn', horizn: 2 }), /Did you mean 'horizon'\?/);
  assert.throws(() => new Spavik({ apiKey: 'k', retries: 2 }), /unknown option 'retries'/);
  assert.equal(api.appels.length, 0);
});

test('train without options names the missing target', async () => {
  const api = new ApiSimulee();
  for (const options of [undefined, {}, { target: '' }]) {
    await assert.rejects(() => client(api).train(CHURN, options), (exc) => {
      assert.ok(exc instanceof SpavikDataError);
      assert.match(exc.message, /^train: the target option is required/);
      return true;
    });
  }
  await assert.rejects(() => client(api).train(CHURN, 'churn'), /options must be an object/);
  await assert.rejects(() => client(api).evaluate(CHURN), /evaluate: the target option is required/);
  assert.equal(api.appels.length, 0);
});

test('a body JSON cannot encode is a data error, without retry or request', async () => {
  let appels = 0;
  const attentes = [];
  const spavik = new Spavik({ apiKey: 'k', fetch: async () => { appels += 1; return Response.json({}); }, backoff: (n) => { attentes.push(n); return 0; } });
  await assert.rejects(() => new Model(spavik, { id: 'mdl_x' }).predict([{ n: 10n }]), (exc) => {
    assert.ok(exc instanceof SpavikDataError);
    assert.match(exc.message, /^prediction: the data cannot be converted to JSON/);
    return true;
  });
  assert.equal(appels, 0);
  assert.deepEqual(attentes, []);
});

test('a Retry-After beyond 60 s raises SpavikRateLimited without waiting', async () => {
  for (const [statut, code] of [[429, 'TOO_MANY_REQUESTS'], [503, 'ENGINE_UNAVAILABLE']]) {
    let appels = 0;
    const spavik = new Spavik({ apiKey: 'k', fetch: async () => {
      appels += 1;
      return new Response(JSON.stringify({ message: code }), { status: statut, headers: { 'content-type': 'application/json', 'Retry-After': '3600', 'X-Spavik-Request-Id': 'req_wait' } });
    } });
    const debut = Date.now();
    await assert.rejects(() => spavik.usage(), (exc) => {
      assert.ok(exc instanceof SpavikRateLimited);
      assert.equal(exc.code, code);
      assert.equal(exc.requestId, 'req_wait');
      assert.match(exc.message, /wait 3600 s before retrying, beyond the 60 s/);
      return true;
    });
    assert.equal(appels, 1);
    assert.ok(Date.now() - debut < 1000);
  }
});

test('a Retry-After within 60 s is still honoured', async () => {
  const api = new ApiSimulee();
  api.repondra('/v1/usage', new Response(JSON.stringify({ message: 'TOO_MANY_REQUESTS' }), { status: 429, headers: { 'content-type': 'application/json', 'Retry-After': '0' } }));
  await client(api).usage();
  assert.equal(api.compte('/v1/usage'), 2);
});

test('model identifiers are encoded into the path', async () => {
  const urls = [];
  const spavik = new Spavik({ apiKey: 'k', baseUrl: 'https://api.test', fetch: async (url) => { urls.push(url); return Response.json({ id: 'x' }); } });
  await spavik.model('../usage');
  await new Model(spavik, { id: 'a/b?c' }).performance();
  assert.equal(urls[0], 'https://api.test/v1/models/..%2Fusage');
  assert.equal(new URL(urls[1]).pathname, '/v1/models/a%2Fb%3Fc/performance');
});

test('Model.restore() and Spavik.restore() return the model from the API', async () => {
  const api = new ApiSimulee();
  const spavik = client(api);
  const modele = await spavik.train(CHURN, { target: 'churn' });
  await modele.archive();
  const rendu = await spavik.restore(modele.id);
  assert.ok(rendu instanceof Model);
  assert.equal(rendu.id, modele.id);
  assert.equal(rendu.status, 'ready');
  await modele.archive();
  assert.equal(await modele.restore(), modele);
  assert.equal(modele.status, 'ready');
});

test('forecast checks itemId and every series length locally', async () => {
  const api = new ApiSimulee();
  const serie = [
    ...Array.from({ length: 20 }, (_, i) => ({ store: 'a', sales: i })),
    ...Array.from({ length: 3 }, (_, i) => ({ store: 'b', sales: i })),
  ];
  await assert.rejects(() => client(api).forecast(serie, { target: 'sales', horizon: 7, itemId: 'shop' }),
    /the item_id column 'shop' is missing from the data/);
  await assert.rejects(() => client(api).forecast(serie, { target: 'sales', horizon: 7, itemId: 'store' }),
    (exc) => exc instanceof SpavikDataError && exc.message.startsWith("the series 'b' has 3 point(s) for a horizon of 7."));
  assert.equal(api.appels.length, 0);
  await client(api).forecast(serie, { target: 'sales', horizon: 3, itemId: 'store' });
  assert.equal(api.compte('/v1/forecast'), 1);
});

test('a training response without a model id is a clear error', async () => {
  const spavik = new Spavik({ apiKey: 'k', fetch: async () => new Response('{}', { status: 201, headers: { 'content-type': 'application/json', 'X-Spavik-Request-Id': 'req_empty' } }) });
  await assert.rejects(() => spavik.train(CHURN, { target: 'churn', idempotencyKey: 'k1' }), (exc) => {
    assert.ok(exc instanceof SpavikError);
    assert.match(exc.message, /without a model identifier/);
    assert.equal(exc.requestId, 'req_empty');
    assert.equal(exc.idempotencyKey, 'k1');
    return true;
  });
});

test('metadata lives in properties, never in returned objects', async () => {
  const api = new ApiSimulee();
  const spavik = client(api);
  const usage = await spavik.usage();
  assert.equal(usage.requestId, 'req_simule200');
  assert.equal(Object.keys(usage).some((cle) => cle.startsWith('_')), false);
  assert.equal(JSON.stringify(usage).includes('requestId'), false);
  const modele = await spavik.train(CHURN, { target: 'churn' });
  assert.equal(Object.keys(modele.data).some((cle) => cle.startsWith('_')), false);
  const prediction = await modele.predict({ plan: 'pro' });
  assert.equal(Object.keys(prediction.data).some((cle) => cle.startsWith('_')), false);
  assert.equal(prediction.requestId, 'req_simule200');
  assert.equal(typeof prediction.predictionsRemaining, 'number');
  assert.equal(prediction.engineVersion, null);
});

test('verify refuses a missing secret and reads array headers', async () => {
  const corps = '{"type":"model.trained"}';
  const t = Math.floor(Date.now() / 1000);
  const signature = `t=${t},v1=${createHmac('sha256', 'whsec').update(`${t}.`).update(corps).digest('hex')}`;
  for (const secret of ['', undefined, null]) {
    await assert.rejects(() => verify(corps, { 'spavik-signature': signature }, secret), (exc) => {
      assert.ok(exc instanceof SpavikSignatureError);
      assert.equal(exc.message, 'missing webhook secret');
      return true;
    });
  }
  assert.equal((await verify(corps, { 'spavik-signature': [signature, 'ignored'] }, 'whsec')).type, 'model.trained');
  await assert.rejects(() => verify(corps, { 'spavik-signature': [] }, 'whsec'), SpavikSignatureError);
  await assert.rejects(() => verify(corps, { 'spavik-signature': [42] }, 'whsec'), SpavikSignatureError);
});
