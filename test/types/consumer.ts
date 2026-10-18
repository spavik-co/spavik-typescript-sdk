import {
  Spavik, Model, Prediction, Prevision, Resultat, SpavikError, SpavikCreditsExhausted,
  API_VERSION, VERSION, OPERATIONS, verifier,
  type Donnees, type Ligne, type Outcome, type OptionsClient, type OptionsTrain,
  type OptionsEvaluate, type OptionsBacktest, type OptionsForecast, type Engine, type OperationInfo, type Calibration, type BacktestPrediction, type EngineFamily,
} from 'spavik';
import { verifier as webhookVerifier } from 'spavik/webhooks';

const options: OptionsClient = { apiKey: 'sk-spv-api-fixture', fetch, backoff: n => n * 10 };
const client = new Spavik(options);
const row: Ligne = { x: 1, target: false };
const data: Donnees = [row];
const train: OptionsTrain = { target: 'target', engineFamily: 'presage', autoUpdate: true };
const evaluate: OptionsEvaluate = { target: 'target' };
const backtest: OptionsBacktest = { target: 'target', horizon: 2, pointEstimate: 'median', quantiles: [0.1, 0.9] };
// @ts-expect-error La statistique doit etre prise en charge par le backtest.
const invalidBacktest: OptionsBacktest = { target: 'target', pointEstimate: 'mode' };
const forecast: OptionsForecast = { target: 'target', horizon: 2, quantiles: [0.5] };
const operation: OperationInfo = OPERATIONS.forecast;
const strings: string[] = [API_VERSION, VERSION, operation.path, client.baseUrl];

async function workflow(): Promise<void> {
  const model: Model = await client.train(data, train);
  const prediction: Prediction = await model.predict(row, { engineVersion: 'presage-latest' });
  const family: string | null = model.engineFamily;
  const calibration: Calibration | null | undefined = model.training?.calibration;
  const engineFamilies: EngineFamily[] = await client.engineFamilies();
  const forecastReport = await client.backtest(data, { target: 'target', engineFamily: 'presage', engineVersion: 'presage-2', includeBacktestPredictions: true });
  const evaluated: BacktestPrediction[] | null | undefined = forecastReport.backtest?.predictions;
  const servingEngine: string | null = prediction.engine;
  const cost: number | null = prediction.cout;
  const result: Resultat = await model.submitOutcomes({ request_id: 'fixture', features: { seats: 12 }, actual: true });
  const outcome: Outcome = { features: { plan: 'pro', seats: 12 }, actual: true };
  const outcomes: Outcome[] = [outcome, { request_id: 'fixture', features: { seats: 12 }, actual: false }];
  await model.submitOutcomes(outcome);
  await model.submitOutcomes(outcomes);
  await model.submitOutcomes([{ features: { plan: 'pro', seats: 12 }, actual: true }]);
  const measuredOutcome: Outcome = {
    features: { plan: 'pro', seats: 12 }, actual: 'yes', prediction: 'no',
    probabilities: { no: 0.75, yes: 0.25 }, version: 2, engine: 'presage-2',
  };
  const measuredOutcomes: Outcome[] = [measuredOutcome,
    { request_id: 'fixture-regression', features: { seats: 12 }, actual: 3, prediction: 2.5, version: 1, engine: 'presage-2' },
    { features: { seats: 12 }, actual: false, prediction: true, version: 2, engine: 'presage-2' },
  ];
  await model.submitOutcomes(measuredOutcome);
  await model.submitOutcomes(measuredOutcomes);
  await model.submitOutcomes([{ features: { seats: 12 }, actual: true, prediction: false,
    probabilities: { false: 0.8, true: 0.2 }, version: 2, engine: 'presage-2' }]);
  // @ts-expect-error A supplied prediction requires its original model version.
  const missingModelVersion: Outcome = { features: { seats: 12 }, actual: true, prediction: false, engine: 'presage-2' };
  // @ts-expect-error A supplied prediction requires its exact serving engine.
  const missingServingEngine: Outcome = { request_id: 'fixture', features: { seats: 12 }, actual: 3, prediction: 2.5, version: 1 };
  // @ts-expect-error Probability values must be numeric.
  const invalidProbability: Outcome = { features: { seats: 12 }, actual: 'yes', probabilities: { yes: '0.8' } };
  // @ts-expect-error Model versions are numeric.
  const invalidOutcomeVersion: Outcome = { request_id: 'fixture', features: { seats: 12 }, actual: 3, version: '2' };
  // @ts-expect-error Engine identifiers are strings.
  const invalidOutcomeEngine: Outcome = { request_id: 'fixture', features: { seats: 12 }, actual: 3, engine: 2 };
  // @ts-expect-error Predictions must be scalar values accepted by the API.
  const invalidOutcomePrediction: Outcome = { features: { seats: 12 }, actual: true, prediction: {}, version: 2, engine: 'presage-2' };
  await model.submitOutcomes('[{"features":{"seats":12},"actual":true}]');
  const legacyOutcomes: Donnees = [{ request_id: 'fixture', actual: true }];
  // @ts-expect-error Generic scalar rows cannot bypass required outcome features.
  await model.submitOutcomes(legacyOutcomes);
  // @ts-expect-error A request ID never replaces features.
  const withoutFeatures: Outcome = { request_id: 'fixture', actual: true };
  // @ts-expect-error submitOutcomes also requires features when a request ID is present.
  await model.submitOutcomes({ request_id: 'fixture', actual: true });
  // @ts-expect-error Observations must include features.
  const missingReference: Outcome = { actual: true };
  // @ts-expect-error Observations must include the actual value.
  const missingActual: Outcome = { features: { seats: 12 } };
  // @ts-expect-error Features must be a row of scalar values.
  await model.submitOutcomes({ features: { nested: {} }, actual: true });
  // @ts-expect-error Prediction history is no longer part of the API.
  await model.predictions({ limit: 10 });
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
