# Drought climate-region area mapping

`migrate_drought_region_area_mapping.py` moves the drought climate regions in
[seed-alert-configs.const.ts](../../../../services/api-service/src/seed/seed-data/seed-alert-configs.const.ts)
onto a new admin-area dataset, by overlaying each region's old footprint on the new
areas. It is a near-copy of the flood [station-area migration](../flood/README.md),
which is why it lives here even though its output is not seed-repo data. That also
means the result has no seed-repo revision to trace back to; accepted for now, since
the previous PCODEs stay in Git history and drought is still provisional.

Only ETH and UGA are configured. The other drought countries use an empty
`placeCodes` array, meaning national scope, so boundary changes do not affect them.

Unlike stations, region footprints are large and adjacent, so new areas can straddle
two of them. Each new area is assigned to the region overlapping it most.

```bash
cd data
uv run python -m data_management.seed_data_management.drought.migrate_drought_region_area_mapping \
  --old-seed-repo /tmp/ibf-seed-old-main \
  --new-seed-repo /path/to/IBF-seed-data \
  --old-seed-revision <sha> \
  --output-directory /tmp/ibf-drought-migration
```
