// La boucle complete, cote JavaScript. Memes assertions que le test Python.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Spavik } from '../dist/esm/index.js';
import { ApiSimulee, CHURN, CLE, erreur } from './api-simulee.js';
import { SpavikError } from '../dist/esm/index.js';

function client(api) {
  return new Spavik({ apiKey: CLE, baseUrl: 'http://api.test', fetch: api.fetch, backoff: () => 0 });
}

test('boucle complete', async () => {
  const api = new ApiSimulee();
  const spavik = client(api);

  const modele = await spavik.train(CHURN, { target: 'churn' });
  assert.match(modele.id, /^mdl_/);
  assert.equal(modele.version, 1);

  const depart = api.solde;
  const prediction = await modele.predict([{ plan: 'pro', seats: 12, tickets_90d: 3 }]);
  assert.equal(prediction.cost, null);
  assert.equal(prediction.predictionsRemaining, depart - 1);
  assert.equal(prediction.predictions.length, 1);
  assert.ok(prediction.requestId);

  const verites = await modele.submitOutcomes([
    { request_id: 'req_1', features: { plan: 'pro', seats: 12, tickets_90d: 3 }, actual: 1 },
    { request_id: 'req_2', features: { plan: 'pro', seats: 12, tickets_90d: 3 }, actual: 0 },
    { request_id: 'req_3', features: { plan: 'pro', seats: 12, tickets_90d: 3 }, actual: 1 },
  ]);
  assert.equal(verites.get('accepted'), 3);
  assert.equal(verites.cost, 0);

  const integration = await modele.refresh();
  assert.ok(integration);
  assert.equal(integration.get('version').version, 2);
  assert.equal(integration.get('outcomes_applied'), 3);

  const perf = await modele.performance(30);
  assert.ok(perf);
  assert.equal(perf.get('observed').accuracy, 1.0);
});

test('refresh sans verite rend null', async () => {
  const api = new ApiSimulee();
  const modele = await client(api).train(CHURN, { target: 'churn' });
  assert.equal(await modele.refresh(), null);
});

test('pagination transparente', async () => {
  const api = new ApiSimulee();
  const spavik = client(api);
  for (let i = 0; i < 7; i += 1) await spavik.train(CHURN, { target: 'churn' });
  const vus = [];
  for await (const m of spavik.models({ limit: 3 })) vus.push(m.id);
  assert.equal(vus.length, 7);
  assert.equal(new Set(vus).size, 7);
});

test('prevision et cout', async () => {
  const api = new ApiSimulee();
  const serie = Array.from({ length: 28 }, (_, i) => ({ date: `2026-07-${i + 1}`, ventes: 100 + i }));
  const depart = api.solde;
  const resultat = await client(api).forecast(serie, { target: 'ventes', horizon: 7 });
  assert.equal(resultat.cost, null);
  assert.equal((await resultat.points()).length, 7);
  assert.equal(depart - api.solde, 7);
});

test('appel multi-series coute seulement l horizon', async () => {
  const api = new ApiSimulee();
  api.solde = 7;
  const spavik = client(api);
  const serie = ['a', 'b', 'c', 'd', 'e'].flatMap(boutique =>
    Array.from({ length: 20 }, (_, i) => ({ boutique, ventes: i })));
  assert.equal(api.appels.length, 0);
  const result = await spavik.forecast(serie, { target: 'ventes', horizon: 7, itemId: 'boutique' });
  assert.equal(result.cost, null);
  assert.equal(api.solde, 0);
});

test('the API owns default engine selection', async () => {
  // Defaults are omitted from the request and resolved by the API.
  const api = new ApiSimulee();
  const spavik = client(api);
  await spavik.train(CHURN, { target: 'churn' });
  assert.equal(api.compte('/v1/engines'), 0);
  const envoye = api.appels.find((a) => a.chemin === '/v1/models' && a.methode === 'POST');
  assert.equal(envoye.corps.engine, undefined);
  assert.equal(envoye.corps.engine_family, undefined);

  await spavik.train(CHURN, { target: 'churn' });
  assert.equal(api.compte('/v1/engines'), 0, 'le catalogue ne se relit pas a chaque entrainement');
});

