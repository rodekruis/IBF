from pipelines.core.secrets import Secrets
from pipelines.core.settings import Settings
from pipelines.core.logger import logger
from pipelines.riverflood.data import RiverFloodDataSets
from pipelines.riverflood.extract import Extract
from pipelines.riverflood.forecast import Forecast
from pipelines.riverflood.load import RiverFloodLoad


class Pipeline:
    """River flood data pipeline"""

    def __init__(self, settings: Settings, secrets: Secrets, country: str):
        logger.info(f"Initializing river flood pipeline for {country}")

        self.settings = settings
        if country not in [c["name"] for c in self.settings.get_setting("countries")]:
            raise ValueError(f"No config found for country {country}")
        self.country = country

        # Initialize empty data sets
        self.data = RiverFloodDataSets(
            country=country, settings=settings, secrets=secrets
        )

        # Initialize pipeline modules
        self.load = RiverFloodLoad(
            country=country, settings=settings, secrets=secrets, data=self.data
        )
        self.extract = Extract(
            country=country,
            settings=settings,
            secrets=secrets,
            data=self.data,
        )
        self.forecast = Forecast(
            country=country,
            settings=settings,
            secrets=secrets,
            data=self.data,
        )

        # Load thresholds
        self.data.threshold_admin = self.load.get_thresholds_admin()
        self.data.threshold_station = self.load.get_thresholds_station()

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
            self.load.send_to_ibf_api(
                flood_extent=self.forecast.flood_extent_raster,
            )
