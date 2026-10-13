// Verification de signature des webhooks. Memes cas que du cote Python.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { SpavikSignatureError, verifier } from '../dist/esm/index.js';

const SECRET = 'whsec_de_test';

function signer(corps, horodatage) {
  const charge = horodatage ? Buffer.concat([Buffer.from(`${horodatage}.`), Buffer.from(corps)])
    : Buffer.from(corps);
  const signature = createHmac('sha256', SECRET).update(charge).digest('hex');
  return horodatage
    ? { 'X-Spavik-Timestamp': String(horodatage), 'X-Spavik-Signature': signature }
    : { 'X-Spavik-Signature': signature };
}

const maintenant = () => Math.floor(Date.now() / 1000);

test('signature valide rend l evenement', async () => {
  const corps = JSON.stringify({ event: 'model.trained', model_id: 'mdl_1' });
  const evenement = await verifier(corps, signer(corps, maintenant()), SECRET);
  assert.equal(evenement.event, 'model.trained');
});

test('sans horodatage', async () => {
  const corps = '{"event":"credits.low"}';
  assert.equal((await verifier(corps, signer(corps), SECRET)).event, 'credits.low');
});

test('signature invalide', async () => {
  const corps = '{"event":"model.trained"}';
  const entetes = signer(corps, maintenant());
  entetes['X-Spavik-Signature'] = '0'.repeat(64);
  await assert.rejects(() => verifier(corps, entetes, SECRET), (exc) => {
    assert.ok(exc instanceof SpavikSignatureError);
    assert.match(exc.message, /invalid signature/);
    return true;
  });
});

test('mauvais secret', async () => {
  const corps = '{"event":"model.trained"}';
  await assert.rejects(
    () => verifier(corps, signer(corps, maintenant()), 'un-autre-secret'),
    SpavikSignatureError,
  );
});

test('corps modifie apres signature', async () => {
  const corps = '{"event":"model.trained","credits":10}';
  const entetes = signer(corps, maintenant());
  await assert.rejects(
    () => verifier('{"event":"model.trained","credits":9999}', entetes, SECRET),
    SpavikSignatureError,
  );
});

test('rejeu hors tolerance', async () => {
  const corps = '{"event":"model.trained"}';
  const vieux = maintenant() - 3600;
  await assert.rejects(() => verifier(corps, signer(corps, vieux), SECRET), (exc) => {
    assert.match(exc.message, /Likely a replay/);
    return true;
  });
});

test('entete de signature absent', async () => {
  await assert.rejects(() => verifier('{}', {}, SECRET), (exc) => {
    assert.match(exc.message, /no signature header/);
    return true;
  });
});

test('prefixe tolere', async () => {
  const corps = '{"event":"model.trained"}';
  const entetes = signer(corps, maintenant());
  entetes['X-Spavik-Signature'] = `sha256=${entetes['X-Spavik-Signature']}`;
  assert.equal((await verifier(corps, entetes, SECRET)).event, 'model.trained');
});

test('entetes de type Headers acceptes', async () => {
  const corps = '{"event":"model.trained"}';
  const entetes = new Headers(signer(corps, maintenant()));
  assert.equal((await verifier(corps, entetes, SECRET)).event, 'model.trained');
});
