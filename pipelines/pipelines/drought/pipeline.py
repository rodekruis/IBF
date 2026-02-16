import json
import logging
from datetime import date, datetime, timedelta

from pipelines.core.secrets import Secrets
from pipelines.core.settings import Settings
from pipelines.drought.data import DroughtDataSets
from pipelines.drought.extract import Extract
from pipelines.drought.forecast import Forecast
from pipelines.drought.load import DroughtLoad

logger = logging.getLogger()
logging.basicConfig(format="%(levelname)s: %(message)s", level=logging.INFO)
logging.getLogger("requests").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("azure").setLevel(logging.WARNING)
logging.getLogger("requests_oauthlib").setLevel(logging.WARNING)


class Pipeline:
    """Drought data pipeline"""

    def __init__(self, settings: Settings, secrets: Secrets, country: str):
        self.settings = settings
        if country not in [c["name"] for c in self.settings.get_setting("countries")]:
            raise ValueError(f"No config found for country {country}")
        self.country = country

        # Initialize empty data sets
        self.data = DroughtDataSets(country=country, settings=settings, secrets=secrets)

        # Initialize pipeline modules
        self.load = DroughtLoad(
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
        self.data.threshold_climateregion = self.load.get_pipeline_data(
            data_type="climate-region", country=self.country
        )

    def run(
        self,
        prepare: bool = True,
        forecast: bool = True,
        send: bool = True,
        debug: bool = False,  # debug mode with specific datestart of data
        datestart: datetime = date.today(),
    ):
        """Run the drought pipeline"""

        if prepare:
            logging.info("prepare ecmwf data")
            self.extract.prepare_ecmwf_data(
                country=self.country, debug=debug, datestart=datestart
            )

        if forecast:
            logging.info(f"extract ecmwf data")
            self.extract.extract_ecmwf_data(
                country=self.country, debug=debug, datestart=datestart
            )
            logging.info("forecast drought")
            self.forecast.compute_forecast(debug=debug, datestart=datestart)

        if send:
            logging.info("send data to IBF API")
            self.load.send_to_ibf_api(
                forecast_data=self.data.forecast_admin,
                threshold_climateregion=self.data.threshold_climateregion,
                forecast_climateregion=self.data.forecast_climateregion,
                drought_extent=self.forecast.drought_extent_raster,
                upload_time=datestart,
            )
