from __future__ import annotations

from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.models import Centroid


def calculate_flood_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
) -> None:
    # TEMPLATE CODE — This function currently hardcodes DataSubmitter calls to
    # demonstrate the expected output contract. It does NOT read from
    # data_provider or process the dummy data defined in DataProvider.
    #
    # The dummy data in DataProvider is not only synthetic in values but also
    # minimal in extent: only 2 stations, 2 ensemble members instead of ~50,
    # a handful of admin areas, and a simplified population raster. Real data
    # will be much larger across all dimensions.
    #
    # To implement real flood logic, replace the hardcoded values below with
    # calculation and transformation methods that:
    # 1. Read GloFAS discharge data from data_provider.get_data("glofas_discharge")
    # 2. Loop over stations from data_provider.get_data("glofas_stations")
    # 3. Compute severity and exposure per station/lead time
    # 4. Submit results via data_submitter (create_alert, add_timeseries_data, etc.)

    _build_station_a_alert(data_submitter, country)
    _build_station_b_alert(data_submitter, country)


def _build_station_a_alert(data_submitter: DataSubmitter, country: str) -> None:
    alert_id = f"{country}_floods_glofas-station-A"
    data_submitter.create_alert(
        alert_id=alert_id,
        hazard_type=["floods"],
        centroid=Centroid(latitude=0.35, longitude=32.60),
        issued_at="2026-03-18T12:00:00Z",
        forecast_sources=["glofas"],
    )

    lead_times = [
        ("2026-03-20T00:00:00Z", "2026-03-20T23:59:59Z"),
        ("2026-03-21T00:00:00Z", "2026-03-21T23:59:59Z"),
    ]
    for start, end in lead_times:
        for member, value in [("member-1", 100), ("member-N", 150), ("median", 120)]:
            data_submitter.add_timeseries_data(
                alert_id=alert_id,
                lead_time_start=start,
                lead_time_end=end,
                ensemble_member=member,
                severity_key="water_discharge",
                severity_value=value,
            )

    data_submitter.add_admin_area_exposure(
        alert_id=alert_id,
        place_code="place-code-1",
        layer="spatial_extent",
        value=True,
    )
    data_submitter.add_admin_area_exposure(
        alert_id=alert_id,
        place_code="place-code-1",
        layer="population_exposed",
        value=5000,
    )

    data_submitter.add_geo_feature_exposure(
        alert_id=alert_id,
        geo_feature_id="hospital-1",
        layer="hospitals",
        value={"exposed": True},
    )
    data_submitter.add_geo_feature_exposure(
        alert_id=alert_id,
        geo_feature_id="road-1",
        layer="roads",
        value={"exposed": True},
    )
    data_submitter.add_geo_feature_exposure(
        alert_id=alert_id,
        geo_feature_id="glofas-station-A",
        layer="glofas_stations",
        value={"water_discharge": 150, "return_period": "10-year"},
    )

    data_submitter.add_raster_exposure(
        alert_id=alert_id,
        layer="flood_extent",
        value="flood_extent_raster.tif",
        extent={"xmin": 32.0, "ymin": 0.0, "xmax": 33.0, "ymax": 1.0},
    )


def _build_station_b_alert(data_submitter: DataSubmitter, country: str) -> None:
    alert_id = f"{country}_floods_glofas-station-B"
    data_submitter.create_alert(
        alert_id=alert_id,
        hazard_type=["floods"],
        centroid=Centroid(latitude=1.50, longitude=33.00),
        issued_at="2026-03-18T12:00:00Z",
        forecast_sources=["glofas"],
    )

    for member, value in [("member-1", 60), ("member-N", 90), ("median", 75)]:
        data_submitter.add_timeseries_data(
            alert_id=alert_id,
            lead_time_start="2026-03-20T00:00:00Z",
            lead_time_end="2026-03-20T23:59:59Z",
            ensemble_member=member,
            severity_key="water_discharge",
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
        value=3500,
    )

    data_submitter.add_geo_feature_exposure(
        alert_id=alert_id,
        geo_feature_id="glofas-station-B",
        layer="glofas_stations",
        value={"water_discharge": 90, "return_period": "5-year"},
    )

    data_submitter.add_raster_exposure(
        alert_id=alert_id,
        layer="flood_extent",
        value="flood_extent_raster_b.tif",
        extent={"xmin": 32.5, "ymin": 1.0, "xmax": 33.5, "ymax": 2.0},
    )
