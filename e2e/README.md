# IBF End-to-End (E2E) Tests

End-to-end tests for the IBF platform using [Playwright](https://playwright.dev/).

## Layout

```
e2e/
├── playwright.config.ts     # Playwright configuration (baseURL, projects, ...)
├── env.ts                   # Centralized environment-variable access
└── nrw/
    ├── helpers/             # Shared utilities and data
    ├── pages/NrwMapPage.ts  # Page object for the NRW map view
    └── tests/               # Test specs
```

## Prerequisites

The tests point at an already-running frontend and backend. Start them
separately (see the [root README](../README.md)):

1. **Backend services** (api-service, database, map servers) via Docker:

   ```sh
   # From the repository root
   npm run start:services:detach
   ```

2. **Frontend** (go-web-app):

   ```sh
   npm run setup:e2e:frontend          # one-time: clone go-web-app + create .env from sample
   ```

   Fill in the secrets in `go-web-app/app/.env`:
   - `FONTAWESOME_API_KEY` — required for `pnpm install`
   - `APP_MAPBOX_ACCESS_TOKEN` — required for the map to render
   - `APP_NRW_STANDALONE` - make sure this stays on `true`

   Then install and serve:

   ```sh
   npm run install:e2e:frontend        # installs go-web-app dependencies
   npm run start:e2e:frontend          # builds and serves on http://localhost:5173
   ```

## Configuration

The tests read configuration from `services/.env` (loaded via `env.ts`):

- `EXTERNAL_API_SERVICE_URL` — base URL of the api-service (default
  `http://localhost:4000`), used to seed mock data.
- `RESET_SECRET` — secret required by the `/api/reset` endpoint.
- `BASE_URL` — frontend URL Playwright points at (default
  `http://localhost:5173`).

## Running

```sh
# From the repository root
npm run install:e2e   # one-time: install deps + Playwright browsers
npm run test:e2e

# Or from this directory
npm run setup
npm test
```

## Linting & type-checking

```sh
npm run typecheck
npm run lint
```
