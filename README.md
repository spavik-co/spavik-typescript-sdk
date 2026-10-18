# Spavik TypeScript SDK

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![CI](https://github.com/spavik-co/spavik-typescript-sdk/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/spavik-co/spavik-typescript-sdk/actions/workflows/ci.yml)

Prediction infrastructure for developers.

Add predictive capabilities to your application without building an ML stack.

## Install

Requires Node.js 22 or later; works with TypeScript and JavaScript.

Development preview: not yet published to npm. Install from source:

```sh
git clone --branch dev https://github.com/spavik-co/spavik-typescript-sdk.git
cd spavik-typescript-sdk
npm ci
npm pack
```

Then, from your application's directory:

```sh
npm install /path/to/spavik-typescript-sdk/spavik-0.1.0.tgz
```

## Get your API key

Create a free account at [spavik.co](https://spavik.co) and generate your API key from the dashboard.

New accounts include **1,000 free predictions**. No credit card required.

```bash
export SPAVIK_API_KEY="sk-spv-api-..."
```

## Quickstart

Download [churn.csv](examples/data/churn.csv) and save it in your application's
working directory. It contains synthetic customer records with `plan`, `seats`,
`tickets_90d` and the known outcome `churn`. It demonstrates the API, not model quality.

This example runs as JavaScript too. Save it as `quickstart.mjs` beside the CSV:

```typescript
import { Spavik } from 'spavik';

// Read your API key from SPAVIK_API_KEY.
const client = new Spavik();

// Train on historical customers; "churn" is the value to predict. Training is free.
const model = await client.train('churn.csv', { target: 'churn' });

// Predict for a new customer using the same input columns. This consumes credits.
const result = await model.predict({ plan: 'pro', seats: 12, tickets_90d: 2 });
console.log(result.lignes);
```

```sh
node quickstart.mjs
```

`result.lignes` contains the predictions returned by the API. Reuse the trained
model for subsequent predictions; you do not need to train for every request.

## What you can do

- Classification and regression
- Time-series forecasting
- Dataset validation and evaluation
- Model performance monitoring and outcome feedback

## Input data

Pass an array of rows, a single row, raw CSV/JSON text, or a CSV/JSON file path.
Raw JSON is recognized before file paths, including when values contain URLs.
Invalid JSON, sparse arrays and non-object rows raise `SpavikDataError` locally.

CSV supports comma, semicolon, tab and pipe separators, quoted delimiters,
escaped quotes and multiline fields. Duplicate or empty headers, extra fields
and malformed quoting raise `SpavikDataError` with the physical line number.
Missing trailing fields and empty values become `null`.
CSV integer values outside JavaScript's safe integer range remain strings,
preserving their digits. Decimal values within that range use ordinary
JavaScript number precision; out-of-range or non-finite values remain strings.

## Observed outcomes

Link an outcome to a prediction using its `request_id` or the full feature row.
The exported `Outcome` type supports both forms:

```typescript
import type { Outcome } from 'spavik';

const outcomes: Outcome[] = [
  { features: { plan: 'pro', seats: 12, tickets_90d: 2 }, actual: true },
];
await model.submitOutcomes(outcomes);
```

## Timeouts and uncertain results

Each attempt's deadline covers both the connection and the complete response
body. Operations use their contract deadlines; the client `timeout` option is
a fallback for operations without one, not an override. Retries and backoff can
make the total call take longer than a single attempt's deadline. Custom `fetch`
implementations must honor the supplied `AbortSignal`, including during body reads.

Network failures, including interrupted bodies, use `SpavikTransportError`.
Retries preserve the original payload and idempotency key. After the final
failure, the error retains `idempotencyKey`, plus `requestId` and `status` when
response headers arrived. `cause` holds the underlying transport error.
A mutation may have completed despite a lost response: use these identifiers
to investigate before resubmitting. A new SDK call generates a new key; the SDK
does not expose a resume-by-key method.

## Documentation

See [docs.spavik.co](https://docs.spavik.co) for guides and the API reference.
For development and contributions, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
