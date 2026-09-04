# About

This directory has scripts for data management/transform/fetching for the seed data repo and DB.

To run data upload scripts, you'll need to set up a local DB. See the `<repo root>/services/docker-compose` file.

Also see the [data/README](../README.md) for setup.

For specific notes on the data being used, see the [seed data repo readme](https://github.com/rodekruis/IBF-seed-data/blob/main/README.md).

**Note:** Some of the work done (as of March 2026) needs refinement still, notably these changes:

- Better structure for the data management python files (https://dev.azure.com/redcrossnl/IBF/_workitems/edit/41201)

## Directories

### seed_data_management/

The scripts here are for fetching and processing data, with the end goal of storing it in the seed data repo (or other locations as needed).

See the summary in each script for the purpose.

### utils/

Shared util files

## Admin areas update process

Admin-area source retrieval, processing, population enrichment, and validation are documented in [seed_data_management/admin_areas/README.md](seed_data_management/admin_areas/README.md).
