# Archived hybrid model

The hybrid pipeline has been replaced in production by the [unified model](unified-model.md). This path remains for existing documentation links.

The archived implementation in `packages/core/src/state-space/build.js` combines state-space, online and graph estimates and retains its fitted form heads. Older research and regression tests use it as a reference. It must not be used to rebuild website ratings, forecasts or Insights. Use `npm run build:model` for production.
