-- Change geo-feature.geometry from JSONB to a real PostGIS geometry column so
-- that pg_featureserv can discover the table.
-- Column is nullable so Prisma ORM can INSERT rows before geometry is set
-- via $executeRaw within the same transaction.
--
-- Drop + re-add avoids a USING expression that references PostGIS functions,
-- which lets this migration apply cleanly to a fresh shadow database where
-- there is no existing data to convert.  Any existing JSONB geometry data on
-- a live database must be re-loaded via the seed script after this migration.
ALTER TABLE "api-service"."geo-feature" DROP COLUMN geometry;
ALTER TABLE "api-service"."geo-feature" ADD COLUMN geometry public.geometry(Geometry, 4326);
