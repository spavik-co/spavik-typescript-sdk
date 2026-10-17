// Transport : erreurs typees, reprises, idempotence, reponses illisibles.
// Memes cas que du cote Python, dans le meme ordre.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  Spavik, SpavikCreditsExhausted, SpavikNotFound, SpavikTransportError, SpavikValidationError,
} from '../dist/esm/index.js';
import { ApiSimulee, CHURN, CLE, erreur } from './api-simulee.js';

// Les reprises s'eprouvent sans attendre reellement : la temporisation est une
// option du client, pas une constante du module.
function client(api, options = {}) {
  return new Spavik({
    apiKey: CLE, baseUrl: 'http://api.test', fetch: api.fetch, backoff: () => 0, ...options,
  });
}

test('le requestId remonte dans l exception', async () => {
  const api = new ApiSimulee();
  api.repondra('/v1/models', new Response(
    JSON.stringify({ status: 'error', message: 'TARGET_COLUMN_MISSING', messageDetail: 'detail' }),
    { status: 422, headers: { 'content-type': 'application/json', 'x-spavik-request-id': 'req_abc123' } },
  ));
  await assert.rejects(() => client(api).train(CHURN, { target: 'churn' }), (exc) => {
    assert.ok(exc instanceof SpavikValidationError);
    assert.equal(exc.requestId, 'req_abc123');
    assert.equal(exc.code, 'TARGET_COLUMN_MISSING');
    assert.match(exc.message, /req_abc123/);
    return true;
  });
});

test('credits epuises porte le solde', async () => {
  const api = new ApiSimulee();
  const modele = await client(api).train(CHURN, { target: 'churn' });
  api.solde = 2;
  const rows = Array.from({ length: 5 }, () => ({ plan: 'pro' }));
  await assert.rejects(() => modele.predict(rows), (exc) => {
    assert.ok(exc instanceof SpavikCreditsExhausted);
    assert.equal(exc.balance, 2);
    assert.equal(exc.required, 5);
    return true;
  });
});

test('reponse HTML ne leve pas une erreur de parsing', async () => {
  const api = new ApiSimulee();
  const modele = await client(api).train(CHURN, { target: 'churn' });
  api.repondra(`/v1/models/${modele.id}/predict`, new Response(
    '<!DOCTYPE html><html><body><pre>Cannot POST</pre></body></html>',
    { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'x-spavik-request-id': 'req_html' } },
  ));
  await assert.rejects(() => modele.predict([{ plan: 'pro' }]), (exc) => {
    assert.ok(exc instanceof SpavikTransportError);
    assert.match(exc.message, /non-JSON/);
    assert.equal(exc.requestId, 'req_html');
    return true;
  });
});

test('reprise sur 500 puis succes', async () => {
  const api = new ApiSimulee();
  api.repondra('/v1/models', erreur(500, 'INTERNAL_ERROR'));
  const modele = await client(api).train(CHURN, { target: 'churn' });
  assert.ok(modele.id);
  assert.equal(api.compte('/v1/models'), 2);
});

test('pas de reprise sur 4xx', async () => {
  const api = new ApiSimulee();
  api.repondra('/v1/models', erreur(422, 'VALIDATION_ERROR'));
  await assert.rejects(() => client(api).train(CHURN, { target: 'churn' }), SpavikValidationError);
  assert.equal(api.compte('/v1/models'), 1);
});

test('reprise sur 429', async () => {
  const api = new ApiSimulee();
  api.repondra('/v1/models', erreur(429, 'TOO_MANY_REQUESTS'));
  await client(api).train(CHURN, { target: 'churn' });
  assert.equal(api.compte('/v1/models'), 2);
});

test('abandon apres trois tentatives', async () => {
  const api = new ApiSimulee();
  api.repondra('/v1/models', ...Array.from({ length: 5 }, () => erreur(503, 'ENGINE_UNAVAILABLE')));
  await assert.rejects(() => client(api).train(CHURN, { target: 'churn' }));
  assert.equal(api.compte('/v1/models'), 3);
});

