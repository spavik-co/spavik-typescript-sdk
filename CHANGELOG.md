# Changelog

## 0.1.0-alpha.2

- Breaking: `train()` no longer sends `explain`. Feature importance moves to
  `evaluate(data, { target, explain: true })`, which ranks every feature
  column in `trial.feature_importance` before any model is created. Measured
  at training, it multiplied the training time by the number of columns.
- `TOO_MANY_COLUMNS` is mapped to the quota error family. The API refuses
  tables with more feature columns than the plan allows
  (`limits.max_feature_columns`, 30 on public plans, target excluded).

## 0.1.0-alpha.1

First pre-release on npm: `npm install spavik@next`.


- Keep CSV values with a leading zero, such as `007` or a postal code, as text
  instead of turning them into numbers. Only plain decimal notation becomes a
  number; `1_000`, `nan` and `inf` stay text.
- Breaking: the public API is in English. `Resultat` is now `Result` and
  `Prevision` is now `Forecast`. Result fields are `data`, `cost` and
  `predictionsRemaining` (formerly `donnees`, `cout` and `solde`).
  `Prediction.lignes` is now `Prediction.predictions`, `Forecast.cible` is
  `Forecast.target`, `Model.donnees` is `Model.data`, and `verifier` is
  `verify(body, headers, secret)`. Types are renamed: `Row`, `DataInput`,
  `ClientOptions`, `TrainOptions`, `EvaluateOptions`, `BacktestOptions`,
  `ForecastOptions` and `PredictOptions`.
- `predictionsRemaining` comes only from the `X-Spavik-Predictions-Remaining`
  header, the only place the API reports it. Response bodies were searched for
  `credits_remaining`, `balance` and similar fields that the API never sends.
- Remove `SpavikCreditsExhausted.balance` and `.required`: API errors carry
  only `status`, `message` and `messageDetail`, so both were always null.
  Call `usage()` for the remaining balance.
- Debug log lines read `key=` and `attempt` instead of French labels.

- Verify webhooks against the `Spavik-Signature: t=<unix seconds>,v1=<hex>` header
  sent by the API, signing `<t>.` followed by the raw body. The timestamp is now
  required and checked against the tolerance; the former `X-Spavik-Signature`
  and `X-Spavik-Timestamp` headers are no longer read, so no real delivery could
  pass verification before this fix.

- Require non-empty `features` and `actual` for every outcome, regardless of
  data policy. `request_id` is optional correlation metadata. Inference archival
  policy does not change validation, performance or idempotent response replay.

- Align `Outcome` with the API's `prediction`, `probabilities`, `version` and
  `engine` fields, requiring the original version and engine for supplied predictions.
- Remove `model.predictions()`: prediction history has been removed from the
  API for every plan. Keep prediction results and their `request_id` values
  from `predict()` in your application.

- Preserve multiline and quoted CSV fields, reject ambiguous headers and excess
  columns, and keep unsafe numeric values as text.
- Cover response bodies with request deadlines and network retries; retain
  idempotency keys, HTTP correlation and causes on final transport failures.
- Recognize JSON before file paths and report malformed JSON as `SpavikDataError`.
- Reject undefined rows and sparse arrays before sending a request.
- Export `Outcome` and accept nested feature rows in TypeScript feedback calls.
- Require Node.js 22 or later and align Node types. Audit dependencies in CI.
