# Flood seed data

## Flood depth source rasters

`build_flood_depth_sources.py` builds `hazard/flood/flood-extents/sources-tif/{ISO3}_flood_extent_rp{N}.tif` in the seed repo from the [JRC/GloFAS global river flood hazard maps](https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CEMS-GLOFAS/flood_hazard/) (water depth in metres, ~90 m).

Per country and return period, it:

1. Selects the JRC tiles intersecting the country's adm0 bounding box (via `tile_extents.geojson`).
2. Merges the `_depth.tif` tiles, cropped to that bounding box.
3. Masks lakes from [HydroLAKES](https://www.hydrosheds.org/products/hydrolakes) as nodata (`-9999`).

Where files go:

- **Output**: written directly into the local seed repo (`SEED_DATA_REPO_ROOT` in `data/.env`), overwriting `sources-tif/`. Use `--output-directory` to write elsewhere for review.
- **Downloads**: cached in this repo under `data/data/flood-depth-sources-cache/` and `data/data/lakes/` (gitignored, several GB for all countries).

Afterwards, `convert_flood_depth_to_png.py` converts `sources-tif/` into `data-png/` (plus metadata and manifests), also in the seed repo.

```bash
cd data
uv run python -m data_management.seed_data_management.flood.build_flood_depth_sources --countries MWI
uv run python -m data_management.seed_data_management.flood.convert_flood_depth_to_png
```

# Flood GloFAS station-area mapping

## Spatial migration

`migrate_glofas_station_area_mapping.py` is the migration-style step in the admin-area update workflow. It takes existing station mappings tied to a source admin-area dataset and produces mappings tied to a target admin-area dataset. It is rerunnable with different source and target inputs. It transfers the existing mappings instead of creating new mappings based on river analysis, to minimize differences compared with v1 while IBF and NRW run side by side and before the basin refactor (AB#42674).

For each station, the script:

1. Loads the source deepest-level PCODEs from the source station-threshold JSON.
2. Unions the corresponding source admin-area geometries into the station's source footprint.
3. Finds target deepest-level admin areas that overlap that footprint.
4. Includes a target area when at least the configured fraction of the target area is covered by the source footprint.
5. Writes proposed station-threshold JSON and a detailed per-station overlap report.

The default per-area threshold is `0.25`: a target area must have at least 25%
of its area covered by the source footprint. The report also calculates combined
coverage using the union of all accepted target areas, avoiding double-counting
overlapping polygons. A station is flagged for review when combined coverage of
the source footprint is below the default `0.9` threshold. This allows target
areas to be larger than their source counterparts while preserving the source
footprint as the primary requirement. Source repositories are never modified.

Each deepest-level area should drain to a single station, but step 3 runs per
station and cannot see the other stations' claims. The report therefore lists
`shared_new_pcodes` per station: any proposed area that another station also
claims, with the competing station codes. This is expected to be empty, and is
flagged in `review` when it is not. Shallower levels are not checked, because a
parent area legitimately contains sub-areas draining to different stations.

### Example

The source repository can be materialized from a Git ref and the target repository can be the currently checked-out seed-data branch:

```bash
rm -rf /tmp/ibf-seed-old-main /tmp/ibf-glofas-migration
mkdir -p /tmp/ibf-seed-old-main /tmp/ibf-glofas-migration
git -C /path/to/IBF-seed-data archive origin/main | tar -x -C /tmp/ibf-seed-old-main

cd data
uv run python -m data_management.seed_data_management.flood.migrate_glofas_station_area_mapping \
  --old-seed-repo /tmp/ibf-seed-old-main \
  --new-seed-repo /path/to/IBF-seed-data \
  --old-seed-revision cb5bda2d8b80984b5bfff8d7c4f451468e0e6a94 \
  --new-seed-revision "$(git -C /path/to/IBF-seed-data rev-parse HEAD)" \
  --output-directory /tmp/ibf-glofas-migration \
  --minimum-new-area-overlap 0.25 \
  --minimum-old-footprint-coverage 0.9
```

The source data is reproducible from the set Git revision passed in
`--old-seed-revision`; the temporary extracted directory is only a working
copy. The output contains one proposed `*_station_thresholds.json` file, one
`*_station_area_migration.json` report, and one
`*_migration_manifest.json` provenance file per flood country. The manifest
records both repository URLs, revisions, exact input paths, threshold, and
output paths. Review the reports before copying proposed JSON and its manifest
into the seed-data repository.
