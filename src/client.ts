import type { DataInput, Outcome, Engine, TrainOptions, ForecastOptions, EvaluateOptions, BacktestOptions, PredictOptions, EngineFamily, Calibration, BacktestPrediction, EvaluationReport, BacktestReport } from './types.js';
import type { ApiRecord, ModelData, Requete } from './internal.js';
// Client Spavik : les sept operations du perimetre moteur.
//
// Quatre d'entre elles portent un identifiant de modele. Ces quatre-la vivent
// sur l'objet `Model`, pour que personne n'ait a recopier un `mdl_...`.

import * as ops from './ops.js';
import { normaliser } from './data.js';
import { Transport } from './http.js';
import { SpavikConflict } from './errors.js';

/**
 * API response data, credit cost and request identifier.
 * `cost` is 0 for a free operation and null for a billed one: the API does not
 * return the amount charged. `predictionsRemaining` copies the
 * X-Spavik-Predictions-Remaining header (monthly allowance left plus balance),
 * null when the API does not send it.
 */
export class Result {
  declare readonly data: ApiRecord;
  declare readonly cost: number | null;
  declare readonly predictionsRemaining: number | null;
  declare readonly requestId: string | null;
  constructor(data: ApiRecord | null, cost: number | null) {
    this.data = data || {};
    this.cost = cost;
    // L'API ne met pas le reste dans le corps : seul l'en-tete, recopie par le transport, le donne.
    this.predictionsRemaining = Number.isInteger(this.data._predictions_remaining)
      ? this.data._predictions_remaining as number : null;
    this.requestId = (this.data._request_id as string | null) ?? null;
  }

  /** Initial test-set diagnostic returned by the performance API. */
  get trainingCalibration(): Calibration | null {
    return (this.data.training_calibration as Calibration | null) ?? null;
  }

  /** Exact serving engine, distinct from the model data version. */
  get engine(): string | null {
    return (this.data._engine_version ?? this.data.engine) as string | null ?? null;
  }

  get<T = unknown>(key: string, fallback?: T): T {
    return (this.data[key] ?? fallback) as T;
  }
}

export class Prediction extends Result {
  get predictions() {
    return (this.data.predictions as ApiRecord[]) || [];
  }

  get version() {
    return (this.data.version as number | null) ?? null;
  }
}

/**
 * Forecast result. Use `points()` to parse the rows, or `csv` for the raw CSV.
 */
export class Forecast extends Result {
  get csv() {
    return (this.data.forecast_csv as string) || '';
  }

  async points() {
    if (!this.csv.trim()) return (this.data.forecast || this.data.predictions || []) as ApiRecord[];
    return normaliser(this.csv, 'forecast');
  }

  get backtest(): (ApiRecord & { predictions?: BacktestPrediction[] | null }) | null {
    return (this.data.backtest as ApiRecord) ?? null;
  }

  get target() { return (this.data.target as string | null) ?? null; }

  get horizon() { return (this.data.prediction_length as number | null) ?? null; }

  get series() { return (this.data.n_series as number | null) ?? null; }
}

// Requete interne, hors du contrat moteur genere.
const REQUETE_MOTEURS = {
  methode: 'GET',
  chemin: '/v1/engines',
  operation: 'engines',
  delai: 15000,
  contexte: 'available engines',
};

function refreshAbsorbe(exc: unknown) {
  return exc instanceof SpavikConflict && exc.code === 'NO_PENDING_OUTCOMES';
}

function modelData(response: ApiRecord): ModelData {
  return { ...((response.model || response) as ModelData),
    ...(response.version && typeof response.version === 'object' ? { training: response.version } : {}) };
}

export class Model {
  declare private _client: Spavik;
  declare private _donnees: ModelData;
  constructor(client: Spavik, donnees: ModelData) {
    this._client = client;
    this._donnees = { ...donnees };
  }

  get id() { return this._donnees.id; }

  get name() { return this._donnees.name ?? null; }

  get version() { return this._donnees.latest_version ?? this._donnees.version ?? null; }

  get task() { return this._donnees.task ?? null; }

  get engine() { return this._donnees.engine ?? null; }

  get engineFamily() { return this._donnees.engine_family ?? null; }

  get training(): (ApiRecord & { calibration?: Calibration | null }) | null {
    return (this._donnees.training as ApiRecord) ?? null;
  }

  /** The columns predict must carry (`feature_columns` at the API); empty when not recorded. */
  get features() {
    return Array.isArray(this._donnees.feature_columns) ? [...this._donnees.feature_columns] : [];
  }

  get data() { return { ...this._donnees }; }

  /** Score rows. Each row costs the serving engine's credit price. */
  async predict(rows: DataInput, options: PredictOptions = {}): Promise<Prediction> {
    const plan = await ops.predict(this.id, rows, options);
    return new Prediction(await this._client._envoyer(plan.requete), null);
  }

  /** Archive: the model stops serving and frees its slot; everything is kept. Free. */
  async archive() {
    await this._client._envoyer(ops.archive(this.id).requete);
  }

