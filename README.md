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

## Good to know in production

**Configuration.** The client reads `SPAVIK_API_KEY`, and `SPAVIK_BASE_URL`
when set, in its constructor. Without a key, every call except `engines()` and
`engineFamilies()` raises `SpavikAuthError` locally ("no API key: set
SPAVIK_API_KEY or pass apiKey. Nothing was sent."). An unknown option, such as
`explain` passed to `train`, raises `SpavikDataError` naming it.

**Timeouts.** Without the `timeout` option, each operation keeps its own
deadline: 30 s for predictions, 60 s for forecasts, 120 s for training and
evaluation. `new Spavik({ timeout: 300_000 })`, in milliseconds, replaces all of
them, for instance for `evaluate` with `explain` on a wide table. The deadline
covers the connection and the full response body of each attempt. Custom
`fetch` implementations must honour the supplied `AbortSignal`.

**Retries and safe replays.** Network errors and temporary API errors are
retried with backoff, with the same payload and idempotency key. After the last
failure, `SpavikTransportError` keeps `idempotencyKey`, plus `requestId` and
`status` when headers arrived. A lost response does not mean the call failed,
so replay it with the same key: `train`, `predict`, `forecast`,
`submitOutcomes` and `refresh` accept `idempotencyKey`, and a replayed key is not
billed twice. A `Retry-After` above 60 s raises `SpavikRateLimited` at once.

```typescript
try {
  await model.predict(rows);
} catch (error) {
  if (error instanceof SpavikTransportError && error.idempotencyKey) {
    await model.predict(rows, { idempotencyKey: error.idempotencyKey });
  }
}
```

**Strings that look like files.** A string starting with `[` or `{` is JSON. One
ending in `.csv`, `.tsv`, `.txt` or `.json`, or containing a `/`, is read as a
file path, so `predict('notes/client')` fails with `file not found`; pass such
text inside an object. Anything else is read as CSV text.

**CSV text.** Comma, semicolon, tab and pipe separators are recognised, along
with quoted fields and multiline values. Duplicate or empty headers and
malformed rows raise `SpavikDataError` with the line number before any call, and
headers lose their surrounding spaces. Two edge cases differ from the Python
SDK: integers beyond 2^53 stay text here (Python reads them as integers), and a
quote inside an unquoted field is refused here (Python accepts it).

**Saving results.** There is no prediction history to download later. Store the
results you need, with their `request_id`, in your own database. `Result`,
`Prediction` and `Forecast` keep the body in `data` and expose `requestId`,
`predictionsRemaining` and `engineVersion` from the headers.

**Outcomes and data retention.** Each outcome needs a non-empty `features`
object and `actual`. To measure quality, also send the original `prediction`,
its model `version` and the exact `engine` (`presage-2`, not an alias), plus
`probabilities` when available. Zero Data Retention only stops the archiving of
inference inputs and outputs; models, versions and outcomes are kept on every
plan.

**Webhooks.** `verify(rawBody, headers, secret)` checks the `Spavik-Signature`
header with WebCrypto. It accepts Fetch `Headers` or a plain object such as
Express `req.headers`, and refuses a missing secret with
`SpavikSignatureError('missing webhook secret')`.

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
