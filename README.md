# Spavik TypeScript SDK

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![CI](https://github.com/spavik-co/spavik-typescript-sdk/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/spavik-co/spavik-typescript-sdk/actions/workflows/ci.yml)

Prediction infrastructure for developers.

Add predictive capabilities to your application without building an ML stack.

## Install

Development preview: not yet published to npm. For now,
[install from source](CONTRIBUTING.md#install-from-source).
After the first release:

```bash
npm install spavik
```

## Quickstart

Set `SPAVIK_API_KEY` with your API key.
Use a labeled `customers.csv` with `plan`, `seats` and `churn` columns.

```typescript
import { Spavik } from 'spavik';

// Read your API key from SPAVIK_API_KEY.
const client = new Spavik();

// Train from past customers: "churn" is the value to predict.
const model = await client.train('customers.csv', { target: 'churn' });

// Predict churn for a new customer. This call consumes credits.
const result = await model.predict({ plan: 'pro', seats: 12 });
console.log(result.lignes);
```

This development preview defaults to the test API at
`https://spavik-gateway-test-bnp1bedb.ew.gateway.dev`.
`SPAVIK_BASE_URL` is optional; set it only to use another API environment.

## What you can do

- Classification
- Regression
- Forecasting
- Dataset validation
- Model performance monitoring

## Why Spavik

Prediction used to require an ML team.
Now it’s a developer primitive.

## Documentation

[docs.spavik.co](https://docs.spavik.co)

## License

[Apache-2.0](LICENSE)