  /** Submit observed outcomes with features and actual on every plan. Free. */
  async submitOutcomes(outcomes: Outcome | Outcome[] | string): Promise<Result> {
    const plan = await ops.submitOutcomes(this.id, outcomes);
    return new Result(await this._client._envoyer(plan.requete), 0);
  }

  /**
   * Integrate pending outcomes into a new model version. Free.
   * Returns `null` only when there are no pending outcomes; other API failures are raised.
   */
  async refresh(): Promise<Result | null> {
    const plan = ops.refresh(this.id);
    try {
      return new Result(await this._client._envoyer(plan.requete), 0);
    } catch (exc) {
      if (refreshAbsorbe(exc)) return null;
      throw exc;
    }
  }

  /** Observed performance and initial calibration. API failures are raised. */
  async performance(days = 30): Promise<Result | null> {
    const plan = ops.performance(this.id, days);
    return new Result(await this._client._envoyer(plan.requete), 0);
  }

  async reload(): Promise<Model> {
    const frais = await this._client.model(this.id);
    this._donnees = frais._donnees;
    return this;
  }
}

export class Spavik extends Transport {
  /** @internal */
  async _envoyer<T = ApiRecord>(requete: Requete): Promise<T> {
    return this.envoyer<T>(requete);
  }

  /** Available engines as the API describes them (id, label, status). Free. */
  async engines(): Promise<Engine[]> {
    const entrees = await this._envoyer<Engine[]>(REQUETE_MOTEURS);
    return Array.isArray(entrees) ? entrees.filter((e) => e && typeof e === 'object').map((e) => ({ ...e })) : [];
  }

  /** Families and the configured default, as returned by the API. */
  async engineFamilies(): Promise<EngineFamily[]> {
    return this._envoyer({ ...REQUETE_MOTEURS, chemin: '/v1/engine-families' });
  }

  /** The account as the API sees it: plan, credit balance, period, consumption. Free. */
  async usage(): Promise<ApiRecord> {
    const brut = await this._envoyer(ops.usage().requete);
    return brut && typeof brut === 'object' ? { ...brut } : {};
  }

  /**
   * What training would say of this table, plus a trial run of the engine:
   * validation, hint, trial and assessment (status, metric, message), unchanged.
   * No fallback conclusion. Creates nothing, charges nothing.
   */
  async evaluate(data: DataInput, options: EvaluateOptions): Promise<EvaluationReport> {
    const plan = await ops.evaluate(data, options);
    const brut = await this._envoyer(plan.requete);
    return brut && typeof brut === 'object' ? { ...brut } : {};
  }

  /**
   * Whether forecasting this series is worth paying for: the series checked,
   * its history replayed against references. assessment is preserved unchanged.
   * No fallback conclusion, no forecast, no charge.
   */
  async backtest(data: DataInput, options: BacktestOptions): Promise<BacktestReport> {
    const plan = await ops.backtest(data, options);
    const brut = await this._envoyer(plan.requete);
    return brut && typeof brut === 'object' ? { ...brut } : {};
  }

  /** Archive a model by identifier, without reading it first. */
  async archive(modelId: string): Promise<void> {
    await this._envoyer(ops.archive(modelId).requete);
  }

  /**
   * Bring an archived model back into service, by identifier. No prior read:
   * reading an archived model answers MODEL_ARCHIVED, which would make the
   * restore impossible.
   */
  async restore(modelId: string): Promise<void> {
    await this._envoyer(ops.restore(modelId).requete);
  }

  /** Create and train a model in one call. Free. */
  async train(data: DataInput, options: TrainOptions): Promise<Model> {
    // Les controles locaux d'abord : un refus prononce ici ne doit toucher ni
    // le reseau ni le catalogue des moteurs.
    const plan = await ops.train(data, options);
    const brut = (await this._envoyer(plan.requete)) || {};
    return new Model(this, modelData(brut));
  }

  /** Forecast time series. Billed by the API at horizon times the serving engine tariff, all series included. */
  async forecast(data: DataInput, options: ForecastOptions): Promise<Forecast> {
    const plan = await ops.forecast(data, options);
    return new Forecast(await this._envoyer(plan.requete), plan.cout);
  }

  /**
   * Iterate over serving models, fetching pages automatically.
   * Use `status: 'archived'` for archived models.
   */
  async* models({ limit = 50, status }: { limit?: number; status?: 'archived' } = {}): AsyncGenerator<Model, void, undefined> {
    let offset = 0;
    for (;;) {
      const plan = ops.listModels(limit, offset, status);
      const brut = (await this._envoyer(plan.requete)) || {};
      const lot = (brut.data as ModelData[]) || [];
      for (const entree of lot) yield new Model(this, entree);
      const total = (brut.pagination as { total?: number } | undefined)?.total;
      offset += lot.length;
      if (!lot.length || lot.length < limit || (total != null && offset >= total)) return;
    }
  }

  /** Read an existing model by identifier. */
  async model(modelId: string): Promise<Model> {
    const plan = ops.getModel(modelId);
    const brut = (await this._envoyer(plan.requete)) || {};
    return new Model(this, modelData(brut));
  }
}
