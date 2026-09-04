# E2E Tests (Playwright)

## Test Structure

- `nrw/tests/` — test specs grouped by feature
- `nrw/pages/` — page objects encapsulating UI selectors
- `nrw/helpers/` — shared utilities and data (reset, mock, enums)

## Conventions

### Minimize database resets

`resetDb()` is slow. Share a single reset across tests that need the same database state. Place `beforeAll` at the highest `describe` level that covers all tests sharing that state, rather than resetting per test or per nested `describe`.

### Mock scenarios

`resetDb()` seeds countries but no events. Use `mockDb()` to set the
event state, and state the scenario explicitly in every spec — including
`MockScenario.noEvents` — so a spec never depends on what ran before it.

### Screenshot assertions

Use `toHaveScreenshot()` for visual regression tests. Reference screenshots are committed to the repo under `__screenshots__/`. Run `npm run test:update-snapshots` to regenerate baselines after intentional UI changes.
