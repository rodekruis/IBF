from datetime import datetime
from pipelines.core.settings import Settings
from pipelines.core.data import (
    AdminDataUnit,
    AdminDataSet,
    RegionDataUnit,
    RegionDataSet,
)


class ForecastAdminDataUnit(AdminDataUnit):
    """Drought forecast for admin area"""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.forecast: list = kwargs.get("forecast", None)
        self.triggered: bool = kwargs.get("triggered", None)
        self.alert_class: str = kwargs.get("alert_class", None)


class ForecastRegionDataUnit(RegionDataUnit):
    """Drought forecast for climate region"""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Expecting forecasts as a dictionary with 'tercile_lower', 'tercile_upper', and 'forecast' keys
        self.tercile_lower: float = kwargs.get("tercile_lower", None)
        self.tercile_upper: float = kwargs.get("tercile_upper", None)
        self.forecast: list = kwargs.get("forecast", None)
        self.season: str = kwargs.get("season", None)
        self.pop_affected: int = kwargs.get("pop_affected", 0)
        self.pop_affected_perc: float = kwargs.get("pop_affected_perc", 0.0)
        self.triggered: bool = kwargs.get("triggered", None)
        self.likelihood: float = kwargs.get("likelihood", None)
        self.return_period: float = kwargs.get("return_period", None)
        self.alert_class: str = kwargs.get("alert_class", None)


class DroughtDataSets:
    """Collection of datasets used by the pipeline"""

    def __init__(
        self, country: str, settings: Settings, datetime: datetime = datetime.today()
    ):
        self.country = country

        self.rainfall_climateregion = RegionDataSet(
            country=self.country,
            timestamp=datetime,
            adm_levels=settings.get_country_setting(country, "admin-levels"),
        )

        self.forecast_climateregion = RegionDataSet(
            country=self.country,
            timestamp=datetime,
            adm_levels=settings.get_country_setting(country, "admin-levels"),
        )

        self.forecast_admin = AdminDataSet(
            country=self.country,
            timestamp=datetime,
            adm_levels=settings.get_country_setting(country, "admin-levels"),
        )

        self.threshold_climateregion = RegionDataSet(
            country=self.country, timestamp=datetime
        )
