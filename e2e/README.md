# IBF End-to-End (E2E) Tests

End-to-end tests for the IBF platform using [Playwright](https://playwright.dev/).

## Layout

```
e2e/
├── playwright.config.ts     # Playwright configuration (baseURL, projects, ...)
├── env.ts                   # Centralized environment-variable access
└── nrw/
    ├── helpers/reset.ts     # Seeds api-service mock data via /instance/reset
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

2. **Frontend** (`nrw-standalone`):

   ```sh
   # From the repository root
   npm run setup:frontend   # one-time: init submodule + install deps + .env
   npm run start:frontend   # builds and serves the static bundle on http://localhost:5173
   ```

## Configuration

The tests read configuration from `services/.env` (loaded via `env.ts`):

- `EXTERNAL_API_SERVICE_URL` — base URL of the api-service (default
  `http://localhost:4000`), used to seed mock data.
- `RESET_SECRET` — secret required by the `/instance/reset` endpoint.
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
