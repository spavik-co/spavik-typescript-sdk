export interface OperationInfo {
  method: string;
  path: string;
  billable: boolean;
  cost: string;
  idempotent: boolean;
  timeout: number;
  idempotency_declared_in_contract: boolean;
}


/**
 * One cell value. `Date` is sent as an ISO 8601 string; `undefined` is
 * dropped, so the API reads the cell as empty.
 */
export type Value = string | number | boolean | null | undefined | Date;

/** One data row: column names and scalar values. */
export type Row = { [column: string]: Value };

/**
 * An array of rows (plain objects or values typed with your own interfaces,
 * readonly arrays included), a single row, a CSV or JSON file path, or raw
 * CSV/JSON text. A string that starts with `[` or `{` is read as JSON; a string
 * ending in .csv, .tsv, .txt or .json, or containing a `/`, is read as a file
 * path; any other string is read as CSV.
 */
export type DataInput = readonly object[] | Row | string;

/**
 * An observed outcome with its full feature row, required on every plan.
 * The optional request ID is correlation metadata, never an archive lookup.
 */
export type Outcome = {
  features: Row;
  request_id?: string;
  actual: string | number | boolean;
  /** Original prediction for aggregate performance measurement; requires version and engine. */
  prediction?: string | number | boolean;
  /** Original class probabilities, with each value between 0 and 1. */
  probabilities?: Record<string, number>;
  /** Positive integer identifying the model version that produced the prediction. */
  version?: number;
  /** Exact serving engine identifier, such as presage-2; aliases are not accepted. */
  engine?: string;
} & (
  | { prediction?: undefined }
  | { prediction: string | number | boolean; version: number; engine: string }
);

/** Option shared by the operations that change something or are billed. */
export interface IdempotencyOptions {
  /**
   * Idempotency-Key sent with the request and reused on every retry, at most
   * 255 characters. Pass the `idempotencyKey` of a failed call to replay it
   * without a second charge. Defaults to a new random key per call.
   */
  idempotencyKey?: string;
}

export interface ClientOptions {
  /** API key, prefix `sk-spv-api-`. Defaults to `SPAVIK_API_KEY`. */
  apiKey?: string;
  /** Application User-Agent, e.g. "my-agent/1.0". Defaults to the SDK name/version. */
  userAgent?: string;
  /** Defaults to `SPAVIK_BASE_URL` or `https://api.spavik.co`. */
  baseUrl?: string;
  /**
   * Timeout per attempt in milliseconds, including the response body. When set,
   * it replaces the default of every operation (for example 120 s for training
   * and evaluation, 30 s for prediction).
   */
  timeout?: number;
  /** Custom fetch implementation for testing or a specific runtime. */
  fetch?: typeof globalThis.fetch;
  /** Maximum number of attempts, including retries. Defaults to three. */
  maxRetries?: number;
  /** Delay between attempts, in milliseconds. */
  backoff?: (tentative: number) => number;
}

export interface TrainOptions extends IdempotencyOptions {
  /** Target column to predict. */
  target: string;
  engineFamily?: string;
  name?: string;
  autoUpdate?: boolean;
}

export interface EvaluateOptions {
  /** Target column to predict. */
  target: string;
  /** Kind of answer; the API infers it from the target when omitted. */
  task?: 'classification' | 'regression';
  /** Maximum rows used by the trial run; the API caps it to the plan. */
  maxSamples?: number;
  /** Also rank every feature column in trial.feature_importance. Slower on wide tables. */
  explain?: boolean;
}

/** One feature column and the drop in trial score when its values are shuffled. */
export interface FeatureImportance {
  feature: string;
  importance: number;
}

export interface BacktestOptions {
  engineFamily?: string;
  engineVersion?: string;
  includeBacktestPredictions?: boolean;
  target: string;
  /** Steps per replayed window, 1 by default. */
  horizon?: number;
  timestamp?: string;
  itemId?: string;
  /** Quantile levels forwarded to the API, as in forecast. */
  quantiles?: number[];
  /** Point estimate evaluated by the backtest; the API default is mean. */
  pointEstimate?: 'mean' | 'median';
}

