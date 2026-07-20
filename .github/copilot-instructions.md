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

## Backend Service (NestJS/TypeScript)

Location: `services/api-service/`

### Naming

- **Modules, Controllers, Services**: plural class names (e.g., `AlertsModule`, `AlertsController`, `AlertsService`)
- **Repositories**: plural class names (e.g., `AlertsRepository`, `EventsRepository`)
- **Prisma models**: singular (e.g., `Alert`, `Event`, `User` in `schema.prisma`)
- **DTOs**: `{Entity}{Action}Dto` for input, `{Entity}ReadDto` for output (e.g., `AlertCreateDto`, `AlertReadDto`)
- **Interfaces**: `Result` suffix for output (e.g., `ClassificationResult`); place in `/interfaces` folder; all attributes `readonly`
- **Enum member names (keys)**: always camelCase (e.g., `singleThreshold`, `vectorTile`, `low`)
- **Functions**: prefix with `get` for data retrieval; add `OrThrow` suffix when deliberately throwing (e.g., `getAlertOrThrow`)

File naming matches class: `AlertsModule` → `alerts.module.ts`, `AlertCreateDto` → `alert-create.dto.ts`

### Module Architecture

- Each module has one responsibility; avoid circular dependencies
- All database interactions go through Repositories — never access Prisma from controllers or services
- Functions do not accept or return Prisma model types — use DTOs
- When importing services from other modules, import the full module

### Controller Pattern

```typescript
@ApiTags('alerts')
@UseGuards(AuthenticatedUserGuard)
@Controller('alerts')
export class AlertsController {
  public constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @AuthenticatedUser()
  @ApiOperation({ summary: 'Get all alerts' })
  public async getAlerts(): Promise<AlertReadDto[]> {
    return this.alertsService.getAlerts();
  }
}
```

- HTTP verb decorator (`@Get`, `@Post`, etc.) must be the first decorator on an endpoint method
- Use `@AuthenticatedUser()` decorator and `AuthenticatedUserGuard` for auth

### Repository Pattern

Repositories wrap `PrismaService` and return DTOs:

```typescript
@Injectable()
export class AlertsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async getAlertOrThrow(id: number): Promise<AlertReadDto> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: alertInclude,
    });
    if (!alert) {
      throw new NotFoundException(`Alert with id ${id} not found`);
    }
    return this.getAlertReadDto(alert);
  }
}
```

### DTO Pattern

- Use classes with validation decorators and `@ApiProperty`
- All attributes `readonly`
- One DTO per file in module's `dto/` folder

```typescript
export class AlertCreateDto {
  @ApiProperty({ example: 'KEN_floods_station-A' })
  @IsString()
  public readonly eventName: string;

  @ApiProperty({ enum: HazardType })
  public readonly hazardType: HazardType;
}
```

### API Design

- Organize URLs around entities, not use cases — nouns, not verbs
- Use proper HTTP methods and status codes
- 404 for GET to non-existent resource; 200 with empty array for empty collections
- Limit URL nesting to 2 levels (`/alerts/:id/severity`)

### Database

- ORM: Prisma with PostgreSQL
- Always include `"api-service"` schema in raw SQL queries
- Use Prisma migrations for schema changes; keep migrations minimal and focused
- Migrations should assume a production database with existing data
  - Consider the prisma schema in the main branch as the production schema
  - Modify generated migration files with statements to transform existing data to the new schema

### Exception Handling

- Use NestJS `HttpException` with a descriptive string as first argument
- Exceptions can be used for control flow

### Testing

- **Unit tests** (`*.spec.ts`): mock dependencies, test business logic and edge cases
- **Integration tests** (`*.test.ts`): test real API interactions, placed in `/test` folder
- Do not test private methods directly

```bash
docker exec api-service npm run test:unit:all                       # all unit tests
docker exec api-service npm run test:unit:all alerts.service        # specific file
docker exec api-service npm run test:integration:all                # all integration tests
docker exec api-service npm run test:integration:all login.test     # specific file
npm run typecheck                                                   # type checking
npm run lint                                                        # linting
```

### Import Organization

- External packages first, relative imports last
- Enforced by simple-import-sort (ESLint plugin)

---

## Data Pipelines (Python)

Location: `data/`

### Project Structure

- `data/pipelines/infra/` — shared infrastructure: data submission, integrity checks, configuration
- `data/pipelines/<hazard-type>/` — hazard-specific pipeline implementations (flood, drought)
- `data/pipelines/test/` — tests: unit, infra-integration, pipeline-integration
- `data/data_management/` — scripts for managing seed data

### Style

- Use dataclasses for data models, `StrEnum` for string enumerations
- Enum member names: UPPER_SNAKE_CASE (standard Python convention)
- Use type annotations everywhere; avoid `Any`
- No abbreviations — same principle as the TypeScript codebase

### Infra vs Hazard Code Separation

- `pipelines/infra/` owns all infrastructure concerns: data loading/cleanup, configuration, submission, resource lifecycle
- `pipelines/<hazard-type>/forecast.py` contains only hazard-specific logic (data science, alert determination, exposure calculation)
- Never put infrastructure concerns in `forecast.py`

### Testing

```bash
cd data
uv run pytest pipelines/test/unit/                  # unit tests
uv run pytest pipelines/test/unit/ -k test_integrity # specific test
uv run pytest pipelines/test/integration_infra/     # infra integration tests
uv run python python-knip.py                        # linting (ruff, deptry, vulture)
```

---

## Portal Frontend (React)

Location: `portal/nrw-standalone/`

- Wrapper around the IFRC Go NRW code (sparsely checked-out git submodule at `portal/nrw-standalone/src/go-web-app`)
- Uses React 19, Vite, pnpm, Tailwind CSS

---

## Local Development

```bash
npm run install:all         # install all dependencies
npm run start:services      # start backend services (Docker)
npm run fix:all             # fix linting issues
npm run test:prettier       # check formatting
```

Environment: copy `services/.env.example` to `services/.env`.
