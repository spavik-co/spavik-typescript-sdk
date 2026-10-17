# Contributing

Open pull requests against `dev`. Describe the problem, the public behavior that
changes and how you verified it. Use synthetic data; never include API keys or
customer datasets. Security reports go through [SECURITY.md](SECURITY.md).

## Install from source

Requires Node.js 22 or newer. Until the first npm release:

```sh
git clone --branch dev https://github.com/spavik-co/spavik-typescript-sdk.git
cd spavik-typescript-sdk
npm ci
npm pack
```

`npm pack` builds the SDK. From your application's directory, install the archive:

```sh
npm install /path/to/spavik-typescript-sdk/spavik-0.1.0.tgz
```

Import `Spavik` from `spavik` in JavaScript or TypeScript.

## Local checks

Run from the repository root:

```sh
npm ci
npm run check
```

Tests use a simulated API and require no Spavik account or live service.
Dependency installation requires access to the package registry. The package
check installs the built archive in an isolated temporary application.
Examples are separate live API calls and require an API key.

## Contract metadata

`contract/sdk.json` is the versioned input for generated constants. After updating
it, run `npm run contract`. CI checks that the generated file is current.
See [contract/README.md](contract/README.md). No private repository is required.
Keep the two SDKs consistent with the API's public contract; the server computes
metrics, baselines and billing decisions.

## Conventions

Public documentation, error messages and public API documentation are in English.
Follow the existing code comment style. Write commit messages in English. Preserve
public names and signatures unless a breaking change is explicitly planned.
Add focused regression coverage for behavior changes. Follow the
[code of conduct](CODE_OF_CONDUCT.md).

See [RELEASING.md](RELEASING.md) for promotion from `dev` and package publication.

## HTTP identity

Requests authenticate with `X-Spavik-Api-Key`. `X-Spavik-Client-Name` is
`spavik-sdk-javascript`, and `X-Spavik-Client-Version` is the installed SDK version.
The application can customize its User-Agent with `new Spavik({ userAgent: "my-agent/1.0" })`;
this does not change the SDK identity headers. Without that option, the
User-Agent contains the SDK name and version.

## Current API contract

Model creation and evaluation select an optional engine family; the API owns
the default. Prediction selects an optional engine version within that family.
Forecast and backtest accept both. Changing engine version within a model's
family does not require retraining. Engine versions and model data versions
are distinct; the exact serving engine is available on prediction/forecast
results as `engine`. The family catalogue is a separate API resource.

```typescript
const model = await client.train(rows, { target: 'churn', engineFamily: 'presage' });
const result = await model.predict(newRows, { engineVersion: 'presage-latest' });
const families = await client.engineFamilies();
const report = await client.backtest(history, { target: 'sales', horizon: 7,
  engineFamily: 'presage', includeBacktestPredictions: true });
```

Historical backtest predictions are not future forecasts. To include them in
a forecast response, also enable `backtest`. Diagnostics are returned unchanged:
calibration describes probabilities on the initial test set; it does not
recalibrate them or guarantee reliability. Model `training` retains the initial
version diagnostics, including calibration. Evaluation and performance retain
their complete API reports.

`cout` is `None` in Python / `null` in TypeScript for billable calls because the
API does not return the exact debit. The SDK does not calculate it from the
training engine or assume a tariff of one. Free operations keep a cost of zero.
Forecast billing is horizon times the serving engine tariff, all series included.

HTTP correlation uses `X-Spavik-Request-Id`; each prediction row's `request_id`
is a separate identifier used to submit outcomes. Retries honor `Retry-After`
and preserve the original idempotency key and payload. `REQUEST_INTERRUPTED`
and `IDEMPOTENCY_RESPONSE_UNAVAILABLE` are raised immediately: inspect the request
log or contact support with the HTTP request ID, without creating a new key.

Data preparation makes data valid: types, missingness, duplicates, availability
at the prediction cutoff and leakage checks. Feature engineering makes signal
easier to learn: recency, trailing aggregates, calendar features and lags.
The SDK sends prepared rows; it does not create these features automatically.
Generate and reuse the same transformation code for training and prediction,
using only information available at each cutoff. Learned transformations must
be fitted on training partitions, never on the complete evaluation dataset.


## Dependency maintenance

Use `npm ci` to reproduce `package-lock.json`, and `npm run audit` to check all
development dependencies. CI repeats this audit on changes and weekly.
Dependabot proposes reviewed updates against `dev`; updates are not merged
automatically. Keep `@types/node` aligned with the oldest supported Node LTS
major (22). The published SDK has no runtime dependencies.