export interface EngineFamily {
  id: string;
  label: string;
  is_default: boolean;
}

export interface PredictOptions extends IdempotencyOptions {
  engineVersion?: string;
}

export type SubmitOutcomesOptions = IdempotencyOptions;

export type RefreshOptions = IdempotencyOptions;

export interface ListModelsOptions {
  /** Models fetched per page, at most 200. Iteration continues over every page. */
  limit?: number;
  /** `archived` lists archived models; serving models otherwise. */
  status?: 'archived';
}

export interface Engine {
  family?: string;
  version?: string;
  id: string;
  label?: string;
  status?: 'default' | 'preview' | 'deprecated' | string;
  description?: string;
  tasks?: string[];
  rank?: number;
  /** Credits charged per prediction on this engine. */
  credits?: number;
  min_plan?: string | null;
  retires_at?: string | null;
}

export interface ForecastOptions extends IdempotencyOptions {
  engineFamily?: string;
  engineVersion?: string;
  backtest?: boolean;
  includeBacktestPredictions?: boolean;
  target: string;
  horizon: number;
  timestamp?: string;
  quantiles?: number[];
  itemId?: string;
  pointEstimate?: 'mean' | 'median';
}


/** Descriptive test-set calibration; this does not recalibrate probabilities. */
export interface Calibration {
  available: boolean;
  unavailable_reason: 'no_evaluated_samples' | 'insufficient_classes' | 'missing_probabilities' | 'invalid_probabilities' | 'unknown_actual_class' | null;
  evaluated_count: number;
  evaluated_on: 'test';
  kind: 'one_vs_rest';
  interpretation: 'descriptive_only';
  binning: 'uniform';
  n_bins: 10;
  bin_boundaries: 'left_closed_right_open_last_closed';
  per_class: { class: string; bins: CalibrationBin[] }[];
}
export interface CalibrationBin {
  lower: number;
  upper: number;
  count: number;
  positive_count: number;
  mean_predicted_probability: number | null;
  observed_frequency: number | null;
}
/** Historical evaluated point, never a future forecast. */
export interface BacktestPrediction {
  series: string;
  window: number;
  timestamp: string;
  actual: number;
  prediction: number;
  naive_prediction: number;
  constant_prediction: number;
  quantiles: Record<string, number>;
}
/**
 * The single conclusion of the API on an evaluation, a backtest or observed
 * performance. Forward it as is: it is a comparison on the evaluated sample,
 * not a guarantee of future quality.
 */
export interface Assessment {
  status: 'better_than_baseline' | 'not_better_than_baseline' | 'inconclusive' | 'not_evaluated';
  metric: 'AUC' | 'MAE' | 'MASE';
  message: string;
}

/** One finding of the data validation. `too_few_rows` is an error below 100 rows, `few_rows` a warning below 200. */
export interface ValidationIssue extends Record<string, unknown> {
  code: string;
  severity: 'error' | 'warning' | string;
  column: string | null;
  message: string;
}

export interface ValidationReport extends Record<string, unknown> {
  status: 'passed' | 'warnings' | 'failed' | string;
  row_count?: number;
  issues: ValidationIssue[];
}

/** Request metadata copied from the response headers, never part of the body. */
export interface ResponseMetadata {
  /** X-Spavik-Request-Id of the response, to quote to support. */
  readonly requestId: string | null;
}

export interface EvaluationTrial extends Record<string, unknown> {
  metrics?: Record<string, number | null> | null;
  baselines?: Record<string, unknown> | null;
  n_test?: number | null;
  calibration?: Calibration | null;
  feature_importance?: FeatureImportance[] | null;
}

/** What `evaluate()` returns: the validation, a trial run and the API conclusion. */
export interface EvaluationReport extends Record<string, unknown> {
  target: string;
  task: 'classification' | 'regression';
  n_rows: number;
  columns: string[];
  validation: ValidationReport;
  /** The API conclusion, always present on a successful response. */
  assessment: Assessment;
  /** What to do first when validation found a problem, in plain words. */
  hint: string | null;
  trial: EvaluationTrial | null;
}

