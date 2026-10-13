// Ce qui est refuse sans toucher au reseau.
// Memes cas, memes messages que du cote Python.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Spavik, SpavikDataError } from '../dist/esm/index.js';
import { ApiSimulee, CHURN, CLE } from './api-simulee.js';

function client(api) {
  return new Spavik({ apiKey: CLE, baseUrl: 'http://api.test', fetch: api.fetch });
}

test('moins de dix lignes : refus sans appel', async () => {
  const api = new ApiSimulee();
  await assert.rejects(
    () => client(api).train(CHURN.slice(0, 8), { target: 'churn' }),
    (exc) => {
      assert.ok(exc instanceof SpavikDataError);
      assert.match(exc.message, /at least 10 rows/);
      assert.match(exc.message, /8 provided/);
      return true;
    },
  );
  assert.equal(api.appels.length, 0);
});

test('colonne cible absente : la proche est suggeree', async () => {
  const api = new ApiSimulee();
  await assert.rejects(
    () => client(api).train(CHURN, { target: 'churn_90d' }),
    (exc) => {
      assert.match(exc.message, /'churn_90d' is missing/);
      assert.match(exc.message, /Did you mean 'churn'/);
      assert.match(exc.message, /plan, seats, tickets_90d, churn/);
      return true;
    },
  );
  assert.equal(api.appels.length, 0);
});

test('cible constante refusee', async () => {
  const api = new ApiSimulee();
  const plates = CHURN.map((l) => ({ ...l, churn: 0 }));
  await assert.rejects(
    () => client(api).train(plates, { target: 'churn' }),
    /a single value/,
  );
  assert.equal(api.appels.length, 0);
});

test('serie plus courte que son horizon', async () => {
  const api = new ApiSimulee();
  const serie = Array.from({ length: 3 }, (_, i) => ({ date: `2026-07-0${i + 1}`, ventes: 100 + i }));
  await assert.rejects(
    () => client(api).forecast(serie, { target: 'ventes', horizon: 14 }),
    /3 point\(s\) for a horizon of 14/,
  );
  assert.equal(api.appels.length, 0);
});

test('horizon nul refuse', async () => {
  const api = new ApiSimulee();
  const serie = Array.from({ length: 30 }, () => ({ ventes: 1 }));
  await assert.rejects(
    () => client(api).forecast(serie, { target: 'ventes', horizon: 0 }),
    SpavikDataError,
  );
  assert.equal(api.appels.length, 0);
});

test('aucune ligne a scorer', async () => {
  const api = new ApiSimulee();
  const modele = await client(api).train(CHURN, { target: 'churn' });
  api.appels.length = 0;
  await assert.rejects(() => modele.predict([]), SpavikDataError);
  assert.equal(api.appels.length, 0);
});

test('verite sans valeur observee', async () => {
  const api = new ApiSimulee();
  const modele = await client(api).train(CHURN, { target: 'churn' });
  api.appels.length = 0;
  await assert.rejects(
    () => modele.submitOutcomes([{ request_id: 'req_1', outcome: 1 }]),
    (exc) => {
      assert.ok(exc instanceof SpavikDataError);
      assert.match(exc.message, /'actual'/, 'the expected field must be named');
      assert.match(exc.message, /request_id, outcome/, 'the fields found must be listed');
      return true;
    },
  );
  assert.equal(api.appels.length, 0);
});

test('verite sans rattachement', async () => {
  const api = new ApiSimulee();
  const modele = await client(api).train(CHURN, { target: 'churn' });
  api.appels.length = 0;
  await assert.rejects(
    () => modele.submitOutcomes([{ actual: 1 }]),
    /which prediction/,
  );
  assert.equal(api.appels.length, 0);
});
