// Usages Node de la documentation, avec les types de Node : Express rend
// req.headers en IncomingHttpHeaders.
import type { IncomingHttpHeaders } from 'node:http';
import { verify, SpavikSignatureError } from 'spavik';

export async function webhook(rawBody: Uint8Array, headers: IncomingHttpHeaders, secret: string | undefined): Promise<number> {
  try {
    const event = await verify(rawBody, headers, secret ?? '');
    return typeof event.type === 'string' ? 200 : 400;
  } catch (error) {
    if (error instanceof SpavikSignatureError) return 400;
    throw error;
  }
}
