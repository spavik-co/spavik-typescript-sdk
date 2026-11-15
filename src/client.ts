import type {
  DataInput, Outcome, Engine, TrainOptions, ForecastOptions, EvaluateOptions, BacktestOptions, PredictOptions,
  EngineFamily, Calibration, BacktestPrediction, EvaluationReport, BacktestReport, Usage, ResponseMetadata,
  PredictionResponse, PredictionRow, ForecastResponse, OutcomesReceipt, RefreshResult, PerformanceReport,
  SubmitOutcomesOptions, RefreshOptions, ListModelsOptions, ModelVersionInfo,
} from './types.js';
import type { ApiRecord, Meta, ModelData, Reponse, Requete } from './internal.js';
// Client Spavik : les sept operations du perimetre moteur.
//
// Quatre d'entre elles portent un identifiant de modele. Ces quatre-la vivent
// sur l'objet `Model`, pour que personne n'ait a recopier un `mdl_...`.

import * as ops from './ops.js';
import { normaliser } from './data.js';
import { Transport } from './http.js';
import { SpavikConflict, SpavikDataError, SpavikError } from './errors.js';

const SANS_META: Meta = { requestId: null, engineVersion: null, predictionsRemaining: null };

/**
 * API response data, credit cost and response metadata.
 * `data` is the response body exactly as the API sent it. `cost` is 0 for a
 * free operation and null for a billed one: the API does not return the amount
 * charged. `requestId`, `predictionsRemaining` and `engineVersion` come from
 * the response headers.
 */
export class Result<T extends ApiRecord = ApiRecord> {
  declare readonly data: T;
  declare readonly cost: number | null;
  /**
   * X-Spavik-Predictions-Remaining: monthly allowance left plus balance,
   * null when the API does not send it.
   */
  declare readonly predictionsRemaining: number | null;
  /** X-Spavik-Request-Id of the response, to quote to support. */
  declare readonly requestId: string | null;
  /** X-Spavik-Model-Version: exact engine that served the call, null when absent. */
  declare readonly engineVersion: string | null;
  constructor(data: T | null, cost: number | null, meta: Partial<Meta> = SANS_META) {
    this.data = (data || {}) as T;
    this.cost = cost;
    this.predictionsRemaining = meta.predictionsRemaining ?? null;
    this.requestId = meta.requestId ?? null;
    this.engineVersion = meta.engineVersion ?? null;
  }

  /** Initial test-set diagnostic returned by the performance API. */
  get trainingCalibration(): Calibration | null {
    return (this.data.training_calibration as Calibration | null) ?? null;
  }

  /** Exact serving engine: `engineVersion`, or the `engine` field of the body. */
  get engine(): string | null {
    return this.engineVersion ?? (this.data.engine as string | null | undefined) ?? null;
  }

  /** One field of the response body, typed when the response type declares it. */
  get<K extends keyof T & string>(key: K): T[K];
  get<V = unknown>(key: string, fallback?: V): V;
  get(key: string, fallback?: unknown): unknown {
    return this.data[key] ?? fallback;
  }
}

export class Prediction extends Result<PredictionResponse> {
  /** One entry per row sent, in the same order, each with its `request_id`. */
  get predictions(): PredictionRow[] {
    return this.data.predictions || [];
  }

  get version(): number | null {
    return this.data.version ?? null;
  }
}

/**
 * Forecast result. Use `points()` to parse the rows, or `csv` for the raw CSV.
 */
export class Forecast extends Result<ForecastResponse> {
  get csv(): string {
    return this.data.forecast_csv || '';
  }

  async points(): Promise<ApiRecord[]> {
    if (!this.csv.trim()) return (this.data.forecast || this.data.predictions || []) as ApiRecord[];
    return normaliser(this.csv, 'forecast');
  }

  get backtest(): (ApiRecord & { predictions?: BacktestPrediction[] | null }) | null {
    return this.data.backtest ?? null;
  }

  get target(): string | null { return this.data.target ?? null; }

  get horizon(): number | null { return this.data.prediction_length ?? null; }

  get series(): number | null { return this.data.n_series ?? null; }
}

// Un rapport reste un objet ordinaire, celui de l'API ; l'identifiant de
// requete s'y ajoute en propriete non enumerable, hors de JSON.stringify.
function rapport<T extends object>(reponse: Reponse<unknown>): T & ResponseMetadata {
  const brut = reponse.corps;
  const objet = (brut && typeof brut === 'object' && !Array.isArray(brut) ? { ...brut } : {}) as T;
  Object.defineProperty(objet, 'requestId', { value: reponse.meta.requestId, enumerable: false });
  return objet as T & ResponseMetadata;
}

// Requete interne, hors du contrat moteur genere. Le catalogue se lit sans cle.
const REQUETE_MOTEURS: Requete = {
  methode: 'GET',
  chemin: '/v1/engines',
  operation: 'engines',
  delai: 15000,
  contexte: 'available engines',
  publique: true,
};

