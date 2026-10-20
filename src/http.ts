import { retryAllowed, retryDelay } from './retry.js';
import { VERSION } from './version.js';
import type { ClientOptions } from './types.js';
import type { Requete } from './internal.js';
import type { SpavikError } from './errors.js';
// Transport.
//
// Trois choses s'y jouent, identiques a la bibliotheque Python :
//   1. Les reprises ne portent que sur ce qui est reprenable : 429, 5xx, pannes
//      reseau. REQUEST_IN_PROGRESS (409) is retryable with the original key.
//   2. La cle d'idempotence est tiree une fois par appel logique et rejouee
//      telle quelle a chaque tentative. C'est elle qui evite un second debit.
//   3. Une reponse non JSON leve une erreur nommee, pas une erreur de parsing.

import { depuisReponse, reponseIllisible, SpavikTransportError } from './errors.js';

export const REPRISES_MAX = 3;

function env(nom: string) {
  return globalThis.process?.env?.[nom] ?? undefined;
}

export const BASE_URL_TEST = 'https://test-api.spavik.co';
export const BASE_URL_DEFAUT = env('SPAVIK_BASE_URL') || 'https://api.spavik.co';

export function nouvelleCleIdempotence() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, '');
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function masquer(cle: string) {
  if (!cle) return 'none';
  return cle.length > 22 ? `${cle.slice(0, 14)}...${cle.slice(-4)}` : '***';
}

/** Exponentielle avec bruit. Fallback when the API supplies no retry delay. */
export function attente(tentative: number) {
  return Math.min(8000, 500 * 2 ** (tentative - 1)) * (0.75 + Math.random() * 0.5);
}

const dormir = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

function journalActif() {
  return (env('SPAVIK_LOG') || '').toLowerCase() === 'debug';
}

function tracer(requete: Requete, statut: number | null, duree: number, requestId: unknown, cleApi: string, tentative: number) {
  if (!journalActif()) return;
  const idem = (requete.idempotence || '-').slice(0, 8);
  const reprise = tentative > 1 ? `  attempt ${tentative}` : '';
  // eslint-disable-next-line no-console
  console.error(
    `spavik ${requete.methode} ${requete.chemin}  idem=${idem}  `
    + `${(duree / 1000).toFixed(2)}s  ${statut ?? 'network'}  ${requestId || '-'}${reprise}  `
    + `key=${masquer(cleApi)}`,
  );
}

function requestId(entetes: Headers) {
  return entetes.get('x-spavik-request-id') || entetes.get('x-request-id') || null;
}

// Le solde voyage aussi en en-tete : chaque prediction et chaque prevision
// rend X-Spavik-Predictions-Remaining, meme quand le corps ne porte pas le solde.
export const ENTETE_SOLDE = 'x-spavik-predictions-remaining';

function soldeEntete(entetes: Headers) {
  const valeur = entetes.get(ENTETE_SOLDE);
  if (valeur == null || String(valeur).trim() === '') return null;
  const n = Number(valeur);
  return Number.isInteger(n) ? n : null;
}

export function interpreter(statut: number, entetes: Headers, texte: string, requete: Requete): { corps: unknown; erreur: SpavikError | null } {
  const rid = requestId(entetes);
  const contentType = (entetes.get('content-type') || '').toLowerCase();

  if (statut === 204 || texte.trim() === '') {
    return statut < 400
      ? { corps: null, erreur: null }
      : { corps: null, erreur: depuisReponse(statut, null, rid, requete.contexte) };
  }

  if (!contentType.includes('application/json')) {
    return { corps: null, erreur: reponseIllisible(statut, contentType, texte, rid) };
  }

  let corps: unknown;
  try {
    corps = JSON.parse(texte);
  } catch {
    return { corps: null, erreur: reponseIllisible(statut, contentType, texte, rid) };
  }

  if (statut >= 400) {
    return { corps: null, erreur: depuisReponse(statut, corps, rid, requete.contexte) };
  }

  if (corps && typeof corps === 'object' && !Array.isArray(corps)) {
    const objet = corps as Record<string, unknown>;
    objet._request_id = rid;
    if (entetes.has('x-spavik-model-version')) objet._engine_version = entetes.get('x-spavik-model-version');
    const solde = soldeEntete(entetes);
    if (solde !== null && objet._predictions_remaining === undefined) objet._predictions_remaining = solde;
  }
  return { corps, erreur: null };
}

