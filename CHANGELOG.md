# Changelog

## Unreleased

- Prepare the SDK for public development on `dev` under Apache-2.0.
- Add standalone contract generation, contribution guides, examples and CI.
- Preserve API evaluation and performance reports, including baseline comparisons
  and reasons for undefined metrics.
- Use the forecast horizon per call, with all series included, for forecast cost
  reporting.
- Remove local prediction and forecast estimation helpers.
- Migrate implementation sources to TypeScript while preserving ESM/CommonJS
  entry points and the public API.
- Use `spavik` as the npm package name before the first public release.
- Forward `pointEstimate` and `quantiles` in forecasting backtests.