function refreshAbsorbe(exc: unknown) {
  return exc instanceof SpavikConflict && exc.code === 'NO_PENDING_OUTCOMES';
}

function modelData(response: ApiRecord | null | undefined): ModelData {
  const corps = response && typeof response === 'object' ? response : {};
  const modele = (corps.model && typeof corps.model === 'object' ? corps.model : corps) as ModelData;
  return { ...modele,
    ...(corps.version && typeof corps.version === 'object' ? { training: corps.version } : {}) };
}

export class Model {
  declare private _client: Spavik;
  declare private _donnees: ModelData;
  constructor(client: Spavik, donnees: ModelData) {
    this._client = client;
    this._donnees = { ...donnees };
  }

  get id(): string { return this._donnees.id; }

  get name(): string | null { return this._donnees.name ?? null; }

  get version(): number | null { return this._donnees.latest_version ?? this._donnees.version ?? null; }

  get task(): 'classification' | 'regression' | null { return this._donnees.task ?? null; }

  /** The column the model predicts. */
  get target(): string | null { return this._donnees.target ?? null; }

  get status(): ModelData['status'] | null { return this._donnees.status ?? null; }

  get engine(): string | null { return this._donnees.engine ?? null; }

  get engineFamily(): string | null { return this._donnees.engine_family ?? null; }

  get training(): ModelVersionInfo | null {
    return (this._donnees.training as ModelVersionInfo | undefined) ?? null;
  }

  /** The columns predict must carry (`feature_columns` at the API); empty when not recorded. */
  get features(): string[] {
    return Array.isArray(this._donnees.feature_columns) ? [...this._donnees.feature_columns] : [];
  }

  /** The model as the API described it, plus `training` after `train()`. */
  get data(): ModelData & { training?: ModelVersionInfo } { return { ...this._donnees }; }

  /** Score rows. Each row costs the serving engine's credit price. */
  async predict(rows: DataInput, options: PredictOptions = {}): Promise<Prediction> {
    const plan = await ops.predict(this.id, rows, options);
    const { corps, meta } = await this._client._envoyerAvecMeta<PredictionResponse>(plan.requete);
    return new Prediction(corps, null, meta);
  }

  /** Archive: the model stops serving and frees its slot; everything is kept. Free. */
  async archive(): Promise<void> {
    await this._client._envoyer(ops.archive(this.id).requete);
  }

  /**
   * Bring this archived model back into service and return it, updated from
   * the API response. It takes a model slot again. Free.
   */
  async restore(): Promise<Model> {
    const restaure = await this._client.restore(this.id);
    this._donnees = { ...this._donnees, ...restaure._donnees };
    return this;
  }

  /** Submit observed outcomes with features and actual on every plan. Free. */
  async submitOutcomes(outcomes: Outcome | readonly Outcome[] | string, options: SubmitOutcomesOptions = {}): Promise<Result<OutcomesReceipt>> {
    const plan = await ops.submitOutcomes(this.id, outcomes, options);
    const { corps, meta } = await this._client._envoyerAvecMeta<OutcomesReceipt>(plan.requete);
    return new Result(corps, 0, meta);
  }

  /**
   * Integrate pending outcomes into a new model version. Free.
   * Returns `null` only when there are no pending outcomes; other API failures are raised.
   */
  async refresh(options: RefreshOptions = {}): Promise<Result<RefreshResult> | null> {
    const plan = ops.refresh(this.id, options);
    try {
      const { corps, meta } = await this._client._envoyerAvecMeta<RefreshResult>(plan.requete);
      return new Result(corps, 0, meta);
    } catch (exc) {
      if (refreshAbsorbe(exc)) return null;
      throw exc;
    }
  }

