<p align="center">
  <a href="https://spavik.co">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://docs.spavik.co/logo-dark.svg">
      <img src="https://docs.spavik.co/logo-light.svg" alt="Spavik" width="180">
    </picture>
  </a>
</p>

# Spavik for TypeScript and JavaScript: predictions in your app, without an ML stack

[![npm](https://img.shields.io/npm/v/spavik.svg)](https://www.npmjs.com/package/spavik)
[![Node.js](https://img.shields.io/node/v/spavik.svg)](https://www.npmjs.com/package/spavik)
[![CI](https://github.com/spavik-co/spavik-typescript-sdk/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/spavik-co/spavik-typescript-sdk/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/spavik-co/spavik-typescript-sdk/blob/main/LICENSE)

[Spavik](https://spavik.co) is a prediction API for developers and AI agents.
You send the history your application already keeps, such as past customers,
leads, orders or shipments, and Spavik creates a model from it in one call.
Your code then asks the questions that matter to the business: will this
customer cancel, will this lead buy, what will this house sell for, how many
orders will come in tomorrow.

There is no model to design, host or retrain by hand. This package is the
official client for Node.js and edge runtimes, written in TypeScript with
typed responses and no runtime dependency. It handles authentication, retries,
safe replays and data conversion, so a prediction is a function call.

```sh
npm install spavik
```

## A first prediction in five minutes

1. Create a free account on [spavik.co](https://spavik.co) and copy your API key
   from the dashboard. No credit card is required.
2. Export it: `export SPAVIK_API_KEY="sk-spv-api-..."`
3. Download [churn.csv](https://github.com/spavik-co/spavik-typescript-sdk/blob/main/examples/data/churn.csv),
   120 synthetic customers with their plan, seats, support tickets and whether
   they cancelled.
4. Save this as `quickstart.mjs` beside the file (it runs as TypeScript too) and
   run `node quickstart.mjs`:

```typescript
import { Spavik } from 'spavik';

const client = new Spavik();

// Free: does this table say anything about churn?
const report = await client.evaluate('churn.csv', { target: 'churn' });
console.log(report.assessment.message);

// Free: create a model from the 120 past customers.
const model = await client.train('churn.csv', { target: 'churn' });

// One credit: will this customer cancel?
const result = await model.predict({ plan: 'pro', seats: 12, tickets_90d: 2 });
console.log(result.predictions);
```

Keep `model.id`: the model stays available, and later predictions reuse it
without training again.

## What you can predict

Anything your history already records the answer to. Each guide below comes
with a dataset and complete code.

| Question your app asks | Answer | Guide |
|---|---|---|
| Will this customer cancel? | yes or no, with a probability | [Churn prediction](https://spavik.co/use-cases/churn-prediction) |
| Will this lead become a customer? | yes or no, with a probability | [Lead conversion](https://spavik.co/use-cases/lead-conversion-prediction) |
| What will this property sell for? | a number | [House prices](https://spavik.co/use-cases/house-price-prediction) |
| How many hours will this parcel take? | a number | [Delivery times](https://spavik.co/use-cases/delivery-time-prediction) |
| How many orders tomorrow? | the next values of a series | [Order forecast](https://spavik.co/use-cases/order-forecast) |
| What will tomorrow's peak demand be? | the next values of a series | [Electricity demand](https://spavik.co/use-cases/electricity-demand-forecast) |

Forecasting needs no model at all: send the series and the number of steps.

```typescript
const forecast = await client.forecast('sales.csv', { target: 'sales', horizon: 7 });
console.log(await forecast.points());
```

## How a model lives

`evaluate` tells you, for free, whether the data can predict the column you
chose and how it compares with a simple guess. `train` creates the model, also
for free. `predict` scores new rows and is, with `forecast`, the only billed
step. Once the real outcome is known, `model.submitOutcomes(...)` reports it,
`model.performance()` shows how the predictions held up, and `model.refresh()`
folds the new examples into the model.

Training needs at least 100 rows, and results are usually limited below 200.
Reaching that size improves the odds without promising a good model, which is
why the evaluation comes first.

## Plans

The Free plan includes 100 predictions per calendar month, reset on the 1st at
00:00 UTC, and one active model. Training, evaluation and backtests are free on
every plan. Paid plans and their limits are on the
[pricing page](https://spavik.co/pricing).

## Works with your data, your runtime and your agents

Pass an array of rows (your own interface types and readonly arrays are
accepted), a single row, CSV or JSON text, or a file path. `Date` values are
sent as ISO 8601 strings. The package ships ESM and CommonJS builds, needs
Node.js 22 or later, and bundles for browsers and edge runtimes that provide
`fetch` and WebCrypto; there, pass the key explicitly with
`new Spavik({ apiKey })`.

If you build with an AI agent, the same operations are available as tools from
the [Spavik MCP server](https://spavik.co/mcp-integration), and a
[Python SDK](https://pypi.org/project/spavik/) covers Python applications.

## Documentation

- [JavaScript and TypeScript guide](https://docs.spavik.co/libraries/javascript)
- [Quickstart](https://docs.spavik.co/start) and [API reference](https://docs.spavik.co)
- [Changelog](https://github.com/spavik-co/spavik-typescript-sdk/blob/main/CHANGELOG.md)
- [Report an issue](https://github.com/spavik-co/spavik-typescript-sdk/issues)

The API may still change before 1.0, and breaking changes are listed in the
changelog. Contributions are welcome, see
[CONTRIBUTING.md](https://github.com/spavik-co/spavik-typescript-sdk/blob/main/CONTRIBUTING.md).

## License

[Apache-2.0](https://github.com/spavik-co/spavik-typescript-sdk/blob/main/LICENSE)
