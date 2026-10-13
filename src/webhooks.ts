// Verification des webhooks entrants.
//
// WebCrypto plutot que node:crypto, pour que la verification marche aussi sur
// un runtime edge. La comparaison est a temps constant : une comparaison naive
// laisse fuir, par sa duree, le prefixe correct d'une signature forgee.

import { SpavikSignatureError } from './errors.js';

export const TOLERANCE_SECONDES = 300;

function entete(entetes: Headers | Record<string, string>, ...noms: string[]) {
  const lire = entetes != null && 'get' in entetes && typeof entetes.get === 'function'
    ? (n: string) => (entetes as Headers).get(n)
    : (n: string) => {
      const bas = Object.fromEntries(
        Object.entries(entetes || {}).map(([k, v]) => [k.toLowerCase(), v]),
      );
      return bas[n.toLowerCase()];
    };
  for (const nom of noms) {
    const valeur = lire(nom);
    if (valeur) return valeur;
  }
  return null;
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
 * Pass the raw request bytes; parsing and serializing the body changes its signature.
 */
export async function verifier(corps: string | Uint8Array | ArrayBuffer, entetes: Headers | Record<string, string>, secret: string, { tolerance = TOLERANCE_SECONDES }: { tolerance?: number } = {}): Promise<Record<string, unknown>> {
  const encodeur = new TextEncoder();
  const octets = typeof corps === 'string' ? encodeur.encode(corps) : new Uint8Array(corps);

  const signature = entete(entetes, 'X-Spavik-Signature', 'X-Signature');
  if (!signature) throw new SpavikSignatureError('no signature header on the request.');
  const horodatage = entete(entetes, 'X-Spavik-Timestamp', 'X-Timestamp');

  let charge = octets;
  if (horodatage) {
    const emis = Number.parseInt(horodatage, 10);
    if (!Number.isFinite(emis)) {
      throw new SpavikSignatureError(`unreadable timestamp: '${horodatage}'`);
    }
    const ecart = Math.abs(Math.floor(Date.now() / 1000) - emis);
    if (ecart > tolerance) {
      throw new SpavikSignatureError(
        `timestamp is ${ecart} s old, beyond the ${tolerance} s tolerance. Likely a replay.`,
      );
    }
    const prefixe = encodeur.encode(`${emis}.`);
    charge = new Uint8Array(prefixe.length + octets.length);
    charge.set(prefixe, 0);
    charge.set(octets, prefixe.length);
  }

  // Node 18 fournit WebCrypto dans node:crypto sans toujours l'exposer globalement.
  const subtle = globalThis.crypto?.subtle ?? (await import('node:crypto')).webcrypto.subtle;
  const cle = await subtle.importKey(
    'raw', encodeur.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const attendue = hex(await subtle.sign('HMAC', cle, charge));
  const fournie = signature.includes('=') ? signature.split('=').pop()!.trim() : signature.trim();

  if (!egalTempsConstant(attendue, fournie)) {
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
