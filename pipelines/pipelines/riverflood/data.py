from datetime import datetime
from typing import List, TypedDict
from pipelines.core.settings import Settings
from pipelines.core.data import (
    AdminDataUnit,
    RegionDataUnit,
    AdminDataSet,
    RegionDataSet,
    DataSets,
)


class StationDataUnit(RegionDataUnit):
    """Base class for GloFAS station data units"""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.lat: float = kwargs.get("lat")
        self.lon: float = kwargs.get("lon")


class DischargeDataUnit(AdminDataUnit):
    """River discharge data unit"""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.discharge_ensemble: List[float] = kwargs.get("discharge_ensemble", None)
        self.discharge_mean: float = kwargs.get("discharge_mean", None)
        if hasattr(self.discharge_ensemble, "__iter__"):
            self.compute_mean()

    def compute_mean(self):
        """Compute mean river discharge"""
        self.discharge_mean = sum(self.discharge_ensemble) / len(
            self.discharge_ensemble
        )


class DischargeStationDataUnit(StationDataUnit):
    """River discharge data unit - station"""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.discharge_ensemble: List[float] = kwargs.get("discharge_ensemble", None)
        self.discharge_mean: float = kwargs.get("discharge_mean", None)
        if hasattr(self.discharge_ensemble, "__iter__"):
            self.compute_mean()

    def compute_mean(self):
        """Compute mean river discharge"""
        self.discharge_mean = sum(self.discharge_ensemble) / len(
            self.discharge_ensemble
        )


class FloodForecast(TypedDict):
    return_period: float
    likelihood: float


class ForecastDataUnit(AdminDataUnit):
    """Flood forecast data unit"""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.forecasts: List[FloodForecast] = kwargs.get("forecasts", None)
        self.pop_affected: int = kwargs.get("pop_affected", 0)  # population affected
        self.pop_affected_perc: float = kwargs.get(
            "pop_affected_perc", 0.0
        )  # population affected (%)
        self.triggered: bool = kwargs.get("triggered", None)  # triggered or not
        self.return_period: float = kwargs.get("return_period", None)  # return period
        self.alert_class: str = kwargs.get("alert_class", None)  # alert class


class ForecastStationDataUnit(StationDataUnit):
    """Flood forecast data unit - station"""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.forecasts: List[FloodForecast] = kwargs.get("forecasts", None)
        self.triggered: bool = kwargs.get("triggered", None)  # triggered or not
        self.return_period: float = kwargs.get("return_period", None)  # return period
        self.alert_class: str = kwargs.get("alert_class", None)  # alert class


class Threshold(TypedDict):
    return_period: float
    threshold_value: float


class ThresholdDataUnit(AdminDataUnit):
    """Trigger/alert threshold data unit"""

    def __init__(self, thresholds: List[Threshold], **kwargs):
        super().__init__(**kwargs)
        self.thresholds: List[Threshold] = thresholds

    def get_threshold(self, return_period: float) -> Threshold:
        """Get trigger threshold by return period"""
        threshold = next(
            filter(
                lambda x: x.get("return_period") == return_period,
                self.thresholds,
            ),
            None,
        )
        if not threshold:
            raise ValueError(f"Return period {return_period} not found")
        else:
            return threshold["threshold_value"]


class ThresholdStationDataUnit(StationDataUnit):
    """Trigger/alert threshold data unit - station"""

    def __init__(self, thresholds: List[Threshold], **kwargs):
        super().__init__(**kwargs)
        self.thresholds: List[Threshold] = thresholds

    def get_threshold(self, return_period: float) -> Threshold:
        """Get trigger threshold by return period"""
        threshold = next(
            filter(
                lambda x: x.get("return_period") == return_period,
                self.thresholds,
            ),
            None,
        )
        if not threshold:
            raise ValueError(f"Return period {return_period} not found")
        else:
            return threshold["threshold_value"]


class RiverFloodDataSets(DataSets):
    """Datasets used by the river flood pipeline"""

    def __init__(self, country: str, settings: Settings):
        super().__init__(country)
        self.discharge_admin = AdminDataSet(
            country=self.country,
            timestamp=datetime.today(),
            adm_levels=settings.get_country_setting(country, "admin-levels"),
        )
        self.discharge_station = RegionDataSet(
            country=self.country, timestamp=datetime.today()
        )
        self.forecast_admin = AdminDataSet(
            country=self.country,
            timestamp=datetime.today(),
            adm_levels=settings.get_country_setting(country, "admin-levels"),
        )
        self.forecast_station = RegionDataSet(
            country=self.country, timestamp=datetime.today()
        )
        self.threshold_admin = AdminDataSet(
            country=self.country,
            timestamp=datetime.today(),
            adm_levels=settings.get_country_setting(country, "admin-levels"),
        )
        self.threshold_station = RegionDataSet(
            country=self.country, timestamp=datetime.today()
        )
