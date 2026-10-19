// Verification de signature des webhooks, au format emis par l'API.
// Memes cas que du cote Python.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { SpavikSignatureError, verifier } from '../dist/esm/index.js';

const SECRET = 'whsec_de_test';
const maintenant = () => Math.floor(Date.now() / 1000);

// Reproduit signPayload de l'API : HMAC de `<t>.` + octets bruts.
function signer(corps, horodatage = maintenant(), secret = SECRET) {
  const signature = createHmac('sha256', secret).update(`${horodatage}.`).update(corps).digest('hex');
  return { 'Spavik-Signature': `t=${horodatage},v1=${signature}` };
}

const EVENEMENT = {
  id: 'evt_1',
  type: 'model.trained',
  created_at: '2026-10-11T12:00:00.000Z',
  workspace_id: 'ws_1',
  data: { model_id: 'mdl_1' },
};

const refus = (motif) => (exc) => {
  assert.ok(exc instanceof SpavikSignatureError);
  assert.match(exc.message, motif);
  return true;
};

test('signature valide rend l evenement', async () => {
  const corps = JSON.stringify(EVENEMENT);
  const evenement = await verifier(corps, signer(corps), SECRET);
  assert.equal(evenement.type, 'model.trained');
  assert.equal(evenement.id, 'evt_1');
});

test('octets bruts acceptes', async () => {
  const corps = JSON.stringify(EVENEMENT);
  const octets = new TextEncoder().encode(corps);
  assert.equal((await verifier(octets, signer(corps), SECRET)).type, 'model.trained');
  assert.equal((await verifier(octets.buffer, signer(corps), SECRET)).type, 'model.trained');
});

test('nom d entete insensible a la casse', async () => {
  const corps = '{"type":"credits.low"}';
  const entetes = { 'spavik-signature': signer(corps)['Spavik-Signature'] };
  assert.equal((await verifier(corps, entetes, SECRET)).type, 'credits.low');
});

test('entetes de type Headers acceptes', async () => {
  const corps = '{"type":"model.trained"}';
  assert.equal((await verifier(corps, new Headers(signer(corps)), SECRET)).type, 'model.trained');
});

test('signature invalide', async () => {
  const corps = '{"type":"model.trained"}';
  const entetes = { 'Spavik-Signature': `t=${maintenant()},v1=${'0'.repeat(64)}` };
  await assert.rejects(() => verifier(corps, entetes, SECRET), refus(/invalid signature/));
});

test('mauvais secret', async () => {
  const corps = '{"type":"model.trained"}';
  await assert.rejects(() => verifier(corps, signer(corps), 'un-autre-secret'), SpavikSignatureError);
});

test('corps modifie apres signature', async () => {
  const corps = '{"type":"model.trained","credits":10}';
  await assert.rejects(
    () => verifier('{"type":"model.trained","credits":9999}', signer(corps), SECRET),
    SpavikSignatureError,
  );
});

test('horodatage signe avec le corps', async () => {
  const corps = '{"type":"model.trained"}';
  const t = maintenant();
  const signature = signer(corps, t)['Spavik-Signature'].split(',v1=')[1];
  await assert.rejects(
    () => verifier(corps, { 'Spavik-Signature': `t=${t - 1},v1=${signature}` }, SECRET),
    SpavikSignatureError,
  );
});

test('rejeu hors tolerance', async () => {
  const corps = '{"type":"model.trained"}';
  await assert.rejects(() => verifier(corps, signer(corps, maintenant() - 3600), SECRET), refus(/Likely a replay/));
});

test('horodatage obligatoire', async () => {
  const corps = '{"type":"model.trained"}';
  const signature = createHmac('sha256', SECRET).update(corps).digest('hex');
  await assert.rejects(
    () => verifier(corps, { 'Spavik-Signature': `v1=${signature}` }, SECRET),
    refus(/unreadable Spavik-Signature/),
  );
});

test('ancien entete refuse', async () => {
  const corps = '{"type":"model.trained"}';
  const signature = createHmac('sha256', SECRET).update(corps).digest('hex');
  await assert.rejects(
    () => verifier(corps, { 'X-Spavik-Signature': signature }, SECRET),
    refus(/no Spavik-Signature header/),
  );
});

test('entete de signature absent', async () => {
  await assert.rejects(() => verifier('{}', {}, SECRET), refus(/no Spavik-Signature header/));
});

test('une des signatures v1 suffit', async () => {
  const corps = '{"type":"model.trained"}';
  const t = maintenant();
  const bonne = signer(corps, t)['Spavik-Signature'].split(',v1=')[1];
  const entetes = { 'Spavik-Signature': `t=${t},v1=${'0'.repeat(64)},v1=${bonne}` };
  assert.equal((await verifier(corps, entetes, SECRET)).type, 'model.trained');
});
