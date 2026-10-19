# Changelog

## Unreleased

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