/** Shared client configuration and HTTP transport. */
export class Transport {
  /** @internal */
  declare readonly cleApi: string;
  declare readonly baseUrl: string;
  /** @internal */
  declare readonly timeout: number;
  /** @internal */
  declare readonly userAgent: string;
  /** @internal */
  declare readonly maxRetries: number;
  /** @internal */
  declare readonly backoff: (tentative: number) => number;
  /** @internal */
  declare readonly fetch: typeof globalThis.fetch;
  constructor({
    apiKey, baseUrl, userAgent, timeout = 30000, fetch: fetchImpl,
    maxRetries = REPRISES_MAX, backoff = attente,
  }: ClientOptions = {}) {
    // Une chaine vide ne doit pas reprendre une cle de l'environnement.
    this.cleApi = apiKey ?? env('SPAVIK_API_KEY') ?? '';
    this.baseUrl = (baseUrl || BASE_URL_DEFAUT).replace(/\/+$/, '');
    this.timeout = timeout;
    this.userAgent = userAgent || `spavik-javascript/${VERSION}`;
    // Politique de reprise, remplacable : certains appelants veulent
    // n'en faire aucune, d'autres attendre autrement.
    this.maxRetries = maxRetries;
    this.backoff = backoff;
    this.fetch = fetchImpl || globalThis.fetch;
    if (!this.fetch) {
      throw new SpavikTransportError(
        'no fetch implementation is available in this environment.',
      );
    }
  }

  /** @internal */
  entetes(requete: Requete) {
    // Les cles API passent exclusivement en X-Spavik-Api-Key ; Bearer est reserve aux JWT.
    const e: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': this.userAgent,
      'X-Spavik-Client-Name': 'spavik-sdk-javascript',
      'X-Spavik-Client-Version': VERSION,
    };
    if (this.cleApi) e['X-Spavik-Api-Key'] = this.cleApi;
    if (requete.corps !== undefined && requete.corps !== null) e['Content-Type'] = 'application/json';
    if (requete.idempotence) e['Idempotency-Key'] = requete.idempotence;
    return e;
  }

  /** @internal */
  url(chemin: string, parametres?: Record<string, unknown>) {
    const u = new URL(this.baseUrl + chemin);
    for (const [cle, valeur] of Object.entries(parametres || {})) {
      if (valeur !== undefined && valeur !== null) u.searchParams.set(cle, String(valeur));
    }
    return u.toString();
  }

  /** @internal */
  async envoyer<T = Record<string, unknown>>(requete: Requete): Promise<T> {
    let tentative = 0;
    for (;;) {
      tentative += 1;
      const debut = Date.now();
      const controleur = new AbortController();
      const minuterie = setTimeout(() => controleur.abort(), requete.delai ?? this.timeout);
      let reponse: Response | undefined;
      let texte: string;
      try {
        try {
          reponse = await this.fetch(this.url(requete.chemin, requete.parametres), {
            method: requete.methode,
            headers: this.entetes(requete),
            body: requete.corps == null ? undefined : JSON.stringify(requete.corps),
            signal: controleur.signal,
          });
          texte = await reponse.text();
        } finally {
          // Couvrir le corps, puis liberer le delai avant toute attente de reprise.
          clearTimeout(minuterie);
        }
      } catch (exc) {
        const statut = reponse?.status ?? null;
        const rid = reponse ? requestId(reponse.headers) : null;
        tracer(requete, statut, Date.now() - debut, rid, this.cleApi, tentative);
        // Un corps interrompu apres un 2xx reste une panne reseau. Conserver
        // les refus HTTP deja connus, notamment 401/403, sans les rejouer.
        const statutReprise = statut !== null && statut >= 400 ? statut : null;
        if (tentative < this.maxRetries && retryAllowed(statutReprise, null, requete)) {
          await dormir(retryDelay(reponse?.headers.get('Retry-After') ?? null, null, this.backoff(tentative)));
          continue;
        }
        const quoi = controleur.signal.aborted || (exc instanceof Error && exc.name === 'AbortError')
          ? 'timed out' : exc instanceof Error ? exc.message : 'network failure';
        const erreur = new SpavikTransportError(`${requete.contexte || requete.operation}: ${quoi}`, {
          status: statut, requestId: rid,
        });
        erreur.idempotencyKey = requete.idempotence ?? null;
        erreur.cause = exc;
        throw erreur;
      }

      const { corps, erreur } = interpreter(reponse.status, reponse.headers, texte, requete);
      tracer(requete, reponse.status, Date.now() - debut,
        (corps as Record<string, unknown> | null)?._request_id ?? erreur?.requestId, this.cleApi, tentative);
      if (!erreur) return corps as T;
      erreur.idempotencyKey = requete.idempotence ?? null;
      if (tentative < this.maxRetries && retryAllowed(reponse.status, erreur.code, requete)) {
        await dormir(retryDelay(reponse.headers.get('Retry-After'), erreur.code, this.backoff(tentative)));
        continue;
      }
      throw erreur;
    }
  }
}
