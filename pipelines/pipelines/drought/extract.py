from pipelines.core.module import Module
from pipelines.drought.data import ForecastRegionDataUnit
from pipelines.drought.utils import replace_year_month
import os
from datetime import datetime
import geopandas as gpd
import pandas as pd
import xarray as xr
from rasterstats import zonal_stats
import time
import cdsapi
from rasterio.transform import from_origin
from rasterio.crs import CRS
import rasterio
import logging
from dateutil.relativedelta import relativedelta
from calendar import monthrange
import rioxarray
import numpy as np
import warnings
from rasterio.mask import mask

warnings.simplefilter("ignore", category=RuntimeWarning)

supported_sources = ["ECMWF"]


def slice_netcdf_file(nc_file: xr.Dataset, country_bounds: list):
    """Slice the netcdf file to the bounding box"""
    min_lon = country_bounds[0]  # Minimum longitude
    max_lon = country_bounds[2]  # Maximum longitude
    min_lat = country_bounds[1]  # Minimum latitude
    max_lat = country_bounds[3]  # Maximum latitude
    var_data = nc_file.sel(lon=slice(min_lon, max_lon), lat=slice(max_lat, min_lat))
    return var_data


def convert_to_mm_per_month(hindcast, forecast):
    """
    Reads a file and returns the raster dataset converted to mm/month from m/s.
    """
    # Load hindcast dataset
    ds_hindcast = xr.open_dataset(
        hindcast,
        engine="cfgrib",
        backend_kwargs={"time_dims": ("forecastMonth", "time")},
    )
    ds_forecast = xr.open_dataset(
        forecast,
        engine="cfgrib",
        backend_kwargs={"time_dims": ("forecastMonth", "time")},
    )

    # Get the month and year from the dataset
    month = ds_hindcast.time.dt.month.values[0]
    year = ds_hindcast.time.dt.year.values[0]

    # Calculate the number of days in each forecast month
    # days_in_month = [monthrange(year, month + fcmonth - 1)[1] for fcmonth in ds_hindcast.forecastMonth.values]

    days_in_month = [
        monthrange(year, ((month + fcmonth - 1) - 1) % 12 + 1)[1]
        for fcmonth in ds_hindcast.forecastMonth.values
    ]

    # Assign the number of days as a coordinate to the dataset
    ds = ds_hindcast.assign_coords(numdays=("forecastMonth", days_in_month))
    ds2 = ds_forecast.assign_coords(numdays=("forecastMonth", days_in_month))

    # Convert the precipitation rate from m/s to mm/month
    ds = ds * ds.numdays * 24 * 60 * 60 * 1000
    ds2 = ds2 * ds2.numdays * 24 * 60 * 60 * 1000

    return ds, ds2


