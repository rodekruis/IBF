# Data Pipelines (Python)

## Project Structure

- `pipelines/infra/` — shared infrastructure: data submission, integrity checks, configuration
- `pipelines/<hazard-type>/` — hazard-specific pipeline implementations (flood, drought)
- `pipelines/test/` — tests: unit, infra-integration, pipeline-integration
- `data_management/` — scripts for managing seed data

## Style

- Use dataclasses for data models, `StrEnum` for string enumerations
- Enum member names: UPPER_SNAKE_CASE (standard Python convention)
- Use type annotations everywhere; avoid `Any`
- No abbreviations — same principle as the TypeScript codebase

## Infra vs Hazard Code Separation

- `pipelines/infra/` owns all infrastructure concerns: data loading/cleanup, configuration, submission, resource lifecycle
- `pipelines/<hazard-type>/forecast.py` contains only hazard-specific logic (data science, alert determination, exposure calculation)
- Try to stay away from changing `forecast.py` or other hazard-logic files, when working on generic/infra changes, unless the alternative is much worse.

## Testing

```bash
cd data
uv run pytest pipelines/test/unit/                  # unit tests
uv run pytest pipelines/test/unit/ -k test_integrity # specific test
uv run pytest pipelines/test/integration_infra/     # infra integration tests
uv run python python-knip.py                        # linting (ruff, deptry, vulture)
```
