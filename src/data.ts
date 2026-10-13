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
  if (/^-?\d+$/.test(brut)) return Number.parseInt(brut, 10);
  if (/^-?\d*\.\d+(e-?\d+)?$/i.test(brut)) return Number.parseFloat(brut);
  return valeur;
}

function separateur(entete: string) {
  const candidats = [',', ';', '\t', '|'];
  let meilleur = ',';
  let compte = -1;
  for (const c of candidats) {
    const n = entete.split(c).length;
    if (n > compte) {
      compte = n;
      meilleur = c;
    }
  }
  return meilleur;
}

function decouper(ligne: string, sep: string) {
  // Suffisant pour un CSV bien forme, guillemets compris.
  const champs = [];
  let courant = '';
  let entreGuillemets = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') {
        courant += '"';
        i += 1;
      } else {
        entreGuillemets = !entreGuillemets;
      }
    } else if (c === sep && !entreGuillemets) {
      champs.push(courant);
      courant = '';
    } else {
      courant += c;
    }
  }
  champs.push(courant);
  return champs;
}

function depuisCsv(texte: string, origine: string): ApiRecord[] {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lignes.length === 0) throw new SpavikDataError(`${origine}: no readable header row.`);
  const sep = separateur(lignes[0]);
  const entetes = decouper(lignes[0], sep).map((h) => h.trim().replace(/^﻿/, ''));
  if (lignes.length === 1) {
    throw new SpavikDataError(`${origine}: header present, but no data rows.`);
  }
  return lignes.slice(1).map((ligne) => {
    const champs = decouper(ligne, sep);
    const objet: ApiRecord = {};
    entetes.forEach((nom, i) => {
      objet[nom] = typer(champs[i] ?? '');
    });
    return objet;
  });
}

function ressembleAUnChemin(valeur: string) {
  if (valeur.length > 4096 || valeur.includes('\n')) return false;
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
    if (ressembleAUnChemin(source)) {
      const contenu = await lireFichier(source);
      if (source.toLowerCase().endsWith('.json')) return normaliser(JSON.parse(contenu), quoi);
      return depuisCsv(contenu.replace(/^﻿/, ''), source);
    }
    const debut = source.trimStart()[0];
    if (debut === '[' || debut === '{') return normaliser(JSON.parse(source), quoi);
    return depuisCsv(source, quoi);
  }

  if (Array.isArray(source)) {
    if (source.length === 0) throw new SpavikDataError(`${quoi}: the list is empty.`);
    const mauvais = source.find((l) => l === null || typeof l !== 'object' || Array.isArray(l));
    if (mauvais !== undefined) {
      throw new SpavikDataError(
        `${quoi}: a list must contain objects, found ${mauvais === null ? 'null' : typeof mauvais}.`,
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