export interface BacktestReport extends Record<string, unknown> {
  validation?: ValidationReport;
  assessment: Assessment;
  hint?: string | null;
  backtest?: (Record<string, unknown> & { predictions?: BacktestPrediction[] | null }) | null;
}

/** A model as the API describes it. */
export interface ModelInfo extends Record<string, unknown> {
  id: string;
  name?: string | null;
  slug?: string | null;
  engine_family?: string | null;
  target?: string | null;
  task?: 'classification' | 'regression' | null;
  engine?: string | null;
  feature_columns?: string[] | null;
  status?: 'draft' | 'training' | 'ready' | 'failed' | 'archived';
  auto_update?: boolean;
  latest_version?: number | null;
  created_at?: string;
}

/** One trained version of a model. */
export interface ModelVersionInfo extends Record<string, unknown> {
  id?: string;
  version: number;
  status?: 'training' | 'ready' | 'failed';
  target?: string;
  task?: string;
  n_train?: number | null;
  metrics?: Record<string, number | null> | null;
  calibration?: Calibration | null;
  warnings?: string[] | null;
  engine?: string | null;
}

/** One scored row, in the order sent. Classification adds one `proba_<class>` per class. */
export interface PredictionRow extends Record<string, unknown> {
  /** Prediction identifier to send back with the outcome, as `request_id`. */
  request_id: string;
  prediction: number | string | boolean;
}

export interface PredictionResponse extends Record<string, unknown> {
  model_id?: string;
  version?: number;
  engine?: string;
  n_scored?: number;
  predictions: PredictionRow[];
}

export interface ForecastResponse extends Record<string, unknown> {
  forecast_csv?: string;
  target?: string | null;
  prediction_length?: number | null;
  n_series?: number | null;
  n_context?: number | null;
  point_estimate?: 'mean' | 'median' | null;
  backtest?: (Record<string, unknown> & { predictions?: BacktestPrediction[] | null }) | null;
  engine?: string | null;
}

/** What `submitOutcomes()` returns. */
export interface OutcomesReceipt extends Record<string, unknown> {
  accepted: number;
  pending_outcomes: number;
  refresh_triggered?: boolean;
  refresh_suggested?: boolean;
}

/** What `refresh()` returns: the new version that serves predictions right away. */
export interface RefreshResult extends Record<string, unknown> {
  model: ModelInfo;
  version: ModelVersionInfo;
  outcomes_applied: number;
  incomplete_outcomes: number;
  context_size: number | null;
}

export interface ObservedPerformance extends Record<string, unknown> {
  metric: 'accuracy' | 'mean_absolute_error';
  compared: number;
  value: number | null;
  baseline: number | null;
  better_than_baseline: boolean | null;
  metrics?: Record<string, number | null> | null;
  assessment?: Assessment;
}

/** What `performance()` returns. `observed` stays null until outcomes carry their original prediction. */
export interface PerformanceReport extends Record<string, unknown> {
  model_id: string;
  version: number;
  task: 'classification' | 'regression';
  pending_outcomes: number;
  refresh_suggested: boolean;
  training_metrics?: Record<string, number | null> | null;
  training_calibration?: Calibration | null;
  observed: ObservedPerformance | null;
}

/** Calls and billed predictions over a period. */
export interface UsageCounts {
  units: number;
  predictions: number;
}

export interface UsageBreakdown extends UsageCounts {
  key: string;
  label?: string | null;
}

/** What `usage()` returns: plan, balance, monthly allowance and consumption. */
export interface Usage extends Record<string, unknown> {
  plan: string;
  /** Purchased or granted predictions, spent after the monthly allowance; never expires. */
  credit_balance: number;
  credits_low: boolean;
  /** Monthly allowance left plus balance; null on an unlimited plan. */
  predictions_remaining?: number | null;
  unlimited_usage?: boolean;
  /** Predictions included each calendar month (100 on the Free plan). */
  included_units_per_month: number | null;
  period: { key: string; reset_at: string | null; units_used: number };
  window?: { from: string; to: string };
  totals?: UsageCounts;
  daily?: (UsageCounts & { date: string })[];
  by_kind?: UsageBreakdown[];
  by_workspace?: UsageBreakdown[];
  by_api_key?: UsageBreakdown[];
}
