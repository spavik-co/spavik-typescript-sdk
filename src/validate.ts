import type { ApiRecord } from './internal.js';
// Controles menes en local, avant tout appel.
//
// Memes regles, memes messages que la bibliotheque Python. Chaque regle vient
// d'un refus reellement observe sur l'API.

import { colonnes } from './data.js';
import { SpavikDataError } from './errors.js';

export const MIN_LIGNES_ENTRAINEMENT = 10;

// Similarite au sens de difflib.SequenceMatcher, l'outil que la bibliotheque
// Python utilise pour ses suggestions. Une distance d'edition ordinaire donne
// un autre resultat : 'churn_90d' contre 'churn' vaut 0,56 en Levenshtein
// normalise, mais 0,71 ici, de part et d'autre du seuil. Les deux clients
// doivent suggerer la meme colonne, donc ils comptent pareil.

function plusLongBloc(a: string, b: string, aDebut: number, aFin: number, bDebut: number, bFin: number): [number, number, number] {
  let meilleurA = aDebut;
  let meilleurB = bDebut;
  let meilleureTaille = 0;
  let j2len = new Map<number, number>();

  for (let i = aDebut; i < aFin; i += 1) {
    const suivant = new Map<number, number>();
    for (let j = bDebut; j < bFin; j += 1) {
      if (a[i] !== b[j]) continue;
      const k = (j > bDebut ? j2len.get(j - 1) || 0 : 0) + 1;
      suivant.set(j, k);
      if (k > meilleureTaille) {
        meilleurA = i - k + 1;
        meilleurB = j - k + 1;
        meilleureTaille = k;
      }
    }
    j2len = suivant;
  }
  return [meilleurA, meilleurB, meilleureTaille];
}

function tailleDesBlocs(a: string, b: string) {
  let total = 0;
  const files: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (files.length) {
    const [aDebut, aFin, bDebut, bFin] = files.pop()!;
    const [i, j, taille] = plusLongBloc(a, b, aDebut, aFin, bDebut, bFin);
    if (!taille) continue;
    total += taille;
    if (aDebut < i && bDebut < j) files.push([aDebut, i, bDebut, j]);
    if (i + taille < aFin && j + taille < bFin) files.push([i + taille, aFin, j + taille, bFin]);
  }
  return total;
}

function similarite(a: string, b: string) {
  const total = a.length + b.length;
  return total === 0 ? 1 : (2 * tailleDesBlocs(a, b)) / total;
}

function suggestion(nom: string, connues: string[]) {
  let meilleure = null;
  let score = 0;
  for (const candidate of connues) {
    const ratio = similarite(nom, candidate);
    if (ratio > score) {
      score = ratio;
      meilleure = candidate;
    }
  }
  return score >= 0.6 && meilleure ? ` Did you mean '${meilleure}'?` : '';
}

function apercu(connues: string[], limite = 8) {
  const tete = connues.slice(0, limite).join(', ');
  return connues.length > limite ? `${tete}, ... (${connues.length} columns)` : tete;
}

export function colonnePresente(lignes: ApiRecord[], nom: string, role: string) {
  const connues = colonnes(lignes);
  if (!connues.includes(nom)) {
    throw new SpavikDataError(
      `the ${role} column '${nom}' is missing from the data. `
      + `Columns found: ${apercu(connues)}.${suggestion(nom, connues)}`,
    );
  }
  if (lignes.every((l) => l[nom] === null || l[nom] === undefined)) {
    throw new SpavikDataError(
      `the ${role} column '${nom}' is present but empty across all ${lignes.length} rows.`,
    );
  }
}

export function entrainement(lignes: ApiRecord[], cible: string) {
  if (lignes.length < MIN_LIGNES_ENTRAINEMENT) {
    throw new SpavikDataError(
      `training needs at least ${MIN_LIGNES_ENTRAINEMENT} rows, `
      + `${lignes.length} provided. Nothing was sent.`,
    );
  }
  colonnePresente(lignes, cible, 'target');

  const manquantes = lignes.filter((l) => l[cible] === null || l[cible] === undefined).length;
  if (manquantes) {
    const restantes = lignes.length - manquantes;
    if (restantes < MIN_LIGNES_ENTRAINEMENT) {
      throw new SpavikDataError(
        `${manquantes} row(s) out of ${lignes.length} have no value for the target `
        + `'${cible}', only ${restantes} would be left to learn from.`,
      );
    }
  }

  if (new Set(lignes.map((l) => l[cible])).size < 2) {
    throw new SpavikDataError(
      `the target '${cible}' takes a single value across all ${lignes.length} rows: `
      + 'there is nothing to learn.',
    );
  }
}

export function prediction(lignes: ApiRecord[]) {
  if (!lignes.length) throw new SpavikDataError('no rows to score. Nothing was sent.');
}

export function previsions(lignes: ApiRecord[], cible: string, horizon: number, timestamp?: string) {
  if (!Number.isInteger(horizon) || horizon < 1) {
    throw new SpavikDataError(`the horizon must be at least 1, got ${horizon}.`);
  }
  colonnePresente(lignes, cible, 'target');
  if (timestamp) colonnePresente(lignes, timestamp, 'timestamp');

  // Une serie plus courte que son propre horizon est le cas qui a fait echouer
  // l'exemple publie de l'API : trois points pour un horizon de quatorze.
  if (lignes.length < horizon) {
    throw new SpavikDataError(
      `the series has ${lignes.length} point(s) for a horizon of ${horizon}. `
      + 'A series shorter than its horizon yields nothing usable: '
      + `provide at least ${horizon} points, preferably several times more.`,
    );
  }
}

/**
 * Chaque verite dit ce qui est arrive, et de quelle prediction elle parle.
 *
 * `actual` porte la valeur observee. L'identification passe soit par le
 * `request_id` de la prediction d'origine, soit par les caracteristiques
 * completes de la ligne. Sans l'un ou l'autre, l'API ne peut rien rattacher.
 */
export function verites(lignes: ApiRecord[]) {
  if (!lignes.length) throw new SpavikDataError('no outcomes to report. Nothing was sent.');

  const sansValeur = lignes.filter((v) => !Object.prototype.hasOwnProperty.call(v, 'actual'));
  if (sansValeur.length) {
    const champs = Object.keys(sansValeur[0]);
    throw new SpavikDataError(
      `${sansValeur.length} outcome(s) out of ${lignes.length} have no `
      + `'actual' field, the value actually observed. Fields found on the first: `
      + `${apercu(champs)}.${suggestion('actual', champs)}`,
    );
  }

  const orphelines = lignes.filter((v) => !v.request_id && !v.features);
  if (orphelines.length) {
    throw new SpavikDataError(
      `${orphelines.length} outcome(s) out of ${lignes.length} do not say which `
      + "prediction they relate to. Provide 'request_id', that of the original "
      + "prediction, or 'features', the full row.",
    );
  }
}

/** Une ligne scoree, un credit. */
export function coutPrediction(lignes: ApiRecord[]) {
  return lignes.length;
}

/** One credit per requested horizon step, with all series included. */
export function coutPrevision(horizon: number) {
  return horizon;
}
