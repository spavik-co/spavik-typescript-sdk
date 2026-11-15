import type {
  DataInput, Outcome, TrainOptions, ForecastOptions, EvaluateOptions, BacktestOptions, PredictOptions,
  SubmitOutcomesOptions, RefreshOptions,
} from './types.js';
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

// Un identifiant de modele ne doit jamais changer de route : '../usage' reste
// un identifiant, encode, et non un chemin.
const id = (modelId: string) => encodeURIComponent(String(modelId));

const OPTIONS = {
  train: ['target', 'engineFamily', 'name', 'autoUpdate', 'idempotencyKey'],
  forecast: ['target', 'horizon', 'timestamp', 'quantiles', 'itemId', 'pointEstimate', 'engineFamily', 'engineVersion', 'backtest', 'includeBacktestPredictions', 'idempotencyKey'],
  predict: ['engineVersion', 'idempotencyKey'],
  submitOutcomes: ['idempotencyKey'],
  refresh: ['idempotencyKey'],
  evaluate: ['target', 'task', 'maxSamples', 'explain'],
  backtest: ['target', 'horizon', 'timestamp', 'itemId', 'quantiles', 'pointEstimate', 'engineFamily', 'engineVersion', 'includeBacktestPredictions'],
  models: ['limit', 'status'],
} as const;

/** Taille de page maximale acceptee par GET /v1/models. */
export const PAGE_MAX = 200;

function sansVides<T extends Record<string, unknown>>(objet: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(objet).filter(([, v]) => v !== undefined && v !== null),
  ) as Partial<T>;
}

export async function train(data: DataInput, options: TrainOptions = {} as TrainOptions) {
  valider.verifierOptions('train', options, OPTIONS.train);
  const { target, engineFamily, name, autoUpdate, idempotencyKey } = options ?? {} as TrainOptions;
  valider.cibleRequise('train', target);
  const cle = valider.cleIdempotence(idempotencyKey);
  const lignes = await normaliser(data, 'training data');
  valider.entrainement(lignes, target);
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: '/v1/models',
      operation: 'train',
      corps: { target, data: lignes, ...sansVides({ engine_family: engineFamily, name, auto_update: autoUpdate }) },
      delai: delai('train'),
      idempotence: cle ?? nouvelleCleIdempotence(),
      contexte: 'training',
    },
  };
}

export async function forecast(data: DataInput, options: ForecastOptions = {} as ForecastOptions) {
  valider.verifierOptions('forecast', options, OPTIONS.forecast);
  const {
    target, horizon, timestamp, quantiles, itemId, pointEstimate, engineFamily, engineVersion, backtest, includeBacktestPredictions, idempotencyKey,
  } = options ?? {} as ForecastOptions;
  valider.cibleRequise('forecast', target);
  const cle = valider.cleIdempotence(idempotencyKey);
  const lignes = await normaliser(data, 'series to forecast');
  valider.previsions(lignes, target, horizon, timestamp, itemId);
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
      idempotence: cle ?? nouvelleCleIdempotence(),
      contexte: 'forecast',
    },
  };
}

export async function predict(modelId: string, rows: DataInput, options: PredictOptions = {}) {
  valider.verifierOptions('predict', options, OPTIONS.predict);
  const { engineVersion, idempotencyKey } = options ?? {};
  const cle = valider.cleIdempotence(idempotencyKey);
  const lignes = await normaliser(rows, 'rows to score');
  valider.prediction(lignes);
  return {
    cout: null,
    requete: {
      methode: 'POST',
      chemin: `/v1/models/${id(modelId)}/predict`,
      operation: 'predict',
      corps: { rows: lignes, ...sansVides({ engine_version: engineVersion }) },
      delai: delai('predict'),
      // Meme cle et meme corps a chaque tentative.
      idempotence: cle ?? nouvelleCleIdempotence(),
      contexte: 'prediction',
    },
  };
}

export async function submitOutcomes(modelId: string, outcomes: Outcome | readonly Outcome[] | string, options: SubmitOutcomesOptions = {}) {
  valider.verifierOptions('submitOutcomes', options, OPTIONS.submitOutcomes);
  const cle = valider.cleIdempotence(options?.idempotencyKey);
  const lignes = await normaliser(outcomes, 'outcomes');
  valider.verites(lignes);
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: `/v1/models/${id(modelId)}/outcomes`,
      operation: 'submit_outcomes',
      corps: { outcomes: lignes },
      delai: delai('submit_outcomes'),
      idempotence: cle ?? nouvelleCleIdempotence(),
      contexte: 'outcome reporting',
    },
  };
}

export function refresh(modelId: string, options: RefreshOptions = {}) {
  valider.verifierOptions('refresh', options, OPTIONS.refresh);
  const cle = valider.cleIdempotence(options?.idempotencyKey);
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: `/v1/models/${id(modelId)}/refresh`,
      operation: 'refresh',
      delai: delai('refresh'),
      idempotence: cle ?? nouvelleCleIdempotence(),
      contexte: 'outcome integration',
    },
  };
}

export function performance(modelId: string, days: number) {
  return {
    cout: 0,
    requete: {
      methode: 'GET',
      chemin: `/v1/models/${id(modelId)}/performance`,
      operation: 'performance',
      parametres: { days },
      delai: delai('performance'),
      contexte: 'observed performance',
    },
  };
}

export function verifierListe(options: unknown) {
  valider.verifierOptions('models', options, OPTIONS.models);
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
// L'API lit target, task, max_samples et explain ; elle choisit le moteur seule.
export async function evaluate(data: DataInput, options: EvaluateOptions = {} as EvaluateOptions) {
  valider.verifierOptions('evaluate', options, OPTIONS.evaluate);
  const { target, task, maxSamples, explain } = options ?? {} as EvaluateOptions;
  valider.cibleRequise('evaluate', target);
  const lignes = await normaliser(data, 'data to evaluate');
  return {
    cout: 0,
    requete: {
      methode: 'POST',
      chemin: '/v1/datasets/evaluate',
      operation: 'evaluate',
      corps: { target, data: lignes, ...sansVides({ task, max_samples: maxSamples, explain }) },
      delai: delai('train'),
      contexte: 'data evaluation',
    },
  };
}

/** La serie validee et rejouee contre le naif, sans prevision ni debit. L'API juge. */
export async function backtest(data: DataInput, options: BacktestOptions = {} as BacktestOptions) {
  valider.verifierOptions('backtest', options, OPTIONS.backtest);
  const {
    target, horizon, timestamp, itemId, quantiles, pointEstimate, engineFamily, engineVersion, includeBacktestPredictions,
  } = options ?? {} as BacktestOptions;
  valider.cibleRequise('backtest', target);
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
      chemin: `/v1/models/${id(modelId)}/archive`,
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
      chemin: `/v1/models/${id(modelId)}/restore`,
      operation: 'restore',
      delai: 30000,
      idempotence: nouvelleCleIdempotence(),
      contexte: `restoring model ${modelId}`,
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
      chemin: `/v1/models/${id(modelId)}`,
      operation: 'list_models',
      delai: delai('list_models'),
      contexte: `model ${modelId} details`,
    },
  };
}
