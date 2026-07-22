# Agent Instructions - National Risk Watch (NRW)

## Repository Overview

NRW is a web app to visualize hazard forecasts. This repository contains:

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
- Always include Azure DevOps reference `AB#XXXXX` in PR body
- Be conservative with adding comments to new generated code, but do not remove existing comments for no reason. They can be edited or removed if relevant.
  Do NOT remove existing comments — when editing code that already has comments, preserve them
- Avoid hardcoded values; prefer configuration. Avoid "magic" numbers or strings.
- Organize functions using the "step-down" approach: high-level functions first, then implementation details. Place private/helper functions near the public functions they support.

### Code Quality Verification

Before finalizing any code change, agents must auto-fix and verify:

```bash
npm run fix:prettier        # auto-fix formatting
npm run fix:api-service     # auto-fix api-service linting
npm run test:prettier       # verify formatting
```

For specific components:

```bash
cd services/api-service && npm run lint && npm run typecheck
cd data && uv run python python-knip.py
```

Do not use `--no-verify`, `eslint-disable`, `@ts-ignore`, or `@ts-expect-error` to suppress errors unless explicitly told to do so.

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

## Self-Improvement Protocol

**Important**: All LLM agents must follow this protocol:

1. **When reviewing PRs**: Always check if the changes introduce new patterns, conventions, or insights that should be added to these instructions
2. **When learning new patterns**: If you discover better practices while working on this codebase, suggest updates to this file
3. **Continuous improvement**: Regularly evaluate whether these instructions reflect the current state and best practices of the codebase
4. **Documentation updates**: When adding new features or changing existing patterns, ensure these instructions are updated accordingly
5. **Error reporting**: When encountering unexpected errors (e.g., inability to access resources, API failures, permission issues), always report these to reviewers so alternative approaches can be tried

### For PR Review Agents

- **Check instruction updates**: Review if the PR introduces patterns that should be documented here
- **Suggest improvements**: Recommend additions or modifications to these instructions based on code changes
- **Maintain consistency**: Ensure new code follows the patterns documented in these instructions
- **Update when needed**: Create follow-up tasks to update these instructions when significant architectural changes are made
- **Report obstacles**: When unable to access required resources (wikis, documentation, APIs), inform reviewers immediately with specific error details

### For Code Generation Agents

- **Follow current patterns**: Always reference these instructions when generating code suggestions
- **Learn from feedback**: When suggestions are rejected, consider if the instructions need clarification
- **Propose enhancements**: Suggest updates to these instructions when you identify gaps or improvements
- **Stay current**: Regularly re-read these instructions as they evolve with the codebase
- **Surface issues**: Report any unexpected errors, access issues, or limitations encountered during code analysis or generation

Remember: This platform serves humanitarian aid operations. Code quality and reliability directly impact people in need. Write code that is secure, maintainable, and well-tested.
