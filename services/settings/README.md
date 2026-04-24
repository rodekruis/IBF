# pg_featureserv

[pg_featureserv](https://github.com/CrunchyData/pg_featureserv) is a lightweight OGC API Features server that reads directly from PostgreSQL. It auto-discovers tables and views that have a PostGIS geometry column and serves them as GeoJSON feature collections.

## How it works in IBF

The `admin-area` table in the `api-service` schema stores geometry as JSONB (for Prisma compatibility).

**TODO**: pg_featureserv cannot discover this table yet because it requires a real PostGIS `geometry` column. To fix this, either:

1. Change the column to a PostGIS `geometry` type (requires raw SQL inserts and `Unsupported("geometry")` in Prisma)
2. Create a SQL view that casts JSONB to geometry via `ST_GeomFromGeoJSON`

Both approaches also require making the `api-service` schema visible to pg_featureserv's connection (via `search_path` or the `DATABASE_URL` options parameter).

## Example queries

Base URL: `http://localhost:9000`

**List available collections:**

```
GET /collections.json
```

**Get admin areas for a country at a specific admin level:**

```
GET /collections/api-service.admin-area/items.json?countryCodeIso3=KEN&adminLevel=1
```

**Get admin areas with simplified geometry (for map display performance):**

```
GET /collections/api-service.admin-area/items.json?countryCodeIso3=KEN&adminLevel=2&transform=ST_Simplify,0.01
```

**Get a single admin area by id:**

```
GET /collections/api-service.admin-area/items/{id}.json
```

**Limit and offset for pagination:**

```
GET /collections/api-service.admin-area/items.json?countryCodeIso3=KEN&adminLevel=3&limit=100&offset=0
```

**Select specific properties only:**

```
GET /collections/api-service.admin-area/items.json?countryCodeIso3=KEN&adminLevel=1&properties=placeCode,nameEn
```

## Configuration

See [pg_featureserv.json](pg_featureserv.json) for the service configuration. Key settings:

- `Paging.LimitDefault`: Default page size (1000)
- `Server.TransformFunctions`: Allowed transform functions (`ST_Simplify`)
