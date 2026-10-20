export interface OperationInfo {
  method: string;
  path: string;
  billable: boolean;
  cost: string;
  idempotent: boolean;
  timeout: number;
  idempotency_declared_in_contract: boolean;
}


/** One data row: column names and scalar values. */
export type Row = Record<string, string | number | boolean | null>;

/**
 * An array of rows, a single row, a CSV or JSON file path, or raw CSV/JSON text.
 */
export type DataInput = Row[] | Row | string;

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

export interface ClientOptions {
  /** API key, prefix `sk-spv-api-`. Defaults to `SPAVIK_API_KEY`. */
  apiKey?: string;
  /** Application User-Agent, e.g. "my-agent/1.0". Defaults to the SDK name/version. */
  userAgent?: string;
  /** Defaults to `SPAVIK_BASE_URL` or `https://api.spavik.co`. */
  baseUrl?: string;
  /** Fallback timeout per attempt in milliseconds, including the response body; operations have their own timeouts. */
  timeout?: number;
  /** Custom fetch implementation for testing or a specific runtime. */
  fetch?: typeof globalThis.fetch;
  /** Maximum number of attempts, including retries. Defaults to three. */
  maxRetries?: number;
  /** Delay between attempts, in milliseconds. */
  backoff?: (tentative: number) => number;
}

export interface TrainOptions {
  /** Target column to predict. */
  target: string;
  engineFamily?: string;
  name?: string;
  explain?: boolean;
  autoUpdate?: boolean;
}

export interface EvaluateOptions {
  /** Target column to predict. */
  target: string;
  engineFamily?: string;
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

export interface PredictOptions {
  engineVersion?: string;
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

export interface ForecastOptions {
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
export interface EvaluationReport extends Record<string, unknown> {
  trial?: (Record<string, unknown> & { calibration?: Calibration | null }) | null;
}
export interface BacktestReport extends Record<string, unknown> {
  backtest?: (Record<string, unknown> & { predictions?: BacktestPrediction[] | null }) | null;
}
