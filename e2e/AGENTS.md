# E2E Tests (Playwright)

## Test Structure

- `nrw/tests/` — test specs grouped by feature
- `nrw/pages/` — page objects encapsulating UI selectors
- `nrw/helpers/` — shared utilities (e.g., database reset)

## Conventions

### Minimize database resets

`resetDb()` is slow. Share a single reset across tests that need the same database state. Place `beforeAll` at the highest `describe` level that covers all tests sharing that state, rather than resetting per test or per nested `describe`.

### Screenshot assertions

Use `toHaveScreenshot()` for visual regression tests. Reference screenshots are committed to the repo under `__screenshots__/`. Run `npm run test:update-snapshots` to regenerate baselines after intentional UI changes.
