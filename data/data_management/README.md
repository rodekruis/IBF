# About

This directory has scripts for data management/transform/fetching for the seed data repo and DB.

To run data upload scripts, you'll need to set up a local DB. See the `<repo root>/services/docker-compose` file.

Also see the [data/README](../README.md) for setup.

For specific notes on the data being used, see the [seed data repo readme](https://github.com/rodekruis/IBF-seed-data/blob/main/README.md).

**Note:** Some of the work done (as of March 2026) needs refinement still, notably these changes:

- Better structure for the data management python files (https://dev.azure.com/redcrossnl/IBF/_workitems/edit/41201)

## Directories

### data_upload/

Dev scripts for uploading data. See comments in the files for more details. There is a chance the schema or data structure in these files is out-of-date, so be sure to update them before use. More details are in the files.

### seed_data_management/

The scripts here are for fetching and processing data, with the end goal of storing it in the seed data repo (or other locations as needed).

See the summary in each script for the purpose.

### utils/

Shared util files

## Data processing notes

### Multiple admin level 0 areas for the same country
Using data from GADM, there is multiple admin level 0 shapes for China, India, and Pakistan.
The first shape is always the main country, while the others are disputed territories. The current solution (June 2026) is to delete the shapes for disputed territories, which results in holes in the map for the Kashmir region and part of the Himalayas (part of Arunachal Pradesh). If we merge the disputed territories into the main country data, we get overlapping countries. Depending of the draw order of the countries, our map would look like it agrees (at random) to one territorial claim over another.

This may need to be handled differently in the future.

These are not the only disputed borders we may need to rework, but they are the only ones represented as individual admin level 0 areas with the same country names.

## Admin areas update process

(June 2026) This process is still under development. The scripts here are used for development/prototyping purposes until this can be streamlined. The current steps are the following:

#### 1. Process IBF v1 admin area data

IBF v1 admin area files are used as the base. These are processed via `populate_ibf_v1_admin_area_parents.py` and written into `admin-areas/processed` in your local copy of the seed repo.

#### 2. Process other admin area data

We need higher resolution admin areas than the IBF v1 files, and we also need admin areas not present in IBF v1. The best source is GADM. This is fetched with `fetch_gadm_admin_areas.py` and then parsed with `convert_gadm_admin_areas.py` and written into `admin-areas/processed` in your local copy of the seed repo.

We will need to get more sources though and set up a processing flow. See [PBI 41181](https://dev.azure.com/redcrossnl/IBF/_workitems/edit/41181) for more info.

#### 3. Add population data

The population changes are operated directly on admin area data files in `admin-areas/processed` in your local copy of the seed repo.

The process may simplify in the future, but the steps are:

1. If you need new population rasters that are not already in the seed repo, fetch and preprocess them with `seed_data_management/fetch_population_raster.py`
2. Apply these fetched rasters to the admin areas with `seed_data_management/add_population_to_admin_areas.py`

#### 4. Clean again, and assure parents are added.

Any remaining formatting issues that were not picked up in previous steps are cleaned with `clean_all_processed_admin_areas.py`. This processes directly on files in `admin-areas/processed` in your local copy of the seed repo.

#### 4. Check in seed repo changes

To save your data changes, commit them to the seed repo.
