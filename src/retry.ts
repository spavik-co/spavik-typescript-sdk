import type { Requete } from './internal.js';
const STOP = new Set(['REQUEST_INTERRUPTED', 'IDEMPOTENCY_RESPONSE_UNAVAILABLE', 'IDEMPOTENCY_KEY_REUSED', 'CREDITS_EXHAUSTED']);
const DELAYS: Record<string, number> = { REQUEST_IN_PROGRESS: 2000, ENGINE_BUSY: 5000,
  ENGINE_UNAVAILABLE: 5000, USAGE_ACCOUNTING_UNAVAILABLE: 5000, RATE_LIMIT_UNAVAILABLE: 5000, REQUEST_LOG_UNAVAILABLE: 5000 };
export function retryAllowed(status: number | null, code: string | null | undefined, request: Requete): boolean {
  if (code && STOP.has(code)) return false;
  const safe = request.methode === 'GET' || !!request.idempotence ||
    ['/v1/datasets/evaluate', '/v1/forecast/backtest'].includes(request.chemin);
  if (!safe) return false;
  if (code === 'REQUEST_IN_PROGRESS') return !!request.idempotence;
  return status === null || [429, 500, 502, 503, 504].includes(status);
}
export function retryDelay(value: string | null, code: string | null | undefined, fallback: number): number {
  if (value?.trim()) {
    const seconds = Number(value);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
    if (Number.isFinite(delay) && delay >= 0) return delay;
  }
  return (code && DELAYS[code]) || fallback;
}
