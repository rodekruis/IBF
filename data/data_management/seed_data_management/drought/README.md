# Drought climate-region area mapping

`migrate_drought_region_area_mapping.py` transfers the drought climate regions (currently maintained in
[seed-alert-configs.const.ts](../../../../services/api-service/src/seed/seed-data/seed-alert-configs.const.ts)) from a source admin-area dataset onto a target dataset by overlaying each region's
source footprint on the target areas. It is a reusable step in the admin-area update
workflow. It takes existing region mappings tied to a source admin-area dataset and
produces mappings tied to a target admin-area dataset. It is rerunnable with different
source and target inputs. Its output updates application seed data rather than the
seed-data repository, so its manifest records the source and target inputs used for
each run.

Some countries use an empty `placeCodes` array, meaning national scope, so boundary changes do not affect them.

```bash
cd data
uv run python -m data_management.seed_data_management.drought.migrate_drought_region_area_mapping \
  --old-seed-repo /tmp/ibf-seed-old-main \
  --new-seed-repo /path/to/IBF-seed-data \
  --old-seed-revision <sha> \
  --output-directory /tmp/ibf-drought-migration
```
