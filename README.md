# Spavik TypeScript SDK

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/spavik-co/spavik-typescript-sdk/blob/dev/LICENSE)
[![CI](https://github.com/spavik-co/spavik-typescript-sdk/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/spavik-co/spavik-typescript-sdk/actions/workflows/ci.yml)

Prediction infrastructure for developers.

Add predictive capabilities to your application without building an ML stack.

## Install

Requires Node.js 22 or later; works with TypeScript and JavaScript.

Early release: the API may change before 1.0.

```sh
npm install spavik
```

## Get your API key

Create a free account at [spavik.co](https://spavik.co) and generate your API key from the dashboard.

The Free plan includes **100 predictions per calendar month**, reset on the 1st
at 00:00 UTC. Training and evaluation are free. No credit card required.

```bash
export SPAVIK_API_KEY="sk-spv-api-..."
```

## Quickstart

Download [churn.csv](https://github.com/spavik-co/spavik-typescript-sdk/blob/dev/examples/data/churn.csv) and save it in your application's
working directory. It contains 120 synthetic customer records with `plan`, `seats`,
`tickets_90d` and the known outcome `churn`. It demonstrates the API, not model quality.
Training needs at least 100 rows; below 200, results are likely to be limited.

This example runs as JavaScript too. Save it as `quickstart.mjs` beside the CSV:

```typescript
import { Spavik } from 'spavik';

// Read your API key from SPAVIK_API_KEY.
const client = new Spavik();

// Train on historical customers; "churn" is the value to predict. Training is free.
const model = await client.train('churn.csv', { target: 'churn' });

// Predict for a new customer using the same input columns. This consumes credits.
const result = await model.predict({ plan: 'pro', seats: 12, tickets_90d: 2 });
console.log(result.predictions);
```

```sh
node quickstart.mjs
```

`result.predictions` contains the predictions returned by the API. Reuse the trained
model for subsequent predictions; you do not need to train for every request.

## What you can do

- Classification and regression
- Time-series forecasting
- Dataset validation and evaluation
- Model performance monitoring and outcome feedback

## Input data

Pass an array of rows, a single row, raw CSV/JSON text, or a CSV/JSON file path.
Arrays of your own interface types and readonly arrays are accepted; `Date`
values are sent as ISO 8601 strings and `undefined` values as empty cells.

A string is read in this order:

1. It starts with `[` or `{`: JSON, including when values contain URLs.
2. It ends in `.csv`, `.tsv`, `.txt` or `.json`, or contains a `/`: a file path.
   `predict('notes/client')` therefore looks for a file and fails with
   `file not found`. Pass such text as an object, `{ note: 'notes/client' }`.
3. Anything else: CSV text.

Invalid JSON, sparse arrays and non-object rows raise `SpavikDataError` locally.

CSV supports comma, semicolon, tab and pipe separators, quoted delimiters,
escaped quotes and multiline fields. Duplicate or empty headers, extra fields
and malformed quoting raise `SpavikDataError` with the physical line number.
Missing trailing fields and empty values become `null`.
CSV integer values outside JavaScript's safe integer range remain strings,
preserving their digits. Decimal values within that range use ordinary
JavaScript number precision; out-of-range or non-finite values remain strings.

The Python SDK reads the same files with two differences. It turns integers
beyond 2^53 into Python integers, where this SDK keeps them as text. It accepts
a quote inside an unquoted field (`un"quoted`), where this SDK raises
`SpavikDataError`. Both SDKs trim spaces around header names.

## Observed outcomes

Every outcome requires a non-empty `features` object and `actual`, on every
plan. An optional `request_id` is correlation metadata; no inference archive
is queried to recover features. The exported `Outcome` type also accepts the original prediction
and optional class probabilities for aggregate performance measurement. When
providing `prediction`, include its original model `version` and exact serving
`engine`, not an alias such as `presage-latest`:

```typescript
import type { Outcome } from 'spavik';

const outcomes: Outcome[] = [
  {
    features: { plan: 'pro', seats: 12, tickets_90d: 2 },
    actual: 'yes',
    prediction: 'no',
    probabilities: { no: 0.75, yes: 0.25 },
    version: 2,
    engine: 'presage-2',
  },
];
await model.submitOutcomes(outcomes);
```

The prediction metadata above is illustrative; use the values saved from the
original prediction response. Probability values must be between 0 and 1, and
the model version must be a positive integer; the API validates these bounds.
Performance uses these client-reported predictions for every data policy;
feedback without a supplied prediction remains supported for model refresh.
Zero Data Retention only disables the archiving of inference inputs and
outputs. Successful idempotent responses remain replayable for 24 hours on
every plan. Submit outcomes in batches, especially when automatic model updates
are enabled.

## Timeouts and uncertain results

Each attempt's deadline covers both the connection and the complete response
body. Without the client `timeout` option, each operation uses its own default
(120 s for training and evaluation, 60 s for forecasting, 30 s for prediction).
When you set `timeout`, in milliseconds, it replaces every one of these defaults,
for example `new Spavik({ timeout: 300_000 })` for `evaluate` with `explain`
on a wide table. Retries and backoff can make the total call take longer than a
single attempt's deadline. A `Retry-After` above 60 s is not waited for: the
call raises `SpavikRateLimited` at once. Custom `fetch` implementations must
honor the supplied `AbortSignal`, including during body reads.

Network failures, including interrupted bodies, use `SpavikTransportError`.
Retries preserve the original payload and idempotency key. After the final
failure, the error retains `idempotencyKey`, plus `requestId` and `status` when
response headers arrived. `cause` holds the underlying transport error.
A mutation may have completed despite a lost response. To replay it safely,
pass the same key back: `train`, `predict`, `forecast`, `submitOutcomes` and
`refresh` accept an `idempotencyKey` option, sent on every attempt. The API
answers a replayed key with the original response, without a second charge.

```typescript
try {
  await model.predict(rows);
} catch (error) {
  if (error instanceof SpavikTransportError && error.idempotencyKey) {
    await model.predict(rows, { idempotencyKey: error.idempotencyKey });
  }
}
```

Without the option, each call generates a new key.

## Errors raised before sending

- No API key: `SpavikAuthError`, "no API key: set SPAVIK_API_KEY or pass apiKey.
  Nothing was sent." `engines()` and `engineFamilies()` need no key.
- An unknown option, such as `explain` passed to `train`, or a missing `target`:
  `SpavikDataError` naming the option.
- Data JSON cannot encode, such as a `BigInt`: `SpavikDataError`, no retry.

## Response metadata

`Result`, `Prediction` and `Forecast` keep the response body unchanged in
`data` and expose the headers as properties: `requestId`,
`predictionsRemaining` and `engineVersion`. The reports returned by
`evaluate()`, `backtest()` and `usage()` are the API body, with a
non-enumerable `requestId` property that `JSON.stringify` leaves out.

## Webhooks

`verify(rawBody, headers, secret)` accepts a Fetch `Headers` object or a plain
object such as Express `req.headers`; for a repeated header, the first value is
read. A missing secret raises `SpavikSignatureError('missing webhook secret')`.
Verification uses WebCrypto (`globalThis.crypto.subtle`), available on Node.js
22 and later and on edge runtimes, and needs no `node:` module.

## Documentation

See [docs.spavik.co](https://docs.spavik.co) for guides and the API reference.
For development and contributions, see [CONTRIBUTING.md](https://github.com/spavik-co/spavik-typescript-sdk/blob/dev/CONTRIBUTING.md).

## License

[Apache-2.0](https://github.com/spavik-co/spavik-typescript-sdk/blob/dev/LICENSE)

## Saving prediction results

There is no prediction-history endpoint on any plan, and no
`model.predictions()` method. Save the results and `request_id` values returned
by `model.predict()` in your application if you need them later. The API request
log contains technical metadata, not prediction values.
