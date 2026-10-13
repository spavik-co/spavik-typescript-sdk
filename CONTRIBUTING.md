# Contributing

Open pull requests against `dev`. Describe the problem, the public behavior that
changes and how you verified it. Use synthetic data; never include API keys or
customer datasets. Security reports go through [SECURITY.md](SECURITY.md).

## Install from source

Requires Node.js 18 or newer. Until the first npm release:

```sh
git clone --branch dev https://github.com/spavik-co/spavik-typescript-sdk.git
cd spavik-typescript-sdk
npm ci
npm pack
```

`npm pack` builds the SDK. From your application's directory, install the archive:

```sh
npm install /path/to/spavik-typescript-sdk/spavik-client-0.1.0.tgz
```

Import `Spavik` from `@spavik/client` in JavaScript or TypeScript.

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
