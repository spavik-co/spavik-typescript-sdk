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
export type Ligne = Record<string, string | number | boolean | null>;

/**
 * An array of rows, a single row, a CSV or JSON file path, or raw CSV/JSON text.
 */
export type Donnees = Ligne[] | Ligne | string;

export interface OptionsClient {
  /** API key, prefix `sk-spv-api-`. Defaults to `SPAVIK_API_KEY`. */
  apiKey?: string;
  /** Defaults to `SPAVIK_BASE_URL` or the built-in test API URL. */
  baseUrl?: string;
  /** Fallback timeout in milliseconds; operations have their own timeouts. */
  timeout?: number;
  /** Custom fetch implementation for testing or a specific runtime. */
  fetch?: typeof globalThis.fetch;
  /** Maximum number of attempts, including retries. Defaults to three. */
  maxRetries?: number;
  /** Delay between attempts, in milliseconds. */
  backoff?: (tentative: number) => number;
}

export interface OptionsTrain {
  /** Target column to predict. */
  target: string;
  engine?: string;
  name?: string;
  explain?: boolean;
  autoUpdate?: boolean;
}

export interface OptionsEvaluate {
  /** Target column to predict. */
  target: string;
  engine?: string;
}

export interface OptionsBacktest {
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

export interface Engine {
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

export interface OptionsForecast {
  target: string;
  horizon: number;
  timestamp?: string;
  quantiles?: number[];
  itemId?: string;
  pointEstimate?: string;
}
