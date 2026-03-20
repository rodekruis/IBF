from __future__ import annotations

from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.models import Centroid


def calculate_drought_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
) -> None:
    # TEMPLATE CODE — This function currently hardcodes DataSubmitter calls to
    # demonstrate the expected output contract. It does NOT read from
    # data_provider or process the dummy data defined in DataProvider.
    #
    # The dummy data in DataProvider is not only synthetic in values but also
    # minimal in extent: only 2 climate regions, 2 ensemble members instead of
    # ~50, a handful of admin areas and raster cells, and a simplified
    # population raster. Real data will be much larger across all dimensions.
    #
    # To implement real drought logic, replace the hardcoded values below with
    # calculation and transformation methods that:
    # 1. Read ECMWF forecast rasters from data_provider.get_data("ecmwf_forecast")
    # 2. Loop over climate regions from data_provider.get_data("climate_regions")
    # 3. Within each region, loop over applicable seasons
    # 4. Compute percentile (severity measure) and exposure per region/season
    # 5. Submit results via data_submitter (create_alert, add_timeseries_data, etc.)

    alert_id = f"{country}_drought_climate-region-B_season-MAM"
    data_submitter.create_alert(
        alert_id=alert_id,
        hazard_type=["drought"],
        centroid=Centroid(latitude=1.50, longitude=33.00),
        issued_at="2026-03-18T12:00:00Z",
        forecast_sources=["ECMWF"],
    )

    for member, value in [("member-1", 30), ("member-N", 50), ("median", 40)]:
        data_submitter.add_timeseries_data(
            alert_id=alert_id,
            lead_time_start="2026-03-01T00:00:00Z",
            lead_time_end="2026-05-31T23:59:59Z",
            ensemble_member=member,
            severity_key="percentile",
            severity_value=value,
        )

    data_submitter.add_admin_area_exposure(
        alert_id=alert_id,
        place_code="place-code-2",
        layer="spatial_extent",
        value=True,
    )
    data_submitter.add_admin_area_exposure(
        alert_id=alert_id,
        place_code="place-code-2",
        layer="population_exposed",
        value=10000,
    )

    data_submitter.add_geo_feature_exposure(
        alert_id=alert_id,
        geo_feature_id="school-1",
        layer="schools",
        value={"exposed": True},
    )
    data_submitter.add_geo_feature_exposure(
        alert_id=alert_id,
        geo_feature_id="road-2",
        layer="roads",
        value={"exposed": True},
    )

    data_submitter.add_raster_exposure(
        alert_id=alert_id,
        layer="drought_extent",
        value="drought_extent_raster.tif",
        extent={"xmin": 32.5, "ymin": 1.0, "xmax": 33.5, "ymax": 2.0},
    )
