import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spavik } from '../dist/esm/index.js';
import { retryDelay } from '../dist/esm/retry.js';
const rows = Array.from({ length: 12 }, (_, x) => ({ x, y: x % 2 }));
const calibration = { available: false, unavailable_reason: 'missing_probabilities', per_class: [] };
const points = [{ series: 'a', window: 0, actual: 3, prediction: 2, naive_prediction: 1, constant_prediction: 1, timestamp: '2026-10-01', quantiles: {} }];
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('family defaults and diagnostics are owned by the API', async () => {
  const calls = [];
  const client = new Spavik({ apiKey: 'fixture', fetch: async (url, options) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ path, body });
    assert.equal('engine' in body, false);
    let result;
    if (path === '/v1/engine-families') result = [{ id: 'presage', label: 'Presage', is_default: true }];
    else if (path === '/v1/models') result = { model: { id: 'mdl_test', latest_version: 7, engine_family: 'presage' }, version: { version: 7, calibration } };
    else if (path.endsWith('/predict')) result = { version: 7, engine: 'presage-2', _request_id: 'stale_replay', predictions: [{ request_id: 'req_prediction_original', prediction: 1 }] };
    else if (path.endsWith('/evaluate')) result = { trial: { calibration } };
    else if (path.endsWith('/performance')) result = { training_calibration: calibration, observed: null };
    else result = { engine: 'presage-2', backtest: { predictions: points } };
    return json(result, 200, { 'X-Spavik-Request-Id': 'req_current', 'X-Request-Id': 'obsolete', 'X-Spavik-Model-Version': 'presage-2', 'X-Spavik-Predictions-Remaining': '80' });
  } });
  const model = await client.train(rows, { target: 'y' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { data: rows, target: 'y' });
  assert.equal(model.engineFamily, 'presage');
  assert.equal(model.version, 7);
  assert.deepEqual(model.training.calibration, calibration);
  await client.train(rows, { target: 'y', engineFamily: 'presage' });
  assert.equal(calls.at(-1).body.engine_family, 'presage');
  const result = await model.predict({ x: 1 }, { engineVersion: 'presage-latest' });
  assert.deepEqual(calls.at(-1).body, { rows: [{ x: 1 }], engine_version: 'presage-latest' });
  assert.equal(result.requestId, 'req_current');
  assert.equal(result.lignes[0].request_id, 'req_prediction_original');
  assert.equal(result.engine, 'presage-2');
  assert.equal(result.version, 7);
  assert.equal(result.cout, null);
  assert.equal(result.solde, 80);
  for (const method of ['forecast', 'backtest']) {
    const result = await client[method](rows, { target: 'y', horizon: 2, engineFamily: 'presage', engineVersion: 'presage-2', includeBacktestPredictions: true, ...(method === 'forecast' ? { backtest: true } : {}) });
    assert.deepEqual(calls.at(-1).body, { target: 'y', data: rows, horizon: 2, engine_family: 'presage', engine_version: 'presage-2', include_backtest_predictions: true, ...(method === 'forecast' ? { backtest: true } : {}) });
    assert.deepEqual(result.backtest.predictions, points);
  }
  assert.deepEqual((await client.evaluate(rows, { target: 'y', engineFamily: 'presage' })).trial.calibration, calibration);
  assert.deepEqual((await model.performance()).donnees.training_calibration, calibration);
  assert.equal((await client.engineFamilies())[0].is_default, true);
});

for (const code of ['REQUEST_INTERRUPTED', 'IDEMPOTENCY_RESPONSE_UNAVAILABLE']) {
 for (const operation of ['train', 'refresh']) {
  test(`${operation}: ${code} is never retried or swallowed`, async () => {
    const posts = [];
    const client = new Spavik({ apiKey: 'fixture', fetch: async (url, options) => {
      if (options.method === 'GET') return json({ id: 'mdl_test' });
      posts.push(options);
      return json({ message: code }, 503, { 'Retry-After': '0', 'X-Spavik-Request-Id': 'req_uncertain' });
    } });
    const model = operation === 'refresh' ? await client.model('mdl_test') : null;
    await assert.rejects(() => model ? model.refresh() : client.train(rows, { target: 'y' }), error => {
      assert.equal(error.code, code);
      assert.equal(error.requestId, 'req_uncertain');
      assert.equal(error.idempotencyKey, posts[0].headers['Idempotency-Key']);
      return true;
    });
    assert.equal(posts.length, 1);
  });
 }
}

test('REQUEST_IN_PROGRESS retries with the original key and body', async () => {
  const calls = [];
  const client = new Spavik({ fetch: async (url, options) => {
    calls.push(options);
    return calls.length === 1 ? json({ message: 'REQUEST_IN_PROGRESS' }, 409, { 'Retry-After': '0' }) : json({ model: { id: 'mdl_test' } });
  } });
  await client.train(rows, { target: 'y' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.equal(retryDelay('7', 'ENGINE_BUSY', 0), 7000);
  assert.equal(retryDelay(null, 'ENGINE_BUSY', 0), 5000);
  assert.equal(retryDelay('0', 'ENGINE_BUSY', 100), 0);
  assert.equal(retryDelay('garbage', 'ENGINE_BUSY', 0), 5000);
});
