import {
  Spavik, Model, Prediction, Prevision, Resultat, SpavikError, SpavikCreditsExhausted,
  API_VERSION, VERSION, OPERATIONS, verifier,
  type Donnees, type Ligne, type OptionsClient, type OptionsTrain,
  type OptionsEvaluate, type OptionsBacktest, type OptionsForecast, type Engine, type OperationInfo,
} from '@spavik/client';
import { verifier as webhookVerifier } from '@spavik/client/webhooks';

const options: OptionsClient = { apiKey: 'sk-spv-api-fixture', fetch, backoff: n => n * 10 };
const client = new Spavik(options);
const row: Ligne = { x: 1, target: false };
const data: Donnees = [row];
const train: OptionsTrain = { target: 'target', engine: 'fixture', autoUpdate: true };
const evaluate: OptionsEvaluate = { target: 'target' };
const backtest: OptionsBacktest = { target: 'target', horizon: 2, pointEstimate: 'median', quantiles: [0.1, 0.9] };
// @ts-expect-error La statistique doit etre prise en charge par le backtest.
const invalidBacktest: OptionsBacktest = { target: 'target', pointEstimate: 'mode' };
const forecast: OptionsForecast = { target: 'target', horizon: 2, quantiles: [0.5] };
const operation: OperationInfo = OPERATIONS.forecast;
const strings: string[] = [API_VERSION, VERSION, operation.path, client.baseUrl];

async function workflow(): Promise<void> {
  const model: Model = await client.train(data, train);
  const prediction: Prediction = await model.predict(row);
  const result: Resultat = await model.submitOutcomes({ request_id: 'fixture', actual: true });
  const predictions: Record<string, unknown>[] = await model.predictions({ limit: 10 });
  const features: string[] = model.features;
  const id: string = model.id;
  const version: number | null = model.version;
  const requestId: string | null = prediction.requestId;
  const balance: number | null = prediction.solde;
  const value: number = result.get<number>('value', 0);
  const engines: Engine[] = await client.engines();
  const report: Record<string, unknown> = await client.evaluate(data, evaluate);
  await client.backtest(data, backtest);
  await client.usage();
  const future: Prevision = await client.forecast(data, forecast);
  const horizon: number | null = future.horizon;
  const series: number | null = future.series;
  await future.points();
  const refreshed: Resultat | null = await model.refresh();
  const performance: Resultat | null = await model.performance(7);
  for await (const entry of client.models({ status: 'archived' })) {
    const current: Model = entry;
    await current.reload();
  }
  await client.model(id);
  await model.archive();
  await client.archive(id);
  await client.restore(id);
  const headers = new Headers();
  const event: Record<string, unknown> = await verifier(new Uint8Array(), headers, 'fixture');
  await webhookVerifier(new ArrayBuffer(0), {}, 'fixture', { tolerance: 60 });
  try { await model.predict(data); } catch (error) {
    if (error instanceof SpavikError) {
      const code: string | null = error.code;
      const status: number | null = error.status;
    }
    if (error instanceof SpavikCreditsExhausted) {
      const required: number | null = error.required;
    }
  }
  // @ts-expect-error La cible est obligatoire.
  await client.train(data, {});
  // @ts-expect-error L'horizon doit etre numerique.
  await client.forecast(data, { target: 'target', horizon: '2' });
  // @ts-expect-error L'horizon peut etre absent de la reponse.
  const requiredHorizon: number = future.horizon;
  // @ts-expect-error Ces estimations ont ete retirees de l'API publique.
  client.estimateForecast(data, forecast);
  // @ts-expect-error Ces estimations ont ete retirees de l'API publique.
  model.estimatePredict(data);
}
