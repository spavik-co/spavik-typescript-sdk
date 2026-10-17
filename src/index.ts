// Client JavaScript de l'API Spavik.
//
// Perimetre moteur : entrainer, predire, prevoir, remonter des verites,
// integrer, lister, mesurer. Authentification par cle d'usage uniquement.
//
//   import { Spavik } from 'spavik';
//
//   const spavik = new Spavik();                                  // lit SPAVIK_API_KEY
//   const model  = await spavik.train('churn.csv', { target: 'churn' });
//   console.log(await model.predict({ plan: 'pro', seats: 12 }));

export { API_VERSION, OPERATIONS } from './contract.js';
export {
  Model, Prediction, Prevision, Resultat, Spavik,
} from './client.js';
export {
  SpavikAuthError,
  SpavikConflict,
  SpavikCreditsExhausted,
  SpavikDataError,
  SpavikError,
  SpavikNotFound,
  SpavikQuotaExceeded,
  SpavikRateLimited,
  SpavikServerError,
  SpavikSignatureError,
  SpavikTransportError,
  SpavikUnavailable,
  SpavikValidationError,
} from './errors.js';
export { verifier } from './webhooks.js';
export { VERSION } from './version.js';

export type { OperationInfo, Ligne, Donnees, OptionsClient, OptionsTrain, OptionsEvaluate, OptionsBacktest, Engine, OptionsForecast, OptionsPredict, EngineFamily, Calibration, CalibrationBin, BacktestPrediction, EvaluationReport, BacktestReport } from './types.js';