test('un moteur explicite court-circuite la resolution', async () => {
  const api = new ApiSimulee();
  await client(api).train(CHURN, { target: 'churn', engineFamily: 'presage' });
  assert.equal(api.compte('/v1/engines'), 0);
});

test('un refus local ne va pas chercher le moteur', async () => {
  const api = new ApiSimulee();
  await assert.rejects(() => client(api).train(CHURN.slice(0, 8), { target: 'churn' }));
  assert.equal(api.appels.length, 0);
  assert.equal(api.compte('/v1/engines'), 0);
});

test('engines() rend le catalogue tel que l API le decrit', async () => {
  const api = new ApiSimulee();
  const moteurs = await client(api).engines();
  assert.equal(moteurs.length, 1);
  assert.equal(moteurs[0].id, 'presage-2');
  assert.equal(moteurs[0].status, 'default');
});

test('usage() rend le solde et la periode', async () => {
  const api = new ApiSimulee();
  const spavik = client(api);
  assert.equal((await spavik.usage()).credit_balance, 100);
  const modele = await spavik.train(CHURN, { target: 'churn' });
  await modele.predict(Array.from({ length: 12 }, () => ({ plan: 'pro' })));
  const compte = await spavik.usage();
  assert.equal(compte.credit_balance, 88);
  assert.equal(compte.period.units_used, 12);
});

test('le solde vient de l en-tete quand le corps ne l a pas', async () => {
  // forecast ne rend pas le solde dans son corps : X-Spavik-Predictions-Remaining le donne.
  const api = new ApiSimulee();
  const serie = Array.from({ length: 28 }, (_, i) => ({ date: `2026-07-${i + 1}`, ventes: 100 + i }));
  const r = await client(api).forecast(serie, { target: 'ventes', horizon: 3 });
  assert.equal(r.predictionsRemaining, 97);
  assert.equal(api.solde, 97);
});

test('archiver puis restaurer, par identifiant', async () => {
  const api = new ApiSimulee();
  const spavik = client(api);
  const modele = await spavik.train(CHURN, { target: 'churn' });
  await modele.archive();
  const actifs = []; for await (const m of spavik.models()) actifs.push(m.id);
  assert.deepEqual(actifs, []);
  const archives = []; for await (const m of spavik.models({ status: 'archived' })) archives.push(m.id);
  assert.deepEqual(archives, [modele.id]);
  // Lire un modele archive est refuse, comme la vraie API : restaurer ne le lit pas.
  await assert.rejects(() => spavik.model(modele.id), (e) => e instanceof SpavikError && e.code === 'MODEL_ARCHIVED');
  await spavik.restore(modele.id);
  const revenus = []; for await (const m of spavik.models()) revenus.push(m.id);
  assert.deepEqual(revenus, [modele.id]);
  assert.equal(api.appels.filter((a) => a.methode === 'DELETE').length, 0, 'jamais de suppression');
});

test('evaluer avant d entrainer', async () => {
  const api = new ApiSimulee();
  const spavik = client(api);
  const rapport = await spavik.evaluate(CHURN, { target: 'churn', engineFamily: 'presage' });
  const requete = api.appels.at(-1);
  assert.equal(requete.methode, 'POST');
  assert.equal(requete.chemin, '/v1/datasets/evaluate');
  assert.deepEqual(requete.corps, { data: CHURN, target: 'churn', engine_family: 'presage' });
  assert.equal(rapport.trial.verdict.level, 'usable');
  assert.equal(api.solde, 100);
  assert.equal(api.modeles.size, 0);
  const rate = await spavik.evaluate(CHURN, { target: 'churn_90d' });
  assert.equal(rate.trial, null);
  assert.match(rate.hint, /missing/);
});

