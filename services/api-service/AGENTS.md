# Backend Service (NestJS/TypeScript)

## Naming

- **Modules, Controllers, Services**: plural class names (e.g., `AlertsModule`, `AlertsController`, `AlertsService`)
- **Repositories**: plural class names (e.g., `AlertsRepository`, `EventsRepository`)
- **Prisma models**: singular (e.g., `Alert`, `Event`, `User` in `schema.prisma`)
- **DTOs**: `{Entity}{Action}Dto` for input, `{Entity}ReadDto` for output (e.g., `AlertCreateDto`, `AlertReadDto`)
- **Interfaces**: `Result` suffix for output (e.g., `ClassificationResult`); place in `/interfaces` folder; all attributes `readonly`
- **Enum member names (keys)**: always camelCase (e.g., `singleThreshold`, `vectorTile`, `low`)
- **Functions**: prefix with `get` for data retrieval; add `OrThrow` suffix when deliberately throwing (e.g., `getAlertOrThrow`)

File naming matches class: `AlertsModule` → `alerts.module.ts`, `AlertCreateDto` → `alert-create.dto.ts`

## Module Architecture

- Each module has one responsibility; avoid circular dependencies
- All database interactions go through Repositories — never access Prisma from controllers or services
- Functions do not accept or return Prisma model types — use DTOs
- When importing services from other modules, import the full module

## Controller Pattern

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

## Repository Pattern

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

## DTO Pattern

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

## API Design

- Organize URLs around entities, not use cases — nouns, not verbs
- Use proper HTTP methods and status codes
- 404 for GET to non-existent resource; 200 with empty array for empty collections
- Limit URL nesting to 2 levels (`/alerts/:id/severity`)

## Database

- ORM: Prisma with PostgreSQL
- Always include `"api-service"` schema in raw SQL queries
- Use Prisma migrations for schema changes; keep migrations minimal and focused
- Migrations should assume a production database with existing data
  - Consider the prisma schema in the main branch as the production schema
  - Modify generated migration files with statements to transform existing data to the new schema

## Exception Handling

- Use NestJS `HttpException` with a descriptive string as first argument
- Exceptions can be used for control flow

## Testing

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

## Import Organization

- External packages first, relative imports last
- Enforced by simple-import-sort (ESLint plugin)