test('reprise reseau', async () => {
  const api = new ApiSimulee();
  api.repondra('/v1/models', new TypeError('fetch failed'));
  const modele = await client(api).train(CHURN, { target: 'churn' });
  assert.ok(modele.id);
  assert.equal(api.compte('/v1/models'), 2);
});

test('la reprise rejoue la meme cle d idempotence', async () => {
  const api = new ApiSimulee();
  api.repondra('/v1/models', erreur(503, 'ENGINE_UNAVAILABLE'));
  await client(api).train(CHURN, { target: 'churn' });
  const cles = api.appels
    .filter((a) => a.chemin === '/v1/models')
    .map((a) => a.entetes['Idempotency-Key']);
  assert.equal(cles.length, 2);
  assert.equal(cles[0], cles[1]);
  assert.ok(cles[0]);
});

test('une prediction rejouee ne debite pas deux fois', async () => {
  const api = new ApiSimulee();
  const modele = await client(api).train(CHURN, { target: 'churn' });
  const depart = api.solde;
  api.repondra(`/v1/models/${modele.id}/predict`, erreur(503, 'ENGINE_UNAVAILABLE'));
  const resultat = await modele.predict(Array.from({ length: 4 }, () => ({ plan: 'pro' })));
  assert.equal(resultat.cout, null);
  assert.equal(depart - api.solde, 4);
});

test('chaque appel a sa propre cle', async () => {
  const api = new ApiSimulee();
  const c = client(api);
  await c.train(CHURN, { target: 'churn' });
  await c.train(CHURN, { target: 'churn' });
  const cles = new Set(api.appels
    .filter((a) => a.chemin === '/v1/models' && a.methode === 'POST')
    .map((a) => a.entetes['Idempotency-Key']));
  assert.equal(cles.size, 2);
});

test('les lectures ne portent pas de cle', async () => {
  const api = new ApiSimulee();
  const c = client(api);
  await c.train(CHURN, { target: 'churn' });
  const vus = [];
  for await (const m of c.models()) vus.push(m.id);
  const lectures = api.appels.filter((a) => a.methode === 'GET');
  assert.ok(lectures.length > 0);
  assert.ok(lectures.every((a) => a.entetes['Idempotency-Key'] === undefined));
});

test('modele inexistant', async () => {
  const api = new ApiSimulee();
  await assert.rejects(() => client(api).model('mdl_inexistant'), (exc) => {
    assert.ok(exc instanceof SpavikNotFound);
    assert.equal(exc.code, 'MODEL_NOT_FOUND');
    return true;
  });
});

test('cle invalide', async () => {
  const api = new ApiSimulee();
  const mauvais = new Spavik({
    apiKey: 'sk-spv-api-wrong', baseUrl: 'http://api.test', fetch: api.fetch, backoff: () => 0,
  });
  await assert.rejects(() => mauvais.train(CHURN, { target: 'churn' }), (exc) => {
    assert.equal(exc.code, 'API_KEY_INVALID');
    return true;
  });
});

test('erreur de la passerelle n est pas prise pour un code', async () => {
  // La passerelle rend ses propres erreurs, hors enveloppe de l'API :
  // {"code": 404, "message": "The current request is not defined by this API."}
  const api = new ApiSimulee();
  api.repondra('/v1/models', new Response(
    JSON.stringify({ code: 404, message: 'The current request is not defined by this API.' }),
    { status: 404, headers: { 'content-type': 'application/json', 'x-spavik-request-id': 'req_gw' } },
  ));
  await assert.rejects(() => client(api).train(CHURN, { target: 'churn' }), (exc) => {
    assert.ok(exc instanceof SpavikNotFound);
    assert.equal(exc.code, null);
    assert.match(exc.message, /not defined by this API/);
    assert.equal(exc.requestId, 'req_gw');
    return true;
  });
});