test('backtester une serie', async () => {
  const api = new ApiSimulee();
  const serie = Array.from({ length: 28 }, (_, i) => ({ date: `2026-07-${i + 1}`, ventes: 100 + i }));
  const rapport = await client(api).backtest(serie, { target: 'ventes', horizon: 7 });
  assert.equal(rapport.backtest.verdict.level, 'usable');
  assert.deepEqual(rapport.backtest.by_window, [0.55, 0.7, 0.61]);
  assert.equal(api.solde, 100);
});

test('la reponse de prediction porte les request_id', async () => {
  const api = new ApiSimulee();
  const modele = await client(api).train(CHURN, { target: 'churn' });
  const r = await modele.predict(Array.from({ length: 3 }, () => ({ plan: 'pro' })));
  assert.deepEqual(r.predictions.map((l) => l.request_id), ['req_p0000', 'req_p0001', 'req_p0002']);
});

test('prediction cost is not invented from the training engine tariff', async () => {
  const api = new ApiSimulee();
  api.repondra('/v1/engines', new Response(JSON.stringify([
    { id: 'presage-2', status: 'default', credits: 1 }, { id: 'big-v1', status: 'preview', credits: 3 },
  ]), { status: 200, headers: { 'content-type': 'application/json' } }));
  const spavik = client(api);
  let modele = await spavik.train(CHURN, { target: 'churn' });
  api.modeles.get(modele.id).engine = 'big-v1'; // servi par un moteur a trois credits
  modele = await spavik.model(modele.id);
  assert.equal(modele.engine, 'big-v1');
  assert.equal((await modele.predict(Array.from({ length: 4 }, () => ({ plan: 'pro' })))).cost, null);
  assert.equal(api.compte('/v1/engines'), 0, 'le catalogue se lit une fois');
});

test('un moteur inconnu est refuse par son code', async () => {
  const api = new ApiSimulee();
  await assert.rejects(() => client(api).train(CHURN, { target: 'churn', engineFamily: 'nope' }),
    (e) => e instanceof SpavikError && e.code === 'VALIDATION_ERROR');
  assert.ok(erreur);
});

test('un horizon nul est refuse avant le backtest', async () => {
  const api = new ApiSimulee();
  const serie = Array.from({ length: 28 }, (_, i) => ({ date: `2026-07-${i + 1}`, ventes: 100 + i }));
  await assert.rejects(() => client(api).backtest(serie, { target: 'ventes', horizon: 0 }), /at least 1/);
  assert.equal(api.compte('/v1/forecast/backtest'), 0);
});

test('le modele dit les colonnes qu il attend', async () => {
  const api = new ApiSimulee();
  const spavik = client(api);
  const modele = await spavik.train(CHURN, { target: 'churn' });
  assert.deepEqual(modele.features, []);
  api.modeles.get(modele.id).feature_columns = ['plan', 'seats', 'tickets_90d'];
  assert.deepEqual((await spavik.model(modele.id)).features, ['plan', 'seats', 'tickets_90d']);
});

for (const pointEstimate of [undefined, 'mean', 'median']) {
  test(`backtest transmet les options de prevision : ${pointEstimate ?? 'default'}`, async () => {
    const api = new ApiSimulee();
    const data = [{ date: '2026-01-01', store: 'a', sales: 1 }];
    const report = await client(api).backtest(data, {
      target: 'sales', horizon: 2, timestamp: 'date', itemId: 'store',
      ...(pointEstimate ? { pointEstimate, quantiles: [0.1, 0.5, 0.9] } : {}),
    });
    const sent = api.appels.find(call => call.chemin === '/v1/forecast/backtest').corps;
    assert.equal(sent.point_estimate, pointEstimate);
    assert.deepEqual(sent.quantiles, pointEstimate ? [0.1, 0.5, 0.9] : undefined);
    assert.equal(sent.item_id, 'store');
    assert.equal(sent.timestamp, 'date');
    assert.equal(sent.horizon, 2);
    assert.ok(report.backtest);
    assert.equal(api.solde, 100);
  });
}
