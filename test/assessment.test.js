import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spavik } from '../dist/esm/index.js';

for (const method of ['evaluate', 'backtest']) {
  for (const status of ['better_than_baseline', 'not_better_than_baseline', 'inconclusive', 'not_evaluated', null]) {
    test(`${method} preserves REST assessment ${status}`, async () => {
      const payload = { validation: { status: 'passed' }, trial: null };
      if (status !== null) payload.assessment = { status, metric: method === 'evaluate' ? 'AUC' : 'MASE', message: 'Exact API message' };
      const client = new Spavik({ apiKey: '', fetch: async (url) => {
        assert.equal(new URL(url).pathname, method === 'evaluate' ? '/v1/datasets/evaluate' : '/v1/forecast/backtest');
        return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
      }});
      assert.deepEqual(await client[method]([{ x: 1, y: 2 }], { target: 'y' }), { ...payload, _request_id: null });
    });
  }
}
