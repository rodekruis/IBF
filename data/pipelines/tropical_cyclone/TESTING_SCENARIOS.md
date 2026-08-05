# Tropical Cyclone — Testing Real Storm Scenarios

**TODO: delete this document once these scenarios have been tested.**

## Introduction

This document gives step-by-step instructions to run the tropical-cyclone pipeline locally
against three real historical storms, using the fixtures in the shared `bronze/` folder
(OneDrive). Each scenario produces a specific, verifiable result.

## 1. Prerequisites

- Backend running: `npm run start:services:detach` from the repo root.
- PHL seeded in the database (via the `api/instance/reset` endpoint in Swagger,
  <http://localhost:4000/docs>, if not already done).
- The shared `bronze/` folder placed at
  `data/pipelines/tropical_cyclone/bronze/` in your local checkout, so that
  `data/pipelines/tropical_cyclone/bronze/gefs_wind/` and
  `data/pipelines/tropical_cyclone/bronze/gefs_track/` both exist with the cycle subfolders
  inside them (e.g. `gefs_wind/gefs.20250918/12/...`).

## 2. One-time local code change (do not commit)

`tropicalCyclone.yaml` has no `source_target`-tagged data source yet, so a real run needs one
local-only change. Open `data/pipelines/infra/config_reader.py` and in `_parse_countries`,
change:

```python
from pipelines.infra.utils.nrw_logger import log_error, LogTag
```

to:

```python
from pipelines.infra.utils.nrw_logger import log_error, log_warning, LogTag
```

Then find this block:

```python
                log_error(
                    logger,
                    LogTag.INFRA,
                    f"No forecast data source configured for source target"
                    f" '{self.source_target}' for country '{iso_3_code}'",
                )
                success = False
                continue
```

and replace it with:

```python
                log_warning(
                    logger,
                    LogTag.INFRA,
                    f"LOCAL-ONLY WORKAROUND, DO NOT COMMIT: No forecast data source configured"
                    f" for source target '{self.source_target}' for country '{iso_3_code}'",
                )
```

Do not commit this file with the change applied. Revert it (`git checkout data/pipelines/infra/config_reader.py`)
once you're done testing.

## 3. Selecting which storm cycle runs

The pipeline always loads the most recently dated cycle folder found under `gefs_wind/` and
`gefs_track/` (folders are named `gefs.<YYYYMMDD>`). To run a specific scenario, rename every
cycle folder dated **after** the one you want, in **both** `gefs_wind/` and `gefs_track/`, by
prefixing it with `_setaside_`. This hides it from selection without deleting it. Reverse the
rename afterward to restore normal behavior.

All commands below assume you're in `data/pipelines/tropical_cyclone/bronze/`.

## 4. Running the pipeline

From the `data/` directory:

```bash
uv run pipeline --config pipelines/infra/configs/tropicalCyclone.yaml --country PHL --mock 1 --output-mode local
```

Output is written to `data/pipelines/output/tropicalCyclone/PHL/<timestamp>/forecast.json`. Use
the most recently created file. Check the `alerts` array: its length, each alert's `eventName`,
the `severity` entries where `"ensembleMemberType": "median"`, and the total of
`exposure.adminAreas[].value`.

---

## Scenario A — Ragasa/Nando, WP24/2025 (produces an alert)

**Set aside newer cycles:**

```bash
cd data/pipelines/tropical_cyclone/bronze
for cycle in gefs.20260710 gefs.20260711 gefs.20260724; do
  mv "gefs_wind/$cycle" "gefs_wind/_setaside_$cycle"
  mv "gefs_track/$cycle" "gefs_track/_setaside_$cycle"
done
```

**Run** (Section 4 command).

**Expected result:**

- 1 alert, `eventName: "WP24_2025"`
- Centroid: `latitude: 20.503`, `longitude: 121.574`
- Median severities: `38.57`, `41.46`, `45.69` m/s (3 buckets)
- Total population exposed: `22059`

**Restore:**

```bash
cd data/pipelines/tropical_cyclone/bronze
for cycle in gefs.20260710 gefs.20260711 gefs.20260724; do
  mv "gefs_wind/_setaside_$cycle" "gefs_wind/$cycle"
  mv "gefs_track/_setaside_$cycle" "gefs_track/$cycle"
done
```

---

## Scenario B — Krathon/Julian, WP20/2024 (produces an alert)

**Set aside newer cycles:**

```bash
cd data/pipelines/tropical_cyclone/bronze
for cycle in gefs.20250918 gefs.20260710 gefs.20260711 gefs.20260724; do
  mv "gefs_wind/$cycle" "gefs_wind/_setaside_$cycle"
  mv "gefs_track/$cycle" "gefs_track/_setaside_$cycle"
done
```

**Run** (Section 4 command).

**Expected result:**

- 1 alert, `eventName: "WP20_2024"`
- Centroid: `latitude: 20.635`, `longitude: 121.858`
- Median severities: `38.67`, `33.75`, `37.33`, `41.22`, `41.32`, `41.96`, `37.15` m/s (7 buckets)
- Total population exposed: `60090`

**Restore:**

```bash
cd data/pipelines/tropical_cyclone/bronze
for cycle in gefs.20250918 gefs.20260710 gefs.20260711 gefs.20260724; do
  mv "gefs_wind/_setaside_$cycle" "gefs_wind/$cycle"
  mv "gefs_track/_setaside_$cycle" "gefs_track/$cycle"
done
```

---

## Scenario C — WP03/2021 (no alert)

**Set aside newer cycles:**

```bash
cd data/pipelines/tropical_cyclone/bronze
for cycle in gefs.20240929 gefs.20250918 gefs.20260710 gefs.20260711 gefs.20260724; do
  mv "gefs_wind/$cycle" "gefs_wind/_setaside_$cycle"
  mv "gefs_track/$cycle" "gefs_track/_setaside_$cycle"
done
```

**Run** (Section 4 command).

**Expected result:**

- 0 alerts (empty `alerts` array in `forecast.json`)
- Log line: `No tropical-cyclone alert for 'PHL' from storm 'WP03_2021' (National): no bucket cleared MIN_SEVERITY_MS=33.0`

**Restore:**

```bash
cd data/pipelines/tropical_cyclone/bronze
for cycle in gefs.20240929 gefs.20250918 gefs.20260710 gefs.20260711 gefs.20260724; do
  mv "gefs_wind/_setaside_$cycle" "gefs_wind/$cycle"
  mv "gefs_track/_setaside_$cycle" "gefs_track/$cycle"
done
```

---

## 5. Cleanup

1. Confirm `gefs_wind/` and `gefs_track/` each list `gefs.20210512`, `gefs.20240929`,
   `gefs.20250918`, `gefs.20260710`, `gefs.20260711`, `gefs.20260724` with no `_setaside_` prefix
   (run the relevant "Restore" block above for whichever scenario you last ran).
2. Revert the local code change from Section 2: `git checkout data/pipelines/infra/config_reader.py`.
3. Delete this document.
