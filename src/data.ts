import type { ApiRecord } from './internal.js';
// Entrees polymorphes.
//
// Le format des donnees est le sujet de l'utilisateur, pas celui de la
// bibliotheque : un tableau d'objets, un chemin de fichier, du CSV brut ou du
// JSON arrivent tous ici et repartent en tableau d'objets.

import { SpavikDataError } from './errors.js';

const EXTENSIONS_CSV = ['.csv', '.tsv', '.txt'];

function typer(valeur: string) {
  // Un CSV ne porte que du texte. Les nombres redeviennent des nombres.
  const brut = valeur.trim();
  if (brut === '') return null;
  if (/^-?\d+$/.test(brut)) {
    const nombre = Number(brut);
    return Number.isSafeInteger(nombre) ? nombre : valeur;
  }
  if (/^-?\d*\.\d+(e-?\d+)?$/i.test(brut)) {
    const nombre = Number(brut);
    return Number.isFinite(nombre) && Math.abs(nombre) <= Number.MAX_SAFE_INTEGER ? nombre : valeur;
  }
  return valeur;
}

function separateur(texte: string) {
  // Compter uniquement les separateurs hors guillemets du premier enregistrement.
  const candidats = [',', ';', '\t', '|'];
  const comptes = candidats.map(() => 0);
  const entete = texte.replace(/^(?:[ \t]*(?:\r\n|\n|\r))*/, '');
  let entreGuillemets = false;
  for (let i = 0; i < entete.length; i += 1) {
    const c = entete[i];
    if (c === '"') {
      if (entreGuillemets && entete[i + 1] === '"') i += 1;
      else entreGuillemets = !entreGuillemets;
    } else if (!entreGuillemets) {
      if (c === '\n' || c === '\r') break;
      const index = candidats.indexOf(c);
      if (index >= 0) comptes[index] += 1;
    }
  }
  return candidats[comptes.indexOf(Math.max(...comptes))];
}

function* decouper(texte: string, sep: string, origine: string) {
  // Les retours a la ligne dans un champ cite font partie du champ.
  let champs: string[] = [];
  let courant = '';
  let etat: 'debut' | 'texte' | 'cite' | 'ferme' = 'debut';
  let ligne = 1;
  let debutLigne = 1;
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (etat === 'cite') {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          courant += '"';
          i += 1;
        } else etat = 'ferme';
      } else {
        courant += c;
        if (c === '\r') {
          if (texte[i + 1] === '\n') courant += texte[++i];
          ligne += 1;
        } else if (c === '\n') ligne += 1;
      }
    } else if (c === sep) {
      champs.push(courant);
      courant = '';
      etat = 'debut';
    } else if (c === '\n' || c === '\r') {
      if (champs.length || courant.trim() || etat === 'ferme') {
        yield { champs: [...champs, courant], ligne: debutLigne };
      }
      champs = [];
      courant = '';
      etat = 'debut';
      if (c === '\r' && texte[i + 1] === '\n') i += 1;
      ligne += 1;
      debutLigne = ligne;
    } else if (c === '"') {
      if (etat !== 'debut') throw new SpavikDataError(`${origine}: CSV line ${ligne}: unexpected quote.`);
      etat = 'cite';
    } else {
      if (etat === 'ferme') throw new SpavikDataError(`${origine}: CSV line ${ligne}: unexpected character after closing quote.`);
      courant += c;
      etat = 'texte';
    }
  }
  if (etat === 'cite') throw new SpavikDataError(`${origine}: CSV line ${ligne}: unterminated quoted field.`);
  if (champs.length || courant.trim() || etat === 'ferme') {
    yield { champs: [...champs, courant], ligne: debutLigne };
  }
}

