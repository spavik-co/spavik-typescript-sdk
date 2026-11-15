// Verification des webhooks entrants.
//
// WebCrypto plutot que node:crypto, pour que la verification marche aussi sur
// un runtime edge. La comparaison est a temps constant : une comparaison naive
// laisse fuir, par sa duree, le prefixe correct d'une signature forgee.

import { SpavikError, SpavikSignatureError } from './errors.js';

export const TOLERANCE_SECONDS = 300;

/**
 * Request headers: a Fetch `Headers` object, or a plain object such as Node's
 * `IncomingHttpHeaders` (Express `req.headers`), whose values may be arrays.
 */
export type WebhookHeaders = Headers | Record<string, string | readonly string[] | undefined>;

function entete(entetes: WebhookHeaders, nom: string): string | null {
  if (entetes != null && 'get' in entetes && typeof entetes.get === 'function') {
    return (entetes as Headers).get(nom);
  }
  for (const [cle, valeur] of Object.entries(entetes || {})) {
    if (cle.toLowerCase() !== nom.toLowerCase()) continue;
    // Node rend un tableau quand l'en-tete est repete : le premier fait foi.
    const premiere = Array.isArray(valeur) ? valeur[0] : valeur;
    if (premiere == null) return null;
    if (typeof premiere !== 'string') {
      throw new SpavikSignatureError(`unreadable ${nom} header, expected a string.`);
    }
    return premiere;
  }
  return null;
}

// Decoupe `t=<secondes>,v1=<hex>` ; plusieurs v1 restent possibles.
function lireSignature(valeur: string): { emis: number; fournies: string[] } {
  let emis: number | null = null;
  const fournies: string[] = [];
  for (const morceau of valeur.split(',')) {
    const [cle, contenu = ''] = morceau.trim().split(/=(.*)/s);
    if (cle === 't' && /^\d+$/.test(contenu)) emis = Number(contenu);
    else if (cle === 'v1' && contenu) fournies.push(contenu.toLowerCase());
  }
  if (emis === null || !Number.isSafeInteger(emis) || fournies.length === 0) {
    throw new SpavikSignatureError(
      'unreadable Spavik-Signature header, expected t=<unix seconds>,v1=<hex>.',
    );
  }
  return { emis, fournies };
}

function hex(tampon: ArrayBuffer) {
  return [...new Uint8Array(tampon)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

function egalTempsConstant(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a webhook signature and return the decoded event.
 * The API sends `Spavik-Signature: t=<unix seconds>,v1=<hex>` and signs `<t>.` followed by the raw bytes.
 * Pass the raw request bytes; parsing and serializing the body changes its signature.
 */
export async function verify(body: string | Uint8Array | ArrayBuffer, headers: WebhookHeaders, secret: string, { tolerance = TOLERANCE_SECONDS }: { tolerance?: number } = {}): Promise<Record<string, unknown>> {
  if (typeof secret !== 'string' || !secret) throw new SpavikSignatureError('missing webhook secret');
  const encodeur = new TextEncoder();
  const octets = typeof body === 'string' ? encodeur.encode(body) : new Uint8Array(body);

  const valeur = entete(headers, 'Spavik-Signature');
  if (!valeur) throw new SpavikSignatureError('no Spavik-Signature header on the request.');
  const { emis, fournies } = lireSignature(valeur);

  const ecart = Math.abs(Math.floor(Date.now() / 1000) - emis);
  if (ecart > tolerance) {
    throw new SpavikSignatureError(
      `timestamp is ${ecart} s old, beyond the ${tolerance} s tolerance. Likely a replay.`,
    );
  }
  const prefixe = encodeur.encode(`${emis}.`);
  const charge = new Uint8Array(prefixe.length + octets.length);
  charge.set(prefixe, 0);
  charge.set(octets, prefixe.length);

  // Node 22 et les runtimes edge exposent WebCrypto globalement : aucun import
  // de node:crypto, qui casserait le bundling pour navigateur.
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new SpavikError('webhook verification needs WebCrypto (globalThis.crypto.subtle), unavailable in this runtime.');
  }
  const cle = await subtle.importKey(
    'raw', encodeur.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const attendue = hex(await subtle.sign('HMAC', cle, charge));

  if (!fournies.some((fournie) => egalTempsConstant(attendue, fournie))) {
    throw new SpavikSignatureError(
      'invalid signature. Check that the body is the raw bytes as received, '
      + "not re-serialised, and that the secret is the calling webhook's.",
    );
  }

  try {
    return JSON.parse(new TextDecoder().decode(octets));
  } catch {
    throw new SpavikSignatureError('valid signature but the body is not JSON.');
  }
}
