from datetime import datetime
from pipelines.core.secrets import Secrets
from pipelines.core.settings import Settings
from pipelines.core.logger import logger
from pipelines.riverflood.data import RiverFloodDataSets
from pipelines.riverflood.extract import Extract
from pipelines.riverflood.forecast import Forecast
from pipelines.riverflood.load import RiverFloodLoad


class Pipeline:
    """River flood data pipeline"""

    def __init__(self, settings: Settings, secrets: Secrets, country: str, hazard: str):
        logger.info(f"Initializing {hazard} pipeline for {country}")

        self.settings = settings
        if country not in [c["name"] for c in self.settings.get_setting("countries")]:
            raise ValueError(f"No config found for country {country}")
        self.country = country
        self.hazard = hazard

        # Initialize empty data sets
        self.data = RiverFloodDataSets(
            country=country, hazard=hazard, settings=settings, secrets=secrets
        )

        # Initialize data loaders
        self.load = RiverFloodLoad(
            country=country,
            hazard=hazard,
            settings=settings,
            secrets=secrets,
            data=self.data,
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
        debug: bool = False,  # fast extraction on yesterday's data, using only one ensemble member
    ):
        """Run the flood pipeline"""

        if prepare:
            self.extract.prepare_glofas_data(country=self.country, debug=debug)

        if forecast:
            self.extract.extract_glofas_data(country=self.country, debug=debug)
            self.forecast.compute_forecast_admin()
            self.forecast.compute_forecast_station()

        if send:
            upload_time = datetime.now()
            upload_time_format = self.settings.get_setting("upload_time_format")
            upload_time_str = upload_time.strftime(upload_time_format)
            upload_time_file_name_format = self.settings.get_setting(
                "upload_time_file_name_format"
            )
            upload_time_file_name = upload_time.strftime(upload_time_file_name_format)

            self.load.send_to_ibf_api(
                flood_extent=self.forecast.flood_extent_raster,
                upload_time=upload_time_str,
            )

            blob_path = f"{upload_time_file_name}-{self.country}-{self.hazard}"
            self.load.send_to_blob_storage(blob_path)
