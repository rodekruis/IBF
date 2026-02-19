import os
import logging
import warnings
from datetime import datetime
from typing import List

import numpy as np
import pandas as pd
import rasterio
import rioxarray
from pipelines.drought.module import DroughtModule
from pipelines.drought.data import ForecastAdminDataUnit, ForecastRegionDataUnit
from pipelines.drought.utils import replace_year_month
from rasterio.features import shapes
from rasterio.mask import mask
from rasterio.merge import merge
from rasterstats import zonal_stats
from shapely import Polygon
from shapely.geometry import shape

warnings.simplefilter("ignore", category=RuntimeWarning)


def clip_raster(
    raster_file_path: str, shapes: List[Polygon], invert: bool = False
) -> tuple:
    """Clip raster with a list of polygons, return the clipped raster and its metadata"""
    crop = True if not invert else False
    with rasterio.open(raster_file_path) as src:
        outImage, out_transform = mask(src, shapes, crop=crop, invert=invert)
        outMeta = src.meta.copy()
    outMeta.update(
        {
            "driver": "GTiff",
            "height": outImage.shape[1],
            "width": outImage.shape[2],
            "transform": out_transform,
            "compress": "lzw",
        }
    )
    return outImage, outMeta


def classify_alert(
    triggered: bool,
    likelihood: float,
    classify_alert_on: str,
    alert_on_minimum_probability,
) -> str:
    """
    Classify alert based on configuration:
    - 'probability': Classify based on minimum probability thresholds.
    - 'disable': Classify based on triggered flag and highest probability threshold.
    """
    alert_class = "no"

    if classify_alert_on == "probability":
        if not isinstance(alert_on_minimum_probability, dict):
            raise ValueError(
                "For classification by probability, 'alert_on_minimum_probability' must be a dictionary."
            )

        # Sort probabilities from smallest to largest
        sorted_probabilities = dict(
            sorted(alert_on_minimum_probability.items(), key=lambda item: item[1])
        )

        # Determine alert class based on probability thresholds
        probability = likelihood  # _per_return_period.get(alert_on_return_period)
        if probability is None:
            raise ValueError("likelihood data missing .")

        for class_, min_probability in sorted_probabilities.items():
            if probability >= min_probability:
                alert_class = class_

    elif classify_alert_on == "disable":
        if triggered and isinstance(alert_on_minimum_probability, dict):
            # Return the class with the highest minimum probability
            alert_class = max(
                alert_on_minimum_probability, key=alert_on_minimum_probability.get
            )

    else:
        raise ValueError(
            "Invalid value for 'classify_alert_on'. Expected 'probability' or 'disable'."
        )

    return alert_class


