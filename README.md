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

## Documentation

See [docs.spavik.co](https://docs.spavik.co) for guides and the API reference.
For development and contributions, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
