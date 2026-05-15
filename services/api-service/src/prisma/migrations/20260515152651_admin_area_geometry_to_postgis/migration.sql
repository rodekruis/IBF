-- Enable PostGIS so geometry types and functions are available.
-- IF NOT EXISTS makes this safe to run against databases where PostGIS is already
-- installed.
-- SCHEMA public is required because migrations run with search_path restricted to
-- "api-service".
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;

-- Change admin-area.geometry from JSONB to a real PostGIS geometry column so
-- that pg_featureserv can discover the table.
-- Column is nullable so Prisma ORM can INSERT rows before geometry is set
-- via $executeRaw within the same transaction.
--
-- Drop + re-add avoids a USING expression that references PostGIS functions,
-- which lets this migration apply cleanly to a fresh shadow database where
-- there is no existing data to convert.  Any existing JSONB geometry data on
-- a live database must be re-loaded via the seed script after this migration.
ALTER TABLE "api-service"."admin-area" DROP COLUMN geometry;
ALTER TABLE "api-service"."admin-area" ADD COLUMN geometry public.geometry(MultiPolygon, 4326);