function depuisCsv(texte: string, origine: string): ApiRecord[] {
  const contenu = texte.replace(/^\uFEFF/, '');
  const lignes: ApiRecord[] = [];
  let entetes: string[] | undefined;
  for (const { champs, ligne } of decouper(contenu, separateur(contenu), origine)) {
    if (!entetes) {
      entetes = champs.map((h) => h.trim());
      if (entetes.some((h) => !h) || new Set(entetes).size !== entetes.length) {
        throw new SpavikDataError(`${origine}: CSV line ${ligne}: headers must be unique and non-empty.`);
      }
    } else {
      if (champs.length > entetes.length) {
        throw new SpavikDataError(`${origine}: CSV line ${ligne}: more fields than the header.`);
      }
      lignes.push(Object.fromEntries(entetes.map((nom, i) => [nom, typer(champs[i] ?? '')])));
    }
  }
  if (!entetes) throw new SpavikDataError(`${origine}: no readable header row.`);
  if (!lignes.length) {
    throw new SpavikDataError(`${origine}: header present, but no data rows.`);
  }
  return lignes;
}

async function depuisJson(texte: string, origine: string): Promise<ApiRecord[]> {
  let contenu: unknown;
  try {
    contenu = JSON.parse(texte.trimStart());
  } catch {
    // SyntaxError peut contenir des donnees privees : ne pas recopier son message.
    throw new SpavikDataError(`${origine}: invalid JSON.`);
  }
  return normaliser(contenu, origine);
}

function ressembleAUnChemin(valeur: string) {
  if (valeur.length > 4096 || /[\r\n]/.test(valeur)) return false;
  const bas = valeur.toLowerCase();
  return EXTENSIONS_CSV.some((e) => bas.endsWith(e)) || bas.endsWith('.json') || valeur.includes('/');
}

async function lireFichier(chemin: string) {
  let fs;
  try {
    fs = await import('node:fs/promises');
  } catch {
    throw new SpavikDataError(
      `file reading is unavailable in this environment (${chemin}). `
      + 'Pass the data directly, as an array of objects or as CSV.',
    );
  }
  try {
    return await fs.readFile(chemin, 'utf8');
  } catch (exc) {
    if ((exc as NodeJS.ErrnoException).code === 'ENOENT') throw new SpavikDataError(`data: file not found, ${chemin}`);
    throw new SpavikDataError(`data: cannot read ${chemin} (${(exc as NodeJS.ErrnoException).code}).`);
  }
}

/** Ramene n'importe quelle forme acceptee a un tableau d'objets. */
export async function normaliser(source: unknown, quoi = 'data'): Promise<ApiRecord[]> {
  if (source == null) throw new SpavikDataError(`${quoi}: nothing to send.`);

  if (typeof source === 'string') {
    const debut = source.trimStart()[0];
    if (debut === '[' || debut === '{') return depuisJson(source, quoi);
    if (ressembleAUnChemin(source)) {
      const contenu = await lireFichier(source);
      if (source.toLowerCase().endsWith('.json')) return depuisJson(contenu, source);
      return depuisCsv(contenu, source);
    }
    return depuisCsv(source, quoi);
  }

  if (Array.isArray(source)) {
    if (source.length === 0) throw new SpavikDataError(`${quoi}: the list is empty.`);
    const index = source.findIndex((l, i) => !Object.hasOwn(source, i) || l === null || typeof l !== 'object' || Array.isArray(l));
    if (index !== -1) {
      const mauvais = source[index];
      throw new SpavikDataError(
        `${quoi}: a list must contain objects, found ${mauvais === null ? 'null' : typeof mauvais} at index ${index}.`,
      );
    }
    return source.map((l) => ({ ...l }));
  }

  if (typeof source === 'object') return [{ ...source } as ApiRecord];

  throw new SpavikDataError(
    `${quoi}: unsupported type, ${typeof source}. `
    + 'Accepted forms: array of objects, file path, CSV, JSON.',
  );
}

/** Union ordonnee des colonnes rencontrees. */
export function colonnes(lignes: ApiRecord[]) {
  const vues = new Set<string>();
  for (const ligne of lignes) for (const cle of Object.keys(ligne)) vues.add(cle);
  return [...vues];
}
