from datetime import datetime

import geopandas as gpd
from pipelines.legacy.core.logger import logger
from pipelines.legacy.core.secrets import Secrets
from pipelines.legacy.core.settings import Settings
from pipelines.legacy.drought.data import DroughtDataSets
from pipelines.legacy.drought.extract import Extract
from pipelines.legacy.drought.forecast import Forecast
from pipelines.legacy.drought.load import DroughtLoad


class Pipeline:
    """Drought data pipeline"""

    def __init__(
        self,
        settings: Settings,
        secrets: Secrets,
        country: str,
        hazard: str,
        no_cache: bool,
    ):
        logger.info(f"Initializing {hazard} pipeline for {country}")

        self.settings = settings
        if country not in [c["name"] for c in self.settings.get_setting("countries")]:
            raise ValueError(f"No config found for country {country}")
        self.country = country
        self.hazard = hazard

        # Initialize empty data sets
        self.data = DroughtDataSets(
            country=country, hazard=hazard, settings=settings, secrets=secrets
        )

        # Initialize data loaders
        self.load = DroughtLoad(
            country=country,
            hazard=hazard,
            settings=settings,
            secrets=secrets,
            data=self.data,
            no_cache=no_cache,
        )

        # Initialize pipeline modules
        self.extract = Extract(
            country=country,
            settings=settings,
            secrets=secrets,
            load=self.load,
        )
        self.forecast = Forecast(
            country=country,
            settings=settings,
            secrets=secrets,
            load=self.load,
        )

    def run(
        self,
        prepare: bool = True,
        forecast: bool = True,
        send: bool = True,
        debug: bool = False,
        datestart: datetime = datetime.now(),
    ):
        """Run the drought pipeline"""

        # This is meant as a fix for the test_pipeline_drought_eth test being flaky on CI
        gpd.options.io_engine = "fiona"

        if prepare:
            self.extract.prepare_ecmwf_data(
                country=self.country, debug=debug, datestart=datestart
            )

        if forecast:
            self.extract.extract_ecmwf_data(
                country=self.country, debug=debug, datestart=datestart
            )
            self.forecast.compute_forecast(debug=debug, datestart=datestart)

        if send:
            self.load.send_to_ibf_api(
                forecast_data=self.data.forecast_admin,
                threshold_climateregion=self.data.threshold_climateregion,
                forecast_climateregion=self.data.forecast_climateregion,
                drought_extent=self.forecast.drought_extent_raster,
                upload_time=datestart,
            )
