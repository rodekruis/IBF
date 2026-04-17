# About

This directory has scripts for data management/transform/fetching for the seed data repo and DB.

To run data upload scripts, you'll need to set up a local DB. See the `<repo root>/services/docker-compose` file.

Also see the [data/README](../README.md) for setup.

For specific notes on the data being used, see the [seed data repo readme](https://github.com/rodekruis/IBF-seed-data/blob/main/README.md).

**Note:** Some of work done (as of March 2026) needs refinement still, notably these changes:

- Centralize table schema, table creation, initial table data population
- Better structure for the data management python files (https://dev.azure.com/redcrossnl/IBF/_workitems/edit/41201)

## Directories

### data_upload

The scripts here are used for development/prototyping purposes for uploading data to the IBF DB, to the 'debug' table schema. See the summary in each script for the purpose.

TODO: The full model and final upload/data management code will be handled by Nest.js/Prisma.

### seed_data_management

This scripts here are for fetching and processing data, with the end goal of storing it in the seed data repo (or other locations as needed).

See the summary in each script for the purpose.

### utils

Shared util files

## Processes

### Updating admin areas

(April 2026) This process is still under development. The scripts here are used for development/prototyping purposes. See the data_upload section above for more info. The current flow is this:

1. Admin files from many sources are preprocessed, and placed into `admin-areas/processed` in the seed repo.
2. The data is uploaded from `admin-areas/processed` to the DB by `upload_admin_areas.py`

IBF v1 admin area files are used as the base. These are processed via `populate_ibf_v1_admin_area_parents.py`

We need higher resolution admin areas though, and we also need admin areas not present in IBF v1. The best source is GADM. This is fetched with `fetch_gadm_admin_areas.py` and next parsed with `convert_gadm_admin_areas.py`

We will need to get more sources though and set up a processing flow. See [PBI 41181](https://dev.azure.com/redcrossnl/IBF/_workitems/edit/41181) for more info.