class Extract(Module):
    """Extract river discharge data from external sources"""

    def __init__(self, **kwargs):
        super().__init__(
            settings_to_check=[],
            secrets_to_check=[],
            **kwargs,
        )
        self.source = "ECMWF"
        self.inputPathGrid = "./data/input"
        self.outputPathGrid = "./data/output"
        if not os.path.exists(self.inputPathGrid):
            os.makedirs(self.inputPathGrid)
        if not os.path.exists(self.outputPathGrid):
            os.makedirs(self.outputPathGrid)

    def get_data(self):
        """Get river discharge data from source and return AdminDataSet"""
        if self.source not in supported_sources:
            raise ValueError(
                f"Source {self.source} is not supported, supported sources are: {supported_sources}"
            )
        if self.source == "ECMWF":
            self.prepare_ecmwf_data()
            self.extract_ecmwf_data()

    def prepare_ecmwf_data(
        self, country: str = None, debug: bool = False, datestart: datetime = None
    ):
        """
        download ecmwf data to the extent of the country
        """
        if country is None:
            country = self.country
        logging.info(
            f"start preparing ECMWF seasonal forecast data for country {country}"
        )

        current_year = datestart.strftime("%Y")
        current_month = datestart.strftime("%m")

        # Download netcdf file
        logging.info(f"downloading ecmwf data ")
        try:
            self.download_ecmwf_forecast(
                country,
                self.inputPathGrid,
                current_year,
                current_month,
            )
        except FileNotFoundError:
            logging.warning(f"downloading ECMWF file failed")

        logging.info("finished downloading ECMWF data")

    def calculate_percentage_below_zero(self, ds, threshold):
        percentage = ds.where(ds < 0).notnull().sum(dim="number") / ds.sizes["number"]
        return (percentage > threshold).astype(int)

    def save_to_geotiff(self, data_array, country: str = None, prefix: str = None):
        """
        Save each forecast month of the data array to a separate GeoTIFF file.

        Parameters:
            data_array (xarray.DataArray): The data array to save.
            output_dir (str): The directory to save the GeoTIFF files.
            prefix (str): The prefix for the GeoTIFF file names.
        """
        # Get the coordinates and dimensions
        latitudes = data_array.latitude.values
        longitudes = data_array.longitude.values
        forecast_months = data_array.forecastMonth.values

        # Define the transform

        transform = from_origin(
            longitudes[0],
            latitudes[0],
            longitudes[1] - longitudes[0],
            latitudes[0] - latitudes[1],
        )

        # Loop through each forecast month and save to a separate GeoTIFF file
        for i, month in enumerate(forecast_months):
            lead_time = month - 1
            output_file = (
                f"{self.outputPathGrid}/{prefix}_{lead_time}-month_{country}.tif"
            )
            data = data_array.sel(forecastMonth=month).values

            with rasterio.open(
                output_file,
                "w",
                driver="GTiff",
                height=data.shape[0],
                width=data.shape[1],
                count=1,
                dtype=data.dtype,
                crs=CRS.from_epsg(4326),
                transform=transform,
            ) as dst:
                dst.write(data, 1)
            # If month is 1, also write a file for month 0 we probably should not be doing this here.
            # we discussed with IBF team that we will not upload
            """
            if month == 1:
                output_file_zero = f"{self.outputPathGrid}/{prefix}_0-month_{country}.tif"
                data_zero = data_array.sel(forecastMonth=month).values

                with rasterio.open(
                    output_file_zero,
                    'w',
                    driver='GTiff',
                    height=data_zero.shape[0],
                    width=data_zero.shape[1],
                    count=1,
                    dtype=data_zero.dtype,
                    crs='+proj=latlong',
                    transform=transform,
                ) as dst_zero:
                    dst_zero.write(data_zero, 1)

            """

    def subset_region(self, ds, region, latname="latitude", lonname="longitude"):
        lon1 = region[1] % 360
        lon2 = region[3] % 360
        if lon2 >= lon1:
            mask_lon = (ds[lonname] <= lon2) & (ds[lonname] >= lon1)
        else:
            mask_lon = (ds[lonname] <= lon2) | (ds[lonname] >= lon1)

        mask = (ds[latname] <= region[0]) & (ds[latname] >= region[2]) & mask_lon
        subset = ds.where(mask, drop=True)

        if lon2 < lon1:
            subset[lonname] = (subset[lonname] + 180) % 360 - 180
            subset = subset.sortby(subset[lonname])

        return subset

    def extract_ecmwf_data(
        self, country: str = None, debug: bool = False, datestart: datetime = None
    ):
        """
        extract seasonal rainfall forecastand extract it per climate region
        """
        if country is None:
            country = self.country

        current_year = datestart.year
        current_month = datestart.month
        data_timestamp = replace_year_month(datetime.now(), current_year, current_month)

        ### admin_level
        logging.info(f"Extract ecmwf data for country {country}")
        admin_level_ = self.settings.get_country_setting(country, "admin-levels")
        triggermodel = self.settings.get_country_setting(country, "trigger_model")[
            "model"
        ]
        trigger_on_minimum_probability = self.settings.get_country_setting(
            country, "trigger_model"
        )["trigger-on-minimum-probability"]
        trigger_on_minimum_admin_area_in_drought_extent = (
            self.settings.get_country_setting(country, "trigger_model")[
                "trigger-on-minimum-admin-area-in-drought-extent"
            ]
        )

        if debug:
            scenario = os.getenv(
                "SCENARIO", "Forecast"
            )  # TODO: pull scenario debug to a proper scenario script
            logging.info(f"scenario: {scenario}")
            if scenario == "NoWarning":
                trigger_on_minimum_probability = 0.99
            elif scenario == "Warning":
                trigger_on_minimum_probability = 0.3

        logging.info("Extract seasonal forecast for each climate region")
        ds_hindcast, ds_forecast = convert_to_mm_per_month(
            f"{self.inputPathGrid}/ecmwf_seas5_hindcast_monthly_tp.grib",
            f"{self.inputPathGrid}/ecmwf_seas5_forecast_monthly_tp.grib",
        )
        """
        ds_hindcast = xr.open_dataset(
            f'{self.inputPathGrid}/ecmwf_seas5_hindcast_monthly_tp.grib',
            engine='cfgrib',
            backend_kwargs={'time_dims': ('forecastMonth', 'time')}
        )

        ds_hindcast['tprate'] = ds_hindcast['tprate'] * 86400 * 1000

        # Load forecast data
        ds_forecast = xr.open_dataset(
            f'{self.inputPathGrid}/ecmwf_seas5_forecast_monthly_tp.grib',
            engine='cfgrib',
            backend_kwargs={'time_dims': ('forecastMonth', 'time')}
        )

        # Convert tprate from m/s to mm/day
        ds_forecast['tprate'] = ds_forecast['tprate'] * 86400 * 1000
        tprate = ds_forecast['tprate']

        numdays = [monthrange(dd.year, dd.month)[1] for dd in valid_time]
        #ds_forecast['tprate'].attrs['units'] = 'mm/day'
        """

        ########## for 3 month rolling mean
        seas5_forecast_3m = (
            ds_forecast.shift(forecastMonth=-2)  # Shift data by 2 steps forward
            .rolling(forecastMonth=3, min_periods=1)  # Apply rolling
            .sum()  # Calculate mean for the rolling window
        )
        ds_hindcast_3m = (
            ds_hindcast.shift(forecastMonth=-2)  # Shift data by 2 steps forward
            .rolling(forecastMonth=3, min_periods=1)  # Apply rolling
            .sum()  # Calculate mean for the rolling window
        )

        if triggermodel == "seasonal_rainfall_forecast":
            trigger_df = self.compare_forecast_to_historical_lower_tercile(
                country, ds_hindcast, ds_forecast, trigger_on_minimum_probability
            )
            tprate_forecast = ds_forecast["tprate"]
            tprate_hindcast = ds_hindcast["tprate"]
            tprate_hindcast_mean = ds_hindcast.mean(["number", "time"])

            # Convert lead time into valid dates
            valid_time = [
                pd.to_datetime(tprate_forecast.time.values)
                + relativedelta(months=fcmonth - 1)
                for fcmonth in tprate_forecast.forecastMonth
            ]
            anomalies = ds_forecast["tprate"] - tprate_hindcast_mean

            # Convert precipitation rates to accumulation
            numdays = [monthrange(dd.year, dd.month)[1] for dd in valid_time]
            anomalies = anomalies.assign_coords(
                valid_time=("forecastMonth", valid_time)
            )
            anomalies = anomalies.assign_coords(numdays=("forecastMonth", numdays))
            anomalies_tp = anomalies  # * anomalies.numdays * 24 * 60 * 60 * 1000
            anomalies_tp.attrs["units"] = "mm"
            anomalies_tp.attrs["long_name"] = "Total precipitation anomaly"

        elif triggermodel == "seasonal_rainfall_forecast_3m":
            trigger_df = self.compare_forecast_to_historical_lower_tercile(
                country,
                ds_hindcast_3m,
                seas5_forecast_3m,
                trigger_on_minimum_probability,
            )
            tprate_forecast = seas5_forecast_3m["tprate"]
            tprate_hindcast = ds_hindcast_3m["tprate"]
            tprate_hindcast_mean = ds_hindcast_3m.mean(["number", "time"])
            anomalies = seas5_forecast_3m.tprate - tprate_hindcast_mean.tprate

            # Calculate number of days for each forecast month and add it as coordinate information to the data array
            vt = [
                pd.to_datetime(tprate_forecast.time.values)
                + relativedelta(months=fcmonth + 1)
                for fcmonth in tprate_forecast.forecastMonth
            ]
            vts = [
                [thisvt + relativedelta(months=-mm) for mm in range(3)] for thisvt in vt
            ]
            numdays = [
                np.sum([monthrange(dd.year, dd.month)[1] for dd in d3]) for d3 in vts
            ]

            # Convert lead time into valid dates
            valid_time = [
                pd.to_datetime(tprate_forecast.time.values)
                + relativedelta(months=fcmonth - 1)
                for fcmonth in tprate_forecast.forecastMonth
            ]
            anomalies = anomalies.assign_coords(numdays=("forecastMonth", numdays))
            anomalies = anomalies.assign_coords(
                valid_time=("forecastMonth", valid_time)
            )
            anomalies_tp = anomalies  # * anomalies.numdays * 24 * 60 * 60 * 1000
            anomalies_tp.attrs["units"] = "mm"
            anomalies_tp.attrs["long_name"] = (
                "SEAS5 3-monthly total precipitation ensemble mean anomaly for 6 lead-time months"
            )

        else:
            raise ValueError(f"Trigger model {triggermodel} not supported")

        ########################### for rainfall layer in IBF portal

        tprate_forecast_mean = tprate_forecast.mean(["number"])
        tprate_forecast_mean = tprate_forecast_mean.assign_coords(
            valid_time=("forecastMonth", valid_time)
        )
        tprate_forecast_mean = tprate_forecast_mean.assign_coords(
            numdays=("forecastMonth", numdays)
        )
        tprate_forecast_mean.attrs["units"] = "mm"

        for climateRegion in self.data.threshold_climateregion.get_ids():
            pcodes = self.data.threshold_climateregion.get_data_unit(
                _id=climateRegion
            ).pcodes
            admin_level_ = self.data.threshold_climateregion.get_data_unit(
                _id=climateRegion
            ).adm_level
            climateRegionName = self.data.threshold_climateregion.get_data_unit(
                _id=climateRegion
            ).name
            geofile = self.load.get_adm_boundaries(admin_level_)
            climateRegionPcodes = pcodes[f"{admin_level_}"]
            filtered_gdf = geofile[
                geofile[f"adm{admin_level_}_pcode"].isin(climateRegionPcodes)
            ]
            filtered_gdf["placeCode"] = filtered_gdf[f"adm{admin_level_}_pcode"]

            if filtered_gdf.empty:
                raise ValueError(
                    f"No data matching {climateRegion} found in the geofile."
                )

            # Get the extent of the filtered geofile
            try:
                lon_min, lat_min, lon_max, lat_max = (
                    filtered_gdf.total_bounds
                )  # [minx, miny, maxx, maxy]
            except ValueError as e:
                logging.error(
                    f"Error in extracting extent of the filtered geofile: {e}"
                )

            sub_region = (lat_max, lon_min, lat_min, lon_max)

            # extract annomalies for a specific region
            sub_anomalies = self.subset_region(anomalies_tp, sub_region)

            # Apply weighted mean for the region
            weights = np.cos(np.deg2rad(sub_anomalies.latitude))
            regional_mean = sub_anomalies.weighted(weights).mean(
                ["latitude", "longitude"]
            )

            # Create dataframe for anomalies
            anomalies_df = regional_mean.drop_vars(
                ["time", "surface", "numdays"]
            ).to_dataframe()
            anomalies_df = anomalies_df.rename(columns={"tprate": "anomaly"})
            anomalies_df = (
                anomalies_df.reset_index()
                .drop("forecastMonth", axis=1)
                .set_index(["valid_time", "number"])
                .unstack()
            )
            anomalies_df = anomalies_df.reset_index()
            anomalies_df["valid_time"] = anomalies_df["valid_time"].dt.strftime(
                "%b, %Y"
            )

            # Calculate thresholds
            hindcast_sub = self.subset_region(tprate_hindcast, sub_region)
            hindcast_mean = hindcast_sub.weighted(weights).mean(
                ["latitude", "longitude"]
            )
            hindcast_anomalies = hindcast_mean - hindcast_mean.mean(["number", "time"])
            hindcast_anomalies_tp = (
                hindcast_anomalies  # * hindcast_anomalies.numdays * 24 * 60 * 60 * 1000
            )
            thresholds = {
                "P0": hindcast_anomalies_tp.min(["number", "time"]),
                "P33": hindcast_anomalies_tp.quantile(1 / 3.0, ["number", "time"]),
                "P66": hindcast_anomalies_tp.quantile(2 / 3.0, ["number", "time"]),
                "P100": hindcast_anomalies_tp.max(["number", "time"]),
            }

            # Calculate trigger status
            dftemp = anomalies_df.anomaly
            dftemp.index = dftemp.index + 1
            forecastQ = dftemp.to_dict(orient="index")
            forecastData = {
                "çlimateRegion": climateRegion,
                "tercile_lower": thresholds["P33"]
                .drop_vars(["quantile"])
                .to_series()
                .to_dict(),
                "tercile_upper": thresholds["P66"]
                .drop_vars(["quantile"])
                .to_series()
                .to_dict(),
                "forecast": forecastQ,
            }
            tercile_seasonal_prc_df = (
                thresholds["P33"].drop_vars(["quantile"]).to_dataframe(name="p33")
            )
            tercile_seasonal_prc_df = tercile_seasonal_prc_df.reset_index().drop(
                "forecastMonth", axis=1
            )
            dftemp = anomalies_df.anomaly
            tercile_seasonal_prc_df["triggerForecast"] = (
                dftemp.iloc[:, :51]
                .lt(tercile_seasonal_prc_df.iloc[:, 0], axis=0)
                .sum(axis=1)
                / 51
            )
            tercile_seasonal_prc_df["triggerStatus"] = tercile_seasonal_prc_df[
                "triggerForecast"
            ].gt(trigger_on_minimum_probability)
            tercile_seasonal_prc_df.index = range(1, len(tercile_seasonal_prc_df) + 1)
            data_dict = tercile_seasonal_prc_df[
                ["triggerForecast", "triggerStatus"]
            ].to_dict(orient="index")

            for month in forecastData["tercile_lower"].keys():
                lead_time = month - 1
                lower_tercile_file = f"{self.outputPathGrid}/rlower_tercile_probability_{lead_time}-month_{country}.tif"

                # Open the TIF file as an xarray object
                rlower_tercile_probability = rioxarray.open_rasterio(lower_tercile_file)
                gdf1 = filtered_gdf
                clipped_regional_mean = rlower_tercile_probability.rio.clip(
                    gdf1.geometry, gdf1.crs, drop=True, all_touched=True
                )
                likelihood = round(np.nanmedian(clipped_regional_mean.values), 2)
                binary_clipped_regional_mean = (
                    clipped_regional_mean > trigger_on_minimum_probability
                ).astype(int)
                anomalies_df = binary_clipped_regional_mean.to_dataframe(name="anomaly")
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

                logging.info(
                    f"upserting data for climate region {climateRegion} for month {month} trigger status {triggered} likelihood {likelihood}"
                )
                self.data.rainfall_climateregion.timestamp = data_timestamp
                self.data.rainfall_climateregion.upsert_data_unit(
                    ForecastRegionDataUnit(
                        _id=climateRegion,
                        name=climateRegionName,
                        lead_time=lead_time,  # theck this -1
                        tercile_lower=forecastData["tercile_lower"][month],
                        tercile_upper=forecastData["tercile_upper"][month],
                        forecast=forecastData["forecast"][month],
                        triggered=triggered,  # data_dict[month]['triggerStatus'],
                        likelihood=likelihood,  # data_dict[month]['triggerForecast'],
                    )
                )
            logging.info(
                f"finished extraction of rainfall forecast for climate region{climateRegion}"
            )

    def compare_forecast_to_historical_lower_tercile(
        self, country, ds_hindcast, ds_forecast, trigger_on_minimum_probability
    ):
        """
        Compare the forecast data against the historical lower tercile (33rd percentile).
        Parameters:
            ds_hindcast (xarray.Dataset): Historical hindcast dataset containing 'tprate'.
            ds_forecast (xarray.Dataset): Forecast dataset containing 'tprate'.
        Returns:
            xarray.Dataset: A dataset containing the 33rd percentile (lower tercile)
                            and probability of forecast being below this threshold.
        """

        probability_maps = []
        drought_extent_maps = []
        quantile_thr = self.settings.get_country_setting(country, "trigger_model")[
            "tercile_treshold"
        ]

        raster_files = {}

        # Iterate over each forecast month
        for month in ds_hindcast.forecastMonth.values:
            lead_time = month - 1

            # Extract data for the current forecast month
            data_month = ds_hindcast["tprate"].sel(forecastMonth=month)
            data_month2 = ds_forecast["tprate"].sel(forecastMonth=month)
            quantile_33 = data_month.quantile(quantile_thr, dim=["time", "number"])
            probability = (data_month2 <= quantile_33).sum(
                dim="number"
            ) / data_month2.sizes["number"]
            new_lat = np.linspace(
                probability.latitude.values.min(),
                probability.latitude.values.max(),
                probability.latitude.size * 10,
            )
            new_lon = np.linspace(
                probability.longitude.values.min(),
                probability.longitude.values.max(),
                probability.longitude.size * 10,
            )
            regional_mean = probability.rio.write_crs("EPSG:4326")
            resampled_regional_mean = regional_mean.interp(
                latitude=new_lat, longitude=new_lon, method="nearest"
            )

            # Ensure the resampled DataArray has spatial dimensions
            resampled_regional_mean = resampled_regional_mean.rio.write_crs("EPSG:4326")
            resampled_regional_mean = resampled_regional_mean.drop_vars(
                [
                    coord
                    for coord in resampled_regional_mean.coords
                    if coord not in ["latitude", "longitude"]
                ]
            )
            binary_clipped_regional_mean = (
                resampled_regional_mean > trigger_on_minimum_probability
            ).astype(int)
            raster_files[month] = binary_clipped_regional_mean

            # Store results
            probability_maps.append(resampled_regional_mean)
            drought_extent_maps.append(binary_clipped_regional_mean)
            latitudes = resampled_regional_mean.latitude.values
            longitudes = resampled_regional_mean.longitude.values

            # Define the transform
            transform = from_origin(
                longitudes[0],
                latitudes[0],
                longitudes[1] - longitudes[0],
                latitudes[0] - latitudes[1],
            )
            prefix = "rlower_tercile_probability"
            temp_output = f"{self.outputPathGrid}/temp_{prefix}.tif"
            output_file = (
                f"{self.outputPathGrid}/{prefix}_{lead_time}-month_{country}.tif"
            )
            data = resampled_regional_mean.values

            with rasterio.open(
                temp_output,
                "w",
                driver="GTiff",
                height=data.shape[0],
                width=data.shape[1],
                count=1,
                dtype=data.dtype,
                crs="EPSG:4326",
                transform=transform,
            ) as dst:
                dst.write(data, 1)

            # Download admin boundaries from  Natural Earth
            url = "https://naturalearth.s3.amazonaws.com/110m_cultural/ne_110m_admin_0_countries.zip"  # TODO: pull country shapefile from IBF API instead
            admin0 = gpd.read_file(url)
            admin_gdf = admin0.query("ADM0_A3 == @country")
            admin_gdf = admin_gdf.to_crs("EPSG:4326")  # Ensure CRS matches raster

            # Clip using rasterio.mask
            with rasterio.open(temp_output) as src:
                clipped_image, clipped_transform = mask(
                    src, admin_gdf.geometry, crop=True
                )
                clipped_meta = src.meta.copy()

            # Update metadata
            clipped_meta.update(
                {
                    "height": clipped_image.shape[1],
                    "width": clipped_image.shape[2],
                    "transform": clipped_transform,
                }
            )

            # Save clipped raster
            with rasterio.open(output_file, "w", **clipped_meta) as dst:
                dst.write(clipped_image)
            prefix = "drought_extent"  #'drought_extent'
            output_file = (
                f"{self.outputPathGrid}/{prefix}_{lead_time}-month_{country}.tif"
            )
            temp_output = f"{self.outputPathGrid}/temp_{prefix}.tif"
            data = binary_clipped_regional_mean.values
            with rasterio.open(
                temp_output,
                "w",
                driver="GTiff",
                height=data.shape[0],
                width=data.shape[1],
                count=1,
                dtype=data.dtype,
                crs="+proj=latlong",
                transform=transform,
            ) as dst:
                dst.write(data, 1)

            # Clip using rasterio.mask
            with rasterio.open(temp_output) as src:
                clipped_image, clipped_transform = mask(
                    src, admin_gdf.geometry, crop=True
                )
                clipped_meta = src.meta.copy()

            # Update metadata
            clipped_meta.update(
                {
                    "height": clipped_image.shape[1],
                    "width": clipped_image.shape[2],
                    "transform": clipped_transform,
                }
            )

            # Save clipped raster
            with rasterio.open(output_file, "w", **clipped_meta) as dst:
                dst.write(clipped_image)

        # Combine results into new DataArrays
        quantile_ds = xr.concat(drought_extent_maps, dim="forecastMonth")
        probability_ds = xr.concat(probability_maps, dim="forecastMonth")

        # Save results to a new dataset
        output_ds = xr.Dataset(
            {
                "quantile_33": quantile_ds,
                "probability": probability_ds,
            }
        )
        return raster_files

    def download_ecmwf_forecast(self, country, data_dir, current_year, current_month):
        """Download ECMWF seasonal hindcast data for historical period
        Args:
            country (str): Country name
            data_dir (str): Directory to save data
            current_year (str): Current year
            current_month (str): Current month
        """
        gdf = self.load.get_adm_boundaries(1)

        min_x, min_y, max_x, max_y = gdf.total_bounds

        KEY = os.getenv("CDSAPI_KEY")
        URL = "https://cds.climate.copernicus.eu/api"

        c = cdsapi.Client(url=URL, key=KEY, wait_until_complete=False, delete=False)

        # Forecast data request
        dataset = "seasonal-monthly-single-levels"
        request = {
            "originating_centre": "ecmwf",
            "system": "51",
            "variable": ["total_precipitation"],
            "product_type": ["monthly_mean"],
            "year": [current_year],
            "month": [current_month],
            "leadtime_month": ["1", "2", "3", "4", "5", "6"],
            "data_format": "grib",
            "area": [
                int(x) for x in [max_y + 1, min_x - 1, min_y - 1, max_x + 1]
            ],  # North, West, South, East
        }
        target = f"{data_dir}/ecmwf_seas5_forecast_monthly_tp.grib"
        c.retrieve(dataset, request, target)

        sleep = 30
        time.sleep(sleep)

        request = {
            "originating_centre": "ecmwf",
            "system": "51",
            "variable": ["total_precipitation"],
            "product_type": ["monthly_mean"],
            "year": [
                "1991",
                "1992",
                "1993",
                "1994",
                "1995",
                "1996",
                "1997",
                "1998",
                "1999",
                "2000",
                "2001",
                "2002",
                "2003",
                "2004",
                "2005",
                "2006",
                "2007",
                "2008",
                "2009",
                "2010",
                "2011",
                "2012",
                "2013",
                "2014",
                "2015",
                "2016",
                "2017",
                "2018",
                "2019",
                "2020",
            ],
            "month": ["03"],
            "leadtime_month": ["1", "2", "3", "4", "5", "6"],
            "data_format": "grib",
            "area": [
                int(x) for x in [max_y + 1, min_x - 1, min_y - 1, max_x + 1]
            ],  # North, West, South, East
        }
        target = f"{data_dir}/ecmwf_seas5_hindcast_monthly_tp.grib"
        c.retrieve(dataset, request, target)
