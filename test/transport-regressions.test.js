import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { Model, Spavik, SpavikTransportError } from '../dist/esm/index.js';

function fixture(fetch, options = {}) {
  const client = new Spavik({ apiKey: 'fixture-key', baseUrl: 'https://fixture.invalid',
    backoff: () => 0, fetch, ...options });
  return { client, model: new Model(client, { id: 'mdl_fixture' }) };
}

function interrupted(error, status = 200) {
  return new Response(new ReadableStream({ start(controller) { controller.error(error); } }),
    { status, headers: { 'content-type': 'application/json', 'X-Spavik-Request-Id': 'req_body' } });
}

for (const body of [false, true]) {
  test(`exhausted ${body ? 'body' : 'fetch'} errors retain request correlation and cause`, async () => {
    const calls = [];
    const cause = new TypeError('socket closed');
    const { model } = fixture(async (_url, init) => {
      calls.push(init);
      if (body) return interrupted(cause);
      throw cause;
    });
    await assert.rejects(model.predict({ x: 1 }), error => {
      assert.ok(error instanceof SpavikTransportError);
      assert.equal(error.cause, cause);
      assert.equal(error.idempotencyKey, calls[0].headers['Idempotency-Key']);
      assert.equal(error.requestId, body ? 'req_body' : null);
      assert.equal(error.status, body ? 200 : null);
      return true;
    });
    assert.equal(calls.length, 3);
    assert.ok(calls[0].headers['Idempotency-Key']);
    assert.equal(new Set(calls.map(c => c.headers['Idempotency-Key'])).size, 1);
    assert.equal(new Set(calls.map(c => c.body)).size, 1);
  });
}

test('an interrupted body retries once with the same mutation and returns the successful body', async () => {
  const calls = [];
  const { model } = fixture(async (_url, init) => {
    calls.push(init);
    return calls.length === 1 ? interrupted(new TypeError('terminated'))
      : Response.json({ predictions: [{ value: 1 }] });
  });
  assert.equal((await model.predict({ x: 1 })).lignes[0].value, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.equal(calls[0].body, calls[1].body);
});

test('body read failure on a known 401 does not retry', async () => {
  let calls = 0;
  const { client } = fixture(async () => { calls += 1; return interrupted(new TypeError('terminated'), 401); });
  await assert.rejects(client.usage(), error => {
    assert.ok(error instanceof SpavikTransportError);
    assert.equal(error.status, 401);
    assert.equal(error.idempotencyKey, null);
    return true;
  });
  assert.equal(calls, 1);
});

for (const finish of [false, true]) {
  test(`body timeout ${finish ? 'clears after completion' : 'aborts a stalled response'}`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let signal;
    let body;
    const { client } = fixture(async (_url, init) => {
      signal = init.signal;
      return new Response(new ReadableStream({ start(controller) {
        body = controller;
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      } }), { headers: { 'content-type': 'application/json', 'X-Spavik-Request-Id': 'req_deadline' } });
    }, { maxRetries: 1 });
    const pending = client.usage().then(value => ({ value }), error => ({ error }));
    await nextTurn();
    t.mock.timers.tick(14_999);
    assert.equal(signal.aborted, false);
    if (finish) {
      body.enqueue(new TextEncoder().encode('{"credit_balance":7}'));
      body.close();
      assert.equal((await pending).value.credit_balance, 7);
      t.mock.timers.tick(2);
      assert.equal(signal.aborted, false);
    } else {
      t.mock.timers.tick(2);
      // Cleanup also lets the regression fail promptly if the timer is broken.
      if (!signal.aborted) body.error(new Error('deadline did not abort'));
      const { error } = await pending;
      assert.equal(signal.aborted, true);
      assert.ok(error instanceof SpavikTransportError);
      assert.match(error.message, /timed out/);
      assert.equal(error.requestId, 'req_deadline');
    }
  });
}

test('a failed attempt clears its timer before a long retry delay', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  const { client } = fixture(async (_url, init) => {
    signals.push(init.signal);
    if (signals.length === 1) throw new TypeError('socket closed');
    return Response.json({ credit_balance: 7 });
  }, { backoff: () => 20_000 });
  const pending = client.usage();
  await nextTurn();
  t.mock.timers.tick(15_001);
  assert.equal(signals[0].aborted, false);
  assert.equal(signals.length, 1);
  t.mock.timers.tick(4_999);
  assert.equal((await pending).credit_balance, 7);
  assert.equal(signals.length, 2);
  t.mock.timers.tick(15_001);
  assert.equal(signals[1].aborted, false);
});
