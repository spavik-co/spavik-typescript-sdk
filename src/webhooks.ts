// Verification des webhooks entrants.
//
// WebCrypto plutot que node:crypto, pour que la verification marche aussi sur
// un runtime edge. La comparaison est a temps constant : une comparaison naive
// laisse fuir, par sa duree, le prefixe correct d'une signature forgee.

import { SpavikSignatureError } from './errors.js';

export const TOLERANCE_SECONDES = 300;

function entete(entetes: Headers | Record<string, string>, nom: string): string | null {
  if (entetes != null && 'get' in entetes && typeof entetes.get === 'function') {
    return (entetes as Headers).get(nom);
  }
  for (const [cle, valeur] of Object.entries(entetes || {})) {
    if (cle.toLowerCase() === nom.toLowerCase()) return valeur;
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
export async function verifier(corps: string | Uint8Array | ArrayBuffer, entetes: Headers | Record<string, string>, secret: string, { tolerance = TOLERANCE_SECONDES }: { tolerance?: number } = {}): Promise<Record<string, unknown>> {
  const encodeur = new TextEncoder();
  const octets = typeof corps === 'string' ? encodeur.encode(corps) : new Uint8Array(corps);

  const valeur = entete(entetes, 'Spavik-Signature');
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

  // Node 18 fournit WebCrypto dans node:crypto sans toujours l'exposer globalement.
  const subtle = globalThis.crypto?.subtle ?? (await import('node:crypto')).webcrypto.subtle;
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
