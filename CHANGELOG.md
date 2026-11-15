# Changelog

## 0.1.1

- Documentation only: a new README, shown on npm and GitHub, that explains
  what Spavik predicts before the reference details, with links to the use
  case guides. package.json gains a fuller description and keywords. No code
  change. 0.1.0 was tagged but never published on npm: 0.1.1 is the first
  release after 0.1.0-alpha.2 there, and includes every 0.1.0 change below.

## 0.1.0

- Breaking: training needs at least 100 rows, as the API now requires
  (`too_few_rows`). The local refusal reads "training needs at least 100 rows,
  N provided. Nothing was sent." Evaluation has the same minimum on the API side.
- Breaking: the client `timeout` option replaces the default deadline of every
  operation. Without it, each operation keeps its own default.
- Breaking: `evaluate()` no longer accepts `engineFamily`, which the API
  ignores. It accepts `task` and `maxSamples`.
- Breaking: unknown options raise `SpavikDataError` naming the option, with
  nothing sent; `train(rows)` without `target` says the target is required.
- Breaking: without an API key, calls raise `SpavikAuthError` locally ("no API
  key: set SPAVIK_API_KEY or pass apiKey. Nothing was sent."), except
  `engines()` and `engineFamilies()`. `TOKEN_INVALID` maps to `SpavikAuthError`.
- Breaking: response bodies no longer carry `_request_id`, `_engine_version` or
  `_predictions_remaining`. Use `requestId`, `engineVersion` and
  `predictionsRemaining` on `Result`, and the non-enumerable `requestId` on the
  reports of `evaluate()`, `backtest()` and `usage()`.
- Breaking: `restore()` returns the restored `Model`. New `Model.restore()`.
- `train`, `predict`, `forecast`, `submitOutcomes` and `refresh` accept an
  `idempotencyKey` option, reused on every attempt, to replay a call safely.
- `models()` follows `pagination.has_more` and caps pages at 200, so listings
  beyond 200 models are complete.
- `SPAVIK_BASE_URL` is read when the client is built, not at import. Reading
  the environment no longer fails on runtimes without `process`.
- Typed responses: `Assessment`, `EvaluationReport`, `PerformanceReport`,
  `RefreshResult`, `OutcomesReceipt`, `Usage`, `PredictionRow` and others.
  `Result` is generic and `get()` returns the declared field type.
  `performance()` never returns null. `DataInput` accepts readonly arrays,
  arrays of interface types, `Date` and `undefined` values. `verify()` accepts
  `IncomingHttpHeaders`. Examples and type tests compile in `types:check`.
- `verify()` no longer imports `node:crypto`, so bundling for the browser
  works. It raises `SpavikSignatureError('missing webhook secret')` for an
  empty secret and reads the first value of a repeated header.
- A body JSON cannot encode (a `BigInt`, for example) raises `SpavikDataError`
  before any attempt, instead of a transport error after retries.
- A `Retry-After` above 60 s raises `SpavikRateLimited` at once instead of
  blocking the call.
- Model identifiers are URL-encoded in request paths.
- `forecast()` checks the `itemId` column locally and compares the horizon to
  each series, not to the total row count.
- A training response without a model identifier raises a `SpavikError`
  carrying the request ID and idempotency key.
- README: Free plan of 100 predictions per calendar month, absolute links that
  work on npm, file path rule for strings, CSV differences with the Python SDK.

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
