import type { Donnees, OptionsTrain, OptionsForecast, OptionsEvaluate, OptionsBacktest, OptionsPredict } from './types.js';
// Les sept operations, decrites une seule fois.
//
// Chaque fonction fait tout ce qui ne demande pas le reseau : normaliser les
// entrees, appliquer les controles locaux, calculer le cout, batir la requete.

import { normaliser } from './data.js';
import * as valider from './validate.js';
import { OPERATIONS } from './contract.js';
import { nouvelleCleIdempotence } from './http.js';
import { SpavikDataError } from './errors.js';

const delai = (nom: keyof typeof OPERATIONS) => OPERATIONS[nom].timeout * 1000;

function sansVides<T extends Record<string, unknown>>(objet: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(objet).filter(([, v]) => v !== undefined && v !== null),
  ) as Partial<T>;
}

export async function train(data: Donnees, options: OptionsTrain = {} as OptionsTrain) {
  if ('engine' in options) throw new SpavikDataError('Use engineFamily when creating a model; engineVersion is selected at prediction time.');
  const { target, engineFamily, name, explain, autoUpdate } = options;
  const lignes = await normaliser(data, 'training data');
  valider.entrainement(lignes, target);
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: '/v1/models',
      operation: 'train',
      corps: { target, data: lignes, ...sansVides({ engine_family: engineFamily, name, explain, auto_update: autoUpdate }) },
      delai: delai('train'),
      idempotence: nouvelleCleIdempotence(),
      contexte: 'training',
    },
  };
}

export async function forecast(data: Donnees, {
  target, horizon, timestamp, quantiles, itemId, pointEstimate, engineFamily, engineVersion, backtest, includeBacktestPredictions,
}: OptionsForecast = {} as OptionsForecast) {
  const lignes = await normaliser(data, 'series to forecast');
  valider.previsions(lignes, target, horizon, timestamp);
  return {
    cout: null,
    requete: {
      methode: 'POST',
      chemin: '/v1/forecast',
      operation: 'forecast',
      corps: {
        target,
        horizon,
        data: lignes,
        ...sansVides({ timestamp, quantiles, item_id: itemId, point_estimate: pointEstimate, engine_family: engineFamily, engine_version: engineVersion, backtest, include_backtest_predictions: includeBacktestPredictions }),
      },
      delai: delai('forecast'),
      idempotence: nouvelleCleIdempotence(),
      contexte: 'forecast',
    },
  };
}

export async function predict(modelId: string, rows: Donnees, { engineVersion }: OptionsPredict = {}) {
  const lignes = await normaliser(rows, 'rows to score');
  valider.prediction(lignes);
  return {
    cout: null,
    requete: {
      methode: 'POST',
      chemin: `/v1/models/${modelId}/predict`,
      operation: 'predict',
      corps: { rows: lignes, ...sansVides({ engine_version: engineVersion }) },
      delai: delai('predict'),
      // Preserve the same key and body throughout retries.
      idempotence: nouvelleCleIdempotence(),
      contexte: 'prediction',
    },
  };
}

export async function submitOutcomes(modelId: string, outcomes: Donnees) {
  const lignes = await normaliser(outcomes, 'outcomes');
  valider.verites(lignes);
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: `/v1/models/${modelId}/outcomes`,
      operation: 'submit_outcomes',
      corps: { outcomes: lignes },
      delai: delai('submit_outcomes'),
      idempotence: nouvelleCleIdempotence(),
      contexte: 'outcome reporting',
    },
  };
}

export function refresh(modelId: string) {
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: `/v1/models/${modelId}/refresh`,
      operation: 'refresh',
      delai: delai('refresh'),
      idempotence: nouvelleCleIdempotence(),
      contexte: 'outcome integration',
    },
  };
}

export function performance(modelId: string, days: number) {
  return {
    cout: 0,
    requete: {
      methode: 'GET',
      chemin: `/v1/models/${modelId}/performance`,
      operation: 'performance',
      parametres: { days },
      delai: delai('performance'),
      contexte: 'observed performance',
    },
  };
}

export function listModels(limit: number, offset: number, status?: 'archived') {
  return {
    cout: 0,
    requete: {
      methode: 'GET',
      chemin: '/v1/models',
      operation: 'list_models',
      parametres: { limit, offset, ...sansVides({ status }) },
      delai: delai('list_models'),
      contexte: status ? `${status} model list` : 'model list',
    },
  };
}

/** Le rapport de validation et un essai du moteur, sans rien creer ni debiter. L'API juge. */
export async function evaluate(data: Donnees, options: OptionsEvaluate = {} as OptionsEvaluate) {
  if ('engine' in options) throw new SpavikDataError('Use engineFamily when evaluating data.');
  const { target, engineFamily } = options;
  const lignes = await normaliser(data, 'data to evaluate');
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: '/v1/datasets/evaluate',
      operation: 'evaluate',
      corps: { target, data: lignes, ...sansVides({ engine_family: engineFamily }) },
      delai: delai('train'),
      contexte: 'data evaluation',
    },
  };
}

/** La serie validee et rejouee contre le naif, sans prevision ni debit. L'API juge. */
export async function backtest(data: Donnees, {
  target, horizon, timestamp, itemId, quantiles, pointEstimate, engineFamily, engineVersion, includeBacktestPredictions,
}: OptionsBacktest = {} as OptionsBacktest) {
  const lignes = await normaliser(data, 'series to backtest');
  // Le seul controle local : l'API prend un horizon nul pour 1 sans le dire.
  if (horizon != null && horizon < 1) {
    throw new SpavikDataError(`the horizon must be at least 1, got ${horizon}. Nothing was sent.`);
  }
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: '/v1/forecast/backtest',
      operation: 'backtest',
      corps: { target, data: lignes, ...sansVides({ horizon, timestamp, item_id: itemId, quantiles, point_estimate: pointEstimate, engine_family: engineFamily, engine_version: engineVersion, include_backtest_predictions: includeBacktestPredictions }) },
      delai: delai('forecast'),
      contexte: 'series backtest',
    },
  };
}

/** Archive : le modele cesse de servir et rend sa place du quota, artefacts conserves. */
export function archive(modelId: string) {
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: `/v1/models/${modelId}/archive`,
      operation: 'archive',
      delai: 30000,
      idempotence: nouvelleCleIdempotence(),
      contexte: `archiving model ${modelId}`,
    },
  };
}

/** Remet en service un modele archive ; il reprend une place du quota. */
export function restore(modelId: string) {
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: `/v1/models/${modelId}/restore`,
      operation: 'restore',
      delai: 30000,
      idempotence: nouvelleCleIdempotence(),
      contexte: `restoring model ${modelId}`,
    },
  };
}

export function predictions(modelId: string, limit: number) {
  return {
    cout: 0,
    requete: {
      methode: 'GET',
      chemin: `/v1/models/${modelId}/predictions`,
      operation: 'predictions',
      parametres: { limit },
      delai: delai('list_models'),
      contexte: `prediction history of ${modelId}`,
    },
  };
}

/** Le compte : plan, solde, periode, consommation. Gratuit. */
export function usage() {
  return {
    cout: 0,
    requete: {
      methode: 'GET',
      chemin: '/v1/usage',
      operation: 'usage',
      delai: 15000,
      contexte: 'account usage',
    },
  };
}

export function getModel(modelId: string) {
  return {
    cout: 0,
    requete: {
      methode: 'GET',
      chemin: `/v1/models/${modelId}`,
      operation: 'list_models',
      delai: delai('list_models'),
      contexte: `model ${modelId} details`,
    },
  };
}
