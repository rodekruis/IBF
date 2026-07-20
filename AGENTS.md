# GitHub Copilot Instructions - National Risk Watch (NRW)

## Repository Overview

IBF is a web app to visualize hazard forecasts. This repository contains:

- `services/api-service/` — NestJS backend API (TypeScript, Prisma, PostgreSQL)
- `data/` — Python code for both hazard forecast pipelines and data management scripts
- `portal/nrw-standalone/` — React frontend wrapper around the IFRC Go NRW submodule

---

## General Conventions (all languages)

- Use full names, no abbreviations — let IDE auto-complete handle length
- Avoid `any` (TypeScript) and `Any` (Python) — use proper types everywhere
- Use type annotations everywhere
- Do not include "Enum" suffix for enum names (e.g., `HazardType`, not `HazardTypeEnum`)
- Follow existing code patterns — prioritize readability over cleverness
- Always include Azure DevOps reference `AB#XXXXX` in commit body
- Do NOT remove existing comments — when editing code that already has comments, preserve them

### Commit Conventions

Conventional Commits with Angular format (enforced by CI):

```
feat: Add alert raster upload endpoint

See AB#12345
```

Prefixes: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`
Use imperative mood ("Add feature", not "Added feature").

### Pull Request Guidelines

- Keep PRs small, single-responsibility
- Include AB# task reference
- Add label for release notes: `enhancement`, `bugfix`, `other`, `chore`
- Author merges after approval

---

## Local Development

```bash
npm run install:all         # install all dependencies
npm run start:services      # start backend services (Docker)
npm run fix:all             # fix linting issues
npm run test:prettier       # check formatting
```

Environment: copy `services/.env.example` to `services/.env`.
