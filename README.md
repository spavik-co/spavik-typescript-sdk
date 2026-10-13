# Spavik TypeScript SDK

**Turn your data into predictions your product can use.**

Spavik is a prediction API for classification, regression and time-series
forecasting. Evaluate your data, train a model, request predictions and measure
how they perform against real outcomes, without operating model infrastructure.

The TypeScript SDK brings Spavik to your JavaScript and TypeScript applications.
Get generated types, ESM and CommonJS support, and zero runtime dependencies.

[![CI](https://github.com/spavik-co/spavik-typescript-sdk/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/spavik-co/spavik-typescript-sdk/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

[Explore Spavik](https://spavik.co) · [Documentation](https://test-docs.spavik.co/libraries/javascript) · [Runnable examples](examples/README.md)

## From a dataset to a feedback loop

| What you want to do | How Spavik helps |
| --- | --- |
| Predict a category or a number | Train on a table and predict from new rows, for example churn or demand. |
| Forecast a time series | Backtest historical data, then request future values and quantiles. |
| Understand a score | Compare model metrics with baselines evaluated on the same observations. |
| Learn from what actually happened | Submit real outcomes, inspect observed performance and refresh the model. |

Your data defines the customer model. Spavik engines perform the underlying
computation. Metrics and baseline comparisons come from the API, so the SDK
returns the same evaluation report as other Spavik clients.

## Try it with a small dataset

**Development preview:** the SDK has not been published to a package registry
yet. Start from `dev` with Node.js 18+. The included datasets are synthetic and
demonstrate the integration; their scores do not establish production quality.

```sh
git clone --branch dev https://github.com/spavik-co/spavik-typescript-sdk.git
cd spavik-typescript-sdk
npm ci
npm run build
```

To install in another application, run `npm pack`, then
`npm install /path/to/spavik-client-0.1.0.tgz` from that application.
The package name is `@spavik/client`. The example below runs from this checkout
after building; in your application, import from `@spavik/client` instead.

Set `SPAVIK_API_KEY` securely in your environment, then select your API environment:

```sh
export SPAVIK_BASE_URL="https://test-api.spavik.co"
```

The SDK reads these environment variables and authenticates with `X-API-Key`.
It does not load `.env` files automatically. Keep API keys on your server.

Start with a **free evaluation** of the sample churn dataset:

```js
import { Spavik } from './dist/esm/index.js';

const client = new Spavik();
const report = await client.evaluate('examples/data/churn.csv', {
  target: 'churn',
});
console.log(report.assessment);
```

The `assessment` summarizes the comparison with a baseline. The full report
contains the evaluated metrics and reasons when a metric cannot be calculated.
Read [how to interpret an evaluation](https://test-docs.spavik.co/guides/evaluation)
before making decisions from a score.

## Put predictions in your application

Train a model from the dataset, then send new rows for prediction:

```js
const model = await client.train('examples/data/churn.csv', { target: 'churn' });
const result = await model.predict({ plan: 'pro', seats: 12, tickets_90d: 3 });
console.log(result.lignes);
```

Training is free. Predictions consume credits according to the selected engine;
check `usage()` and the [cost guide](https://test-docs.spavik.co/costs) before
making paid calls. Keep the model ID to reuse an existing model with `model(id)`.

## Backtest before forecasting

Test your forecasting setup on historical observations before requesting future
values. This backtest is free:

```js
const report = await client.backtest('examples/data/sales.csv', {
  target: 'sales', horizon: 7, timestamp: 'date', itemId: 'store',
  pointEstimate: 'median', quantiles: [0.1, 0.5, 0.9],
});
console.log(report.assessment);
```

When calling `forecast()`, use the same history, column roles, horizon and
forecast settings. Forecasting consumes credits. See the
[SDK guide](https://test-docs.spavik.co/libraries/javascript) for the full workflow.

## Keep measuring after deployment

A test score is a starting point. Submit the outcomes you observe, inspect model
performance and refresh when you want to incorporate the new feedback.
The [feedback-loop guide](https://test-docs.spavik.co/guides/feedback-loop)
explains how to connect predictions to actual results.

CSV and JSON files, objects and arrays work out of the box. All API methods
are asynchronous. Type declarations are generated from the TypeScript sources.
CommonJS applications use `const { Spavik } = require('@spavik/client')`.
Catch `SpavikError` or a specific subclass to handle failures; API errors include
`code`, `status` and `requestId` when available.

## Build with us

Found a bug or missing capability? [Open an issue](https://github.com/spavik-co/spavik-typescript-sdk/issues).
For a security issue, follow [the private reporting process](SECURITY.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) for local tests and pull requests targeting
`dev`, and [RELEASING.md](RELEASING.md) for the release process. CI tests and
builds installable archives; it does not publish packages automatically.

## License

The SDK is open source under [Apache-2.0](LICENSE). See [NOTICE](NOTICE).
The hosted Spavik service and backend remain proprietary.
