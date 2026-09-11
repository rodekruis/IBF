# Admin Areas

This directory contains the scripts that retrieve, process, enrich, and validate administrative-area data in the sibling `IBF-seed-data` repository.

The active configuration is defined in `admin_area_source_config.py`. Each country uses one source for all configured admin levels. Most countries currently use HDX COD-AB data; Kenya uses GADM to keep adm0-3 source-consistent.

## Prerequisites

- The `data/.env` file must define `SEED_DATA_REPO_ROOT` for the local `IBF-seed-data` checkout.
- Run commands from the `data/` directory with the project virtual environment active.
- The configured WorldPop population PNG and metadata files must be present in `IBF-seed-data/exposure/population/data-png/` before population enrichment.

## Active Pipeline

Run stages in this order. Each stage writes to the local `IBF-seed-data` repository.

```bash
python -m data_management.seed_data_management.admin_areas.fetch_gadm_admin_areas
python -m data_management.seed_data_management.admin_areas.fetch_hdx_admin_areas
python -m data_management.seed_data_management.admin_areas.convert_gadm_admin_areas
python -m data_management.seed_data_management.admin_areas.convert_hdx_admin_areas
python -m data_management.seed_data_management.admin_areas.complete_admin_area_parents
python -m data_management.seed_data_management.admin_areas.process_admin_area_geometries
python -m data_management.seed_data_management.admin_areas.add_population_to_admin_areas
python -m data_management.seed_data_management.admin_areas.generate_admin_area_source_manifest
python -m data_management.seed_data_management.admin_areas.validate_admin_areas
```

The stages perform the following work:

1. Fetch the configured GADM source files into `admin-areas/sources/gadm/`.
2. Fetch the configured HDX source archives and extract the selected admin levels into `admin-areas/sources/hdx/`.
3. Convert GADM source files into the common admin-area GeoJSON schema in `admin-areas/processed/`.
4. Convert HDX property variants into the common admin-area GeoJSON schema in `admin-areas/processed/`.
5. Add explicitly configured missing parent areas, currently South Sudan's `SS00` Abyei Region.
6. Repair geometries, normalize them to `MultiPolygon`, and merge safe multipart duplicate-pcode features.
7. Compute independent zonal population totals for every configured processed feature.
8. Generate `admin_area_sources.json` in the seed-data repo to record source and processing metadata.
9. Validate processed completeness, stored source files where applicable, canonical schema, hierarchy, geometries, and population values. A successful validation regenerates `admin_area_validation_report.md`.

## Generated Metadata

`generate_admin_area_source_manifest.py` writes `admin-areas/admin_area_sources.json` in the seed-data repo. This records source datasets, configured levels, raw-source storage policy, and processing rules such as simplification and synthetic parent areas.

`validate_admin_areas.py` writes `admin_area_validation_report.md` only after a zero-error validation result. Commit the updated manifest and report with the matching processed seed data so reviewers can inspect source decisions and processed counts without rerunning the pipeline.