  /** Observed performance and initial calibration. API failures are raised. Free. */
  async performance(days = 30): Promise<Result<PerformanceReport>> {
    const plan = ops.performance(this.id, days);
    const { corps, meta } = await this._client._envoyerAvecMeta<PerformanceReport>(plan.requete);
    return new Result(corps, 0, meta);
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

  /** @internal */
  async _envoyerAvecMeta<T = ApiRecord>(requete: Requete): Promise<Reponse<T>> {
    return this.envoyerAvecMeta<T>(requete);
  }

  /** Available engines as the API describes them (id, label, status). Free; no API key needed. */
  async engines(): Promise<Engine[]> {
    const entrees = await this._envoyer<Engine[]>(REQUETE_MOTEURS);
    return Array.isArray(entrees) ? entrees.filter((e) => e && typeof e === 'object').map((e) => ({ ...e })) : [];
  }

  /** Families and the configured default, as returned by the API. Free; no API key needed. */
  async engineFamilies(): Promise<EngineFamily[]> {
    return this._envoyer({ ...REQUETE_MOTEURS, chemin: '/v1/engine-families' });
  }

  /**
   * The account as the API sees it: plan, balance, monthly allowance, period,
   * consumption. The Free plan includes 100 predictions per calendar month,
   * reset on the 1st at 00:00 UTC. Free.
   */
  async usage(): Promise<Usage & ResponseMetadata> {
    return rapport<Usage>(await this._envoyerAvecMeta(ops.usage().requete));
  }

  /**
   * What training would say of this table, plus a trial run of the engine:
   * validation, hint, trial and assessment (status, metric, message), unchanged.
   * Like training, it needs at least 100 rows (`too_few_rows`), and warns below
   * 200 (`few_rows`). No fallback conclusion. Creates nothing, charges nothing.
   */
  async evaluate(data: DataInput, options: EvaluateOptions): Promise<EvaluationReport & ResponseMetadata> {
    const plan = await ops.evaluate(data, options);
    return rapport<EvaluationReport>(await this._envoyerAvecMeta(plan.requete));
  }

  /**
   * Whether forecasting this series is worth paying for: the series checked,
   * its history replayed against references. assessment is preserved unchanged.
   * No fallback conclusion, no forecast, no charge.
   */
  async backtest(data: DataInput, options: BacktestOptions): Promise<BacktestReport & ResponseMetadata> {
    const plan = await ops.backtest(data, options);
    return rapport<BacktestReport>(await this._envoyerAvecMeta(plan.requete));
  }

  /** Archive a model by identifier, without reading it first. */
  async archive(modelId: string): Promise<void> {
    await this._envoyer(ops.archive(modelId).requete);
  }

  /**
   * Bring an archived model back into service, by identifier, and return the
   * model as the API describes it. No prior read: reading an archived model
   * answers MODEL_ARCHIVED, which would make the restore impossible.
   */
  async restore(modelId: string): Promise<Model> {
    const brut = await this._envoyer<ApiRecord | null>(ops.restore(modelId).requete);
    const donnees = modelData(brut);
    return new Model(this, { ...donnees, id: donnees.id || modelId });
  }

  /** Create and train a model in one call. Needs at least 100 rows. Free. */
  async train(data: DataInput, options: TrainOptions): Promise<Model> {
    // Les controles locaux d'abord : un refus prononce ici ne doit toucher ni
    // le reseau ni le catalogue des moteurs.
    const plan = await ops.train(data, options);
    const { corps, meta } = await this._envoyerAvecMeta<ApiRecord | null>(plan.requete);
    const donnees = modelData(corps);
    if (typeof donnees.id !== 'string' || !donnees.id) {
      // Le modele existe peut-etre : la cle permet de rejouer sans en creer un second.
      const erreur = new SpavikError(
        'training: the API answered without a model identifier. The model may exist: '
        + 'list your models, or retry with the same idempotencyKey, before training again.',
        { requestId: meta.requestId },
      );
      erreur.idempotencyKey = plan.requete.idempotence ?? null;
      throw erreur;
    }
    return new Model(this, donnees);
  }

  /** Forecast time series. Billed by the API at horizon times the serving engine tariff, all series included. */
  async forecast(data: DataInput, options: ForecastOptions): Promise<Forecast> {
    const plan = await ops.forecast(data, options);
    const { corps, meta } = await this._envoyerAvecMeta<ForecastResponse>(plan.requete);
    return new Forecast(corps, plan.cout, meta);
  }

  /**
   * Iterate over serving models, fetching pages automatically until the API
   * reports no more. `limit` is the page size, at most 200.
   * Use `status: 'archived'` for archived models.
   */
  async* models(options: ListModelsOptions = {}): AsyncGenerator<Model, void, undefined> {
    ops.verifierListe(options);
    const { limit = 50, status } = options ?? {};
    if (!Number.isInteger(limit) || limit < 1) {
      throw new SpavikDataError(`models: limit must be a positive integer, got ${String(limit)}. Nothing was sent.`);
    }
    const page = Math.min(limit, ops.PAGE_MAX);
    let offset = 0;
    for (;;) {
      const plan = ops.listModels(page, offset, status);
      const brut = (await this._envoyer<ApiRecord | null>(plan.requete)) || {};
      const lot = (brut.data as ModelData[]) || [];
      for (const entree of lot) yield new Model(this, entree);
      if (!lot.length) return;
      offset += lot.length;
      const pagination = (brut.pagination ?? {}) as { total?: number; has_more?: boolean };
      // has_more fait foi ; sans lui, le total, puis une page incomplete.
      if (pagination.has_more === false) return;
      if (pagination.has_more === undefined
        && ((pagination.total != null && offset >= pagination.total) || lot.length < page)) return;
    }
  }

  /** Read an existing model by identifier. */
  async model(modelId: string): Promise<Model> {
    const plan = ops.getModel(modelId);
    const brut = await this._envoyer<ApiRecord | null>(plan.requete);
    return new Model(this, modelData(brut));
  }
}
