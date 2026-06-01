# Placeholder data for developing and testing the pipeline infra end-to-end.
# Structure approximates real sources but values are synthetic. Will be replaced
# by actual data loaders (blob, url, local) in a future phase.

from pipelines.infra.data_types.data_config_types import DataSource

DUMMY_DATA: dict[DataSource, object] = {
    DataSource.TODO_ECMWF_FORECAST: {
        # In reality a raster (GRIB/NetCDF) per ensemble member per month.
        # Represented here as nested dict: month -> ensemble_member -> cell grid
        # of rainfall anomaly (mm/month).
        "months": {
            "2026-03": {
                f"member-{m}": {
                    "cell-0-0": 45.0 + m * 0.5,
                    "cell-0-1": 42.0 + m * 0.3,
                    "cell-1-0": 60.0 + m * 0.8,
                    "cell-1-1": 55.0 + m * 0.6,
                }
                for m in range(1, 51)
            },
            "2026-04": {
                f"member-{m}": {
                    "cell-0-0": 50.0 + m * 0.4,
                    "cell-0-1": 48.0 + m * 0.2,
                    "cell-1-0": 65.0 + m * 0.7,
                    "cell-1-1": 58.0 + m * 0.5,
                }
                for m in range(1, 51)
            },
            "2026-05": {
                f"member-{m}": {
                    "cell-0-0": 55.0 + m * 0.3,
                    "cell-0-1": 52.0 + m * 0.1,
                    "cell-1-0": 70.0 + m * 0.6,
                    "cell-1-1": 62.0 + m * 0.4,
                }
                for m in range(1, 51)
            },
        },
        "metadata": {
            "crs": "EPSG:4326",
            "resolution": 0.01,
            "nodata": -9999,
            "unit": "mm/month",
        },
    },
}
