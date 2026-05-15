-- Change admin-area.geometry from JSONB to a real PostGIS geometry column so
-- that pg_featureserv can discover the table.
-- Z coordinates are stripped with ST_Force2D for uniformity.
-- Column is nullable so Prisma ORM can INSERT rows before geometry is set
-- via $executeRaw within the same transaction.
-- PostGIS functions are schema-qualified (public.*) because the migration
-- runs with search_path restricted to "api-service".
ALTER TABLE "api-service"."admin-area"
  ALTER COLUMN geometry TYPE public.geometry(MultiPolygon, 4326)
  USING public.ST_Force2D(public.ST_GeomFromGeoJSON(geometry::text));

ALTER TABLE "api-service"."admin-area"
  ALTER COLUMN geometry DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "admin-area_geom_idx"
  ON "api-service"."admin-area" USING GIST (geometry);
