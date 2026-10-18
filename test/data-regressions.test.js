import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Model, Spavik, SpavikDataError } from '../dist/esm/index.js';

function fixture() {
  const sent = [];
  const client = new Spavik({ apiKey: 'fixture-key', maxRetries: 1,
    fetch: async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return Response.json({ predictions: [], accepted: true });
    },
  });
  return { sent, model: new Model(client, { id: 'mdl_fixture' }) };
}

for (const separator of [',', ';', '\t', '|']) {
  test(`CSV detects ${JSON.stringify(separator)} outside quoted headers`, async () => {
    const { sent, model } = fixture();
    await model.predict(`"label,;\t|"${separator}value\n"a""b${separator}c"${separator}3\n`);
    assert.deepEqual(sent[0].rows, [{ 'label,;\t|': `a"b${separator}c`, value: 3 }]);
  });
}

for (const newline of ['\n', '\r\n', '\r']) {
  test(`CSV preserves quoted newlines ${JSON.stringify(newline)}`, async () => {
    const { sent, model } = fixture();
    await model.predict(`\uFEFFdescription,amount${newline}"https://example.invalid/a${newline}${newline}line two",5${newline}last,6`);
    assert.deepEqual(sent[0].rows, [
      { description: `https://example.invalid/a${newline}${newline}line two`, amount: 5 },
      { description: 'last', amount: 6 },
    ]);
  });
}

for (const [csv, line] of [
  ['x,x\n1,2\n', 1],
  ['x, x \n1,2\n', 1],
  ['x,\n1,2\n', 1],
  ['x,"   "\n1,2\n', 1],
  ['x,y\n1,2,LOST\n', 2],
  ['x,y\n1,2\n3,4,LOST', 3],
  ['x,y\n"first\nsecond",1\na,b,c\n', 4],
  ['x,y\n"unterminated,1', 2],
  ['x,y\n"closed"junk,1', 2],
  ['x,y\nun"quoted,1', 2],
]) {
  test(`CSV rejects malformed data with its line: ${JSON.stringify(csv)}`, async () => {
    const { sent, model } = fixture();
    await assert.rejects(model.predict(csv), error => {
      assert.ok(error instanceof SpavikDataError);
      assert.match(error.message, new RegExp(`CSV line ${line}:`));
      return true;
    });
    assert.equal(sent.length, 0);
  });
}

test('CSV keeps unsafe integers as text and ordinary numeric values as numbers', async () => {
  const { sent, model } = fixture();
  const inputs = ['9007199254740991', '9007199254740992', '9007199254740993',
    '-9007199254740993', '9007199254740993.0', '1.0e309', '3.5', '-12'];
  await model.predict(`value\n${inputs.join('\n')}\n`);
  assert.deepEqual(sent[0].rows.map(row => row.value), [Number.MAX_SAFE_INTEGER,
    ...inputs.slice(1, 6), 3.5, -12]);
});

test('CSV preserves property-like column names and missing trailing fields', async () => {
  const { sent, model } = fixture();
  await model.predict('__proto__,constructor,x\nkept,name,3\nnext\n');
  assert.deepEqual(sent[0].rows, [
    { ['__proto__']: 'kept', constructor: 'name', x: 3 },
    { ['__proto__']: 'next', constructor: null, x: null },
  ]);
});

test('JSON objects and arrays containing paths stay data, including a BOM', async () => {
  const { sent, model } = fixture();
  const row = { url: 'https://example.invalid/a', file: '/data/x.csv', amount: 5 };
  await model.predict(JSON.stringify([row]));
  await model.predict(`\uFEFF  ${JSON.stringify(row)}`);
  assert.deepEqual(sent.map(body => body.rows), [[row], [row]]);
});

test('invalid JSON uses a local SDK error without exposing the input', async () => {
  const { sent, model } = fixture();
  await assert.rejects(model.predict('[{"private":"SENSITIVE_FIXTURE"}'), error => {
    assert.ok(error instanceof SpavikDataError);
    assert.match(error.message, /invalid JSON/);
    assert.doesNotMatch(error.message, /SENSITIVE_FIXTURE/);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(sent.length, 0);
});

test('file input uses the same CSV validation and JSON error handling', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'spavik-data-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const csv = join(dir, 'rows.csv');
  const json = join(dir, 'rows.json');
  const { sent, model } = fixture();
  await writeFile(csv, 'x,y\n1,2,LOST\n');
  await assert.rejects(model.predict(csv), SpavikDataError);
  await writeFile(json, '[{"x":1}');
  await assert.rejects(model.predict(json), SpavikDataError);
  assert.equal(sent.length, 0);
  await writeFile(json, '\uFEFF[{"x":1}]');
  await model.predict(json);
  assert.deepEqual(sent[0].rows, [{ x: 1 }]);
});

for (const rows of [[undefined, { x: 1 }], [null], [[], { x: 1 }], Array(2), [, { x: 1 }]]) {
  test(`invalid array rows are rejected: ${JSON.stringify(rows)}`, async () => {
    const { sent, model } = fixture();
    await assert.rejects(model.predict(rows), SpavikDataError);
    assert.equal(sent.length, 0);
  });
}

test('outcomes preserve mandatory features with optional prediction IDs', async () => {
  const { sent, model } = fixture();
  const outcomes = [{ features: { plan: 'pro', seats: 12 }, actual: true },
    { request_id: 'prediction_fixture', features: { plan: 'pro', seats: 12 }, actual: false }];
  await model.submitOutcomes(outcomes);
  assert.deepEqual(sent[0].outcomes, outcomes);
});

test('outcomes preserve original prediction metadata in the HTTP payload', async () => {
  const { sent, model } = fixture();
  const classification = Object.freeze({
    features: Object.freeze({ plan: 'pro', seats: 12 }), actual: 'yes', prediction: 'no',
    probabilities: Object.freeze({ no: 0.75, yes: 0.25 }), version: 2, engine: 'presage-2',
  });
  const regression = Object.freeze({
    request_id: 'prediction_fixture', features: { plan: 'pro', seats: 12 }, actual: 3, prediction: 2.5, version: 1, engine: 'presage-2',
  });
  await model.submitOutcomes(classification);
  await model.submitOutcomes([classification, regression]);
  assert.deepEqual(sent, [{ outcomes: [classification] }, { outcomes: [classification, regression] }]);
});


for (const features of [undefined, null, {}, [], 'invalid']) {
  test(`request ID cannot replace non-empty features: ${JSON.stringify(features)}`, async () => {
    const { sent, model } = fixture();
    await assert.rejects(model.submitOutcomes([
      { features: { seats: 12 }, actual: true },
      { request_id: 'existing_prediction', features, actual: false },
    ]), error => error instanceof SpavikDataError && /features.*non-empty object/.test(error.message));
    assert.deepEqual(sent, []);
  });
}
