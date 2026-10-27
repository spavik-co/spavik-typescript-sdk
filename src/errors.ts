// Erreurs Spavik.
//
// Une classe par famille, chacune portant le code machine, le detail rendu par
// l'API, le statut HTTP et le `requestId`. Ce dernier est la seule chose
// exploitable pour un support : il est emis sur chaque reponse.
//
// Les noms sont ceux de la bibliotheque Python, a la lettre. La suite de
// conformite le verifie.

import { ERROR_FAMILY_BY_CODE } from './contract.js';

// Un code machine de l'API est en majuscules avec des soulignes. La passerelle,
// elle, rend ses propres erreurs sous une autre forme :
//   {"code": 404, "message": "The current request is not defined by this API."}
// Sans ce filtre, cette phrase deviendrait le `code` de l'exception.
const CODE_MACHINE = /^[A-Z][A-Z0-9_]*$/;

export interface ErrorOptions {
  code?: string | null;
  detail?: string | null;
  status?: number | null;
  requestId?: string | null;
  payload?: Record<string, unknown>;
}

export class SpavikError extends Error {
  /** Original key for inspecting an uncertain mutation; never replace it automatically. */
  idempotencyKey: string | null = null;
  readonly code: string | null;
  readonly detail: string | null;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly payload: Record<string, unknown>;
  constructor(message: string, { code, detail, status, requestId, payload }: ErrorOptions = {}) {
    super(requestId ? `${message} (request_id: ${requestId})` : message);
    this.name = new.target.name;
    this.code = code ?? null;
    this.detail = detail ?? null;
    this.status = status ?? null;
    this.requestId = requestId ?? null;
    this.payload = payload ?? {};
  }
}

/** Local input rejection. No request was sent or charged. */
export class SpavikDataError extends SpavikError {}
/**
 * Network failure or unreadable API response. `idempotencyKey` identifies an
 * uncertain mutation; a new SDK call generates a new key, so do not retry blindly.
 */
export class SpavikTransportError extends SpavikError {}
/** Missing, invalid, revoked or unauthorized API key. */
export class SpavikAuthError extends SpavikError {}
/** Insufficient credits for the requested operation. `usage()` reports what is left. */
export class SpavikCreditsExhausted extends SpavikError {}
/** A plan limit has been reached. */
export class SpavikQuotaExceeded extends SpavikError {}
/** The API rejected the request data. */
export class SpavikValidationError extends SpavikError {}
/** The requested resource does not exist in this workspace. */
export class SpavikNotFound extends SpavikError {}
/** The current state prevents this operation. */
export class SpavikConflict extends SpavikError {}
/** Request rate limit exceeded. */
export class SpavikRateLimited extends SpavikError {}
/** An API dependency is unavailable. */
export class SpavikUnavailable extends SpavikError {}
/** API server failure. */
export class SpavikServerError extends SpavikError {}
/** Invalid or replayed webhook signature. */
export class SpavikSignatureError extends SpavikError {}

const PAR_FAMILLE: Record<string, typeof SpavikError> = {
  auth: SpavikAuthError,
  credits: SpavikCreditsExhausted,
  quota: SpavikQuotaExceeded,
  validation: SpavikValidationError,
  not_found: SpavikNotFound,
  conflict: SpavikConflict,
  rate_limit: SpavikRateLimited,
  unavailable: SpavikUnavailable,
  server: SpavikServerError,
  encryption: SpavikAuthError,
  hors_perimetre: SpavikError,
};

const PAR_STATUT: Record<number, typeof SpavikError> = {
  400: SpavikValidationError,
  401: SpavikAuthError,
  402: SpavikCreditsExhausted,
  403: SpavikAuthError,
  404: SpavikNotFound,
  409: SpavikConflict,
  413: SpavikQuotaExceeded,
  422: SpavikValidationError,
  429: SpavikRateLimited,
  503: SpavikUnavailable,
};

function classe(code: string | null, status: number | null) {
  if (code) {
    const famille = ERROR_FAMILY_BY_CODE[code];
    if (famille && famille !== 'hors_perimetre') return PAR_FAMILLE[famille];
  }
  if (status != null) {
    if (PAR_STATUT[status]) return PAR_STATUT[status];
    if (status >= 500) return SpavikServerError;
  }
  return SpavikError;
}

export function depuisReponse(status: number, corps: unknown, requestId: string | null, contexte = '') {
  let code = null;
  let detail = null;
  let payload: Record<string, unknown> = {};
  if (corps && typeof corps === 'object' && !Array.isArray(corps)) {
    payload = corps as Record<string, unknown>;
    const message = payload.message;
    const messageDetail = payload.messageDetail;
    if (typeof message === 'string') {
      if (CODE_MACHINE.test(message)) code = message;
      // Erreur emise en amont de l'API, la passerelle par exemple.
      else detail = message;
    }
    if (typeof messageDetail === 'string') detail = messageDetail;
  }
  let phrase = detail || code || `HTTP ${status}`;
  if (contexte) phrase = `${contexte}: ${phrase}`;
  if (code && detail) phrase = `${phrase} [${code}]`;

  const Classe = classe(code, status);
  return new Classe(phrase, { code, detail, status, requestId, payload });
}

/**
 * L'API a repondu autre chose que du JSON.
 *
 * Le cas se produit sur une route inconnue, ou l'API rend la page d'erreur par
 * defaut du serveur, en HTML. Sans cette garde, l'appelant recevrait une erreur
 * de parsing JSON au lieu d'une erreur exploitable.
 */
export function reponseIllisible(status: number, contentType: string, texte: string, requestId: string | null) {
  const extrait = texte.split(/\s+/).join(' ').slice(0, 120);
  return new SpavikTransportError(
    `non-JSON response from the API (HTTP ${status}, content-type ${contentType || 'missing'}): ${extrait}`,
    { status, requestId },
  );
}
