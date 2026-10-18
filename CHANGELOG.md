# Changelog

## Unreleased

- Preserve multiline and quoted CSV fields, reject ambiguous headers and excess
  columns, and keep unsafe numeric values as text.
- Cover response bodies with request deadlines and network retries; retain
  idempotency keys, HTTP correlation and causes on final transport failures.
- Recognize JSON before file paths and report malformed JSON as `SpavikDataError`.
- Reject undefined rows and sparse arrays before sending a request.
- Export `Outcome` and accept nested feature rows in TypeScript feedback calls.
- Require Node.js 22 or later and align Node types. Audit dependencies in CI.