class Forecast(DroughtModule):
    """
    Forecast flood events based on river discharge data
    """

    def __init__(self, **kwargs):
        super().__init__(
            settings_to_check=[],
            secrets_to_check=[],
            **kwargs,
        )
        self.pop_raster: str = os.path.join(
            self.data.input_dir, "population_density.tif"
        )
        self.drought_extent_raster: str = os.path.join(
            self.data.output_dir, "rainfall_forecast.tif"
        )  # 'rainfall_forecast_0-month changed to drought_extent_raster
        self.aff_pop_raster: str = os.path.join(
            self.data.output_dir, "affected_population.tif"
        )

    def compute_forecast(
        self, debug: bool = False, datestart: datetime = datetime.today()
    ):
        """
        Forecast drought per climate region based on different models for now ecmwf seasonal rainfall forecast is implmented
        1. determine if trigger level is reached, with which probability, and alert class
        2. compute drought extent
        3. compute people affected
        """
        logging.info("computing forecast")
        self.__compute_triggers(debug=debug, datestart=datestart)
        if any([x.triggered for x in self.data.forecast_admin.data_units]):
            self.__compute_affected_pop()

    def __compute_triggers(
        self, debug: bool = False, datestart: datetime = datetime.today()
    ):
        """Determine if trigger level is reached, its probability, and the alert class"""

        current_year = datestart.year
        current_month = datestart.month
        data_timestamp = replace_year_month(datetime.now(), current_year, current_month)

        country = self.data.threshold_climateregion.country
        trigger_on_minimum_probability = self.settings.get_country_setting(
            country, "trigger_model"
        )["trigger-on-minimum-probability"]
        trigger_on_minimum_admin_area_in_drought_extent = (
            self.settings.get_country_setting(country, "trigger_model")[
                "trigger-on-minimum-admin-area-in-drought-extent"
            ]
        )

        # remove this line if we are uploading for mulltiple triggers
        if debug:
            scenario = os.getenv(
                "SCENARIO", "Forecast"
            )  # TODO: pull scenario debug to a proper scenario script
            if scenario == "Warning":
                trigger_on_minimum_probability = 0.01
            elif scenario == "NoWarning":
                trigger_on_minimum_probability = 0.99

        classify_alert_on = self.settings.get_country_setting(
            country, "classify-alert-on"
        )
        alert_on_minimum_probability = self.settings.get_country_setting(
            country, "alert-on-minimum-probability"
        )

        climate_regions = {}
        current_month = datetime.today().strftime(
            "%b"
        )  # 'Feb' for February check if this can be passed from settings climate_regions should come form settings file
        admin_levels = self.settings.get_country_setting(country, "admin-levels")
        """
        for entry in self.settings.get_country_setting(country,"Climate_Region"):

            climateRegionCode=entry['climate-region-code']
            for key, value in entry['leadtime'][current_month][0].items():
                if climateRegionCode is not None:
                    climate_regions[climateRegionCode] = {
                            'climateregionname': entry['name'],
                            'season': key,
                            'leadtime': int(value.split('-')[0])}
                else:
                    raise ValueError("climate region not defined in config file ")
        """

        for climateregion in self.data.threshold_climateregion.get_ids():
            for lead_time in range(0, 6):
                pcodes = self.data.threshold_climateregion.get_data_unit(
                    _id=climateregion
                ).pcodes
                output_file = os.path.join(
                    self.data.output_dir,
                    f"rlower_tercile_probability_{lead_time}-month_{country}.tif",
                )

                # Open the TIF file as an xarray object
                rlower_tercile_probability = rioxarray.open_rasterio(output_file)
                for adm_level in admin_levels:
                    climateRegionPcodes = pcodes[f"{adm_level}"]
                    admin_boundary = self.load.get_adm_boundaries(adm_level)
                    climate_data_unit = self.data.rainfall_climateregion.get_data_unit(
                        climateregion, lead_time
                    )
                    tercile_lower = climate_data_unit.tercile_lower
                    likelihood = climate_data_unit.likelihood
                    triggered = climate_data_unit.triggered
                    forecast = climate_data_unit.forecast
                    tercile_upper = climate_data_unit.tercile_upper

                    if isinstance(triggered, tuple):
                        triggered = triggered[
                            0
                        ]  # unpack tuple to boolean not sure why this is a tuple

                    alert_class = classify_alert(
                        triggered,
                        likelihood,
                        classify_alert_on,
                        alert_on_minimum_probability,
                    )
                    self.data.forecast_climateregion.timestamp = data_timestamp
                    self.data.forecast_climateregion.upsert_data_unit(
                        ForecastRegionDataUnit(
                            _id=climateregion,
                            name=climate_data_unit.name,
                            lead_time=lead_time,  ########## check this
                            triggered=triggered,
                            alert_class=alert_class,
                            likelihood=likelihood,
                            tercile_lower=tercile_lower,
                            forecast=forecast,
                            tercile_upper=tercile_upper,
                        )
                    )

                    for pcode in climateRegionPcodes:
                        gdf1 = admin_boundary.query(f"adm{adm_level}_pcode == @pcode")
                        clipped_regional_mean = rlower_tercile_probability.rio.clip(
                            gdf1.geometry, gdf1.crs, drop=True, all_touched=True
                        )
                        likelihood = round(
                            np.nanmedian(clipped_regional_mean.values), 2
                        )
                        binary_clipped_regional_mean = (
                            clipped_regional_mean > trigger_on_minimum_probability
                        ).astype(int)
                        anomalies_df = binary_clipped_regional_mean.to_dataframe(
                            name="anomaly"
                        )
                        percentage_greater_than_zero = (
                            anomalies_df.anomaly.values > 0
                        ).sum() / anomalies_df.anomaly.values.size

                        if (
                            percentage_greater_than_zero
                            > trigger_on_minimum_admin_area_in_drought_extent
                        ):
                            triggered = True
                        else:
                            triggered = False

                        alert_class_admin = classify_alert(
                            triggered,
                            likelihood,
                            classify_alert_on,
                            alert_on_minimum_probability,
                        )
                        self.data.forecast_admin.timestamp = data_timestamp
                        self.data.forecast_admin.upsert_data_unit(
                            ForecastAdminDataUnit(
                                pcode=pcode,
                                adm_level=adm_level,
                                lead_time=lead_time,  ########## check this
                                triggered=triggered,
                                alert_class=alert_class_admin,
                                forecast=forecast,
                            )
                        )

    def __compute_affected_pop_raster(self):
        """Compute affected population raster given a flood extent"""
        country = self.data.forecast_admin.country

        # get population density raster
        self.load.get_population_density(self.pop_raster)
        flood_shapes = []

        for lead_time in self.data.forecast_admin.get_lead_times():
            flood_raster_lead_time = os.path.join(
                self.data.output_dir,
                f"drought_extent_{lead_time}-month_{country}.tif",
            )
            aff_pop_raster_lead_time = self.aff_pop_raster.replace(
                ".tif", f"_{lead_time}_{country}.tif"
            )
            if os.path.exists(aff_pop_raster_lead_time):
                os.remove(aff_pop_raster_lead_time)

            with rasterio.open(flood_raster_lead_time) as dataset:
                # Read the dataset's valid data mask as a ndarray.
                image = dataset.read(1).astype(np.float32)
                image[image >= 0.5] = (
                    1  # self.settings.get_setting("minimum_for_drought_extent")] = 1
                )
                rasterio_shapes = shapes(
                    image, transform=dataset.transform
                )  # convert flood extent raster to vector (list of shapes)
                for geom, val in rasterio_shapes:
                    if (
                        val >= 0.5
                    ):  # self.settings.get_setting("minimum_for_drought_extent"):
                        flood_shapes.append(shape(geom))
            # clip population density raster with flood shapes and save the result
            if len(flood_shapes) > 0:
                affected_pop_raster, affected_pop_meta = clip_raster(
                    self.pop_raster, flood_shapes
                )
                with rasterio.open(
                    aff_pop_raster_lead_time, "w", **affected_pop_meta
                ) as dest:
                    dest.write(affected_pop_raster)

    def __compute_affected_pop(self):
        """Compute affected population given a flood extent"""

        # calculate affected population raster
        self.__compute_affected_pop_raster()
        country = self.data.threshold_climateregion.country

        # this have to be calculated per admin level
        # calculate affected population per admin division
        for adm_lvl in self.settings.get_country_setting(country, "admin-levels"):

            # get adm boundaries
            gdf_adm = self.load.get_adm_boundaries(adm_lvl)
            gdf_aff_pop, gdf_pop = pd.DataFrame(), pd.DataFrame()

            for lead_time in self.data.forecast_admin.get_lead_times():
                aff_pop_raster_lead_time = self.aff_pop_raster.replace(
                    ".tif", f"_{lead_time}_{country}.tif"
                )
                if os.path.exists(aff_pop_raster_lead_time):
                    # perform zonal statistics on affected population raster
                    with rasterio.open(aff_pop_raster_lead_time) as src:
                        raster_array = src.read(1)
                        raster_array[raster_array < 0.0] = 0.0
                        transform = src.transform

                    stats = zonal_stats(
                        gdf_adm,
                        raster_array,
                        affine=transform,
                        stats=["sum"],
                        all_touched=True,
                        nodata=0.0,
                    )
                    gdf_aff_pop = pd.concat([gdf_adm, pd.DataFrame(stats)], axis=1)
                    gdf_aff_pop.index = gdf_aff_pop[f"adm{adm_lvl}_pcode"]

                    # perform zonal statistics on population density raster (to compute % aff pop)
                    with rasterio.open(self.pop_raster) as src:
                        raster_array = src.read(1)
                        raster_array[raster_array < 0.0] = 0.0
                        transform = src.transform
                    stats = zonal_stats(
                        gdf_adm,
                        raster_array,
                        affine=transform,
                        stats=["sum"],
                        all_touched=True,
                        nodata=0.0,
                    )
                    gdf_pop = pd.concat([gdf_adm, pd.DataFrame(stats)], axis=1)
                    gdf_pop.index = gdf_pop[f"adm{adm_lvl}_pcode"]

                # add affected population to forecast data units

                for forecast_data_unit in self.data.forecast_admin.get_data_units(
                    lead_time=lead_time, adm_level=adm_lvl
                ):
                    if forecast_data_unit.triggered:
                        try:
                            pop_affected = int(
                                gdf_aff_pop.loc[forecast_data_unit.pcode, "sum"]
                            )
                        except (ValueError, TypeError, KeyError):
                            pop_affected = 0
                        forecast_data_unit.pop_affected = pop_affected
                        try:
                            forecast_data_unit.pop_affected_perc = (
                                float(
                                    pop_affected
                                    / gdf_pop.loc[forecast_data_unit.pcode, "sum"]
                                )
                                * 100.0
                            )

                        except (ValueError, TypeError, KeyError):
                            forecast_data_unit.pop_affected_perc = 0.0
