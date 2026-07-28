"""
Constants for the tropical-cyclone hazard pipeline.

Data only (no functions) — see `determine_alerts.py` for the flat `MIN_SEVERITY_MS` gate and
`extract_forecast.py` for where `WMO_HARPER_10MIN_TO_1MIN_FACTOR`/`COUNTRY_CONFIGS` get applied to
convert GEFS's wind speed to each country's own sustained-wind convention.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from shared.country_data import CountryCodeIso3

from pipelines.infra.data_types.enums import ForecastSource


class ExposureClass(StrEnum):
    """WMO/Harper (2010) terrain/coastal exposure category for a country's wind observations."""

    IN_LAND = "in_land"
    OFF_LAND = "off_land"
    OFF_SEA = "off_sea"
    AT_SEA = "at_sea"


class AveragingPeriod(StrEnum):
    """
    Official sustained-wind averaging-period convention used by a country's tropical-cyclone
    warning agency.
    """

    ONE_MINUTE = "1min"
    THREE_MINUTE = "3min"
    TEN_MINUTE = "10min"


@dataclass
class CountryConfig:
    exposure_class: ExposureClass
    sustained_wind_averaging_period: AveragingPeriod
    # TODO-infra: move alongside COUNTRY_CONFIGS if/when that migrates to the db/API.
    # this is only a placeholder for now, since the pipeline code needs to know
    # which forecast source to use for each
    forecast_source: ForecastSource


# Exposure class, averaging-period convention, and forecast source.
# forecast_source is GEFS for every country today (status quo) - switch specific countries to
# ForecastSource.ECMWF once the ECMWF fetcher exists in infra.
COUNTRY_CONFIGS: dict[CountryCodeIso3, CountryConfig] = {
    CountryCodeIso3.PHL: CountryConfig(
        exposure_class=ExposureClass.IN_LAND,  # TODO(data-scientist): confirm,
        sustained_wind_averaging_period=AveragingPeriod.TEN_MINUTE,  # PAGASA convention
        forecast_source=ForecastSource.ECMWF,
    ),
    CountryCodeIso3.KNA: CountryConfig(
        exposure_class=ExposureClass.AT_SEA,  # small island, per domain owner
        sustained_wind_averaging_period=AveragingPeriod.ONE_MINUTE,  # NHC convention
        forecast_source=ForecastSource.GEFS,
    ),
    CountryCodeIso3.DMA: CountryConfig(
        exposure_class=ExposureClass.AT_SEA,  # small island, per domain owner
        sustained_wind_averaging_period=AveragingPeriod.ONE_MINUTE,  # NHC convention
        forecast_source=ForecastSource.GEFS,
    ),
    CountryCodeIso3.ATG: CountryConfig(
        exposure_class=ExposureClass.AT_SEA,  # small island, per domain owner
        sustained_wind_averaging_period=AveragingPeriod.ONE_MINUTE,  # NHC convention
        forecast_source=ForecastSource.GEFS,
    ),
}

# Buffer added around each country's admin-area bounding box before slicing the global GRIB2/ATCF
# data, so the monitoring box can see the storm approaching over open ocean before landfall — a
# small island's own land extent doesn't capture that. Also doubles as the monitoring-trigger
# radius: a country is "watched" once a storm's track enters this padded box.
# 1000 km = WMO's upper bound on tropical-cyclone diameter, chosen deliberately generous to avoid
# missing storms whose wind field reaches land while the track/centroid itself stays offshore
# (a real scenario - wind extent is not bounded by the track). A track further than this cannot
# physically have a wind field reaching the country, so the severity gate (wind-driven, not
# track-driven - see MIN_SEVERITY_MS below) never needs a track-based fallback for that case.
# Revisit if this introduces too much noise in production.
MONITORING_BOX_BUFFER_KM = 1000.0

# WMO/Harper (2010) exposure-dependent gust factor converting a 10-minute mean wind speed to a
# 1-minute sustained estimate. Only applied for countries whose convention is ONE_MINUTE — a
# TEN_MINUTE-convention country (e.g. PHL) needs no correction on this axis.
# Assumes GEFS's native 10 m wind approximates a 10-minute-equivalent mean (the common NWP
# convention) — TODO(data-scientist): this GEFS-specific assumption hasn't been confirmed against
# NOAA documentation; if wrong, every ONE_MINUTE-convention country's converted wind speed is off
# by a knowable but currently-unapplied correction.
# Source: Harper, Kepert & Ginger, "Guidelines for Converting Between Various Wind Averaging
# Periods in Tropical Cyclone Conditions", WMO/TD-No. 1555 (2010).
WMO_HARPER_10MIN_TO_1MIN_FACTOR: dict[ExposureClass, float] = {
    ExposureClass.IN_LAND: 1.21,
    ExposureClass.OFF_LAND: 1.16,
    ExposureClass.OFF_SEA: 1.11,
    ExposureClass.AT_SEA: 1.05,
}

# Minimum sustained wind speed (m/s) to raise an alert. Single flat constant across all countries
# this only works because extract_wind_speed() converts
# GEFS's wind speed into each country's own averaging-period convention first: ~33 m/s is both
# Saffir-Simpson Category 1 (1-minute convention, e.g. KNA/DMA/ATG) and PAGASA's Typhoon threshold
# (10-minute convention, PHL) independently.
# This gate is wind-driven, not track-driven: extract_wind_speed() reads GRIB wind data directly
# and never looks at the track, so a storm whose centroid stays offshore while its wind field still
# reaches hurricane force over land already trips this gate correctly - no track-based special case
# needed. Whether to lower this to 0 (alert on any monitored storm, including sub-hurricane-force
# systems) is a separate, deferred product-scope decision, not a fix for the offshore-track case.
MIN_SEVERITY_MS = 33.0

# --- NOAA GEFS ensemble -----------------------------------------------------------------------
# NOAA GEFS ensemble member naming (31-member ensemble: 1 control + 30 perturbed).
# Wind (pgrb2sp25 GRIB2) and track (tctrack ATCF) products use different, but 1:1-mapped, member
# codes for the same underlying ensemble member (gec00<->ac00, gep01<->ap01, ...).
GEFS_ENSEMBLE_COUNT = 31
GEFS_WIND_MEMBER_IDS: list[str] = ["gec00", *[f"gep{i:02d}" for i in range(1, 31)]]
GEFS_TRACK_MEMBER_IDS: list[str] = ["ac00", *[f"ap{i:02d}" for i in range(1, 31)]]

# ATCF "radius of specified wind" (RAD) threshold, in knots. Each (member, lead hour) is repeated
# once per RAD present (34/50/64 kt) with identical VMAX/MSLP each time - filtering to one RAD
# value keeps exactly one row per (member, lead hour).
ATCF_WIND_RADII_THRESHOLD_KNOTS = 34

# Native GEFS forecast cadence for the wind (pgrb2sp25) product - a fixed physical property of the
# data source, independent of whatever lead-time bucketing the alert config's temporal extent
# specifies (see AlertConfig's "lead-time-spectrum", e.g. 3-hour or 6-hour steps up to some max
# lead time). extract_wind_speed() aggregates native-step rasters (per-cell max, per ensemble
# member) into a bucket whenever the configured interval is a coarser multiple of this.
GEFS_NATIVE_LEAD_TIME_STEP_HOURS = 3


# --- ECMWF IFS ensemble -----------------------------------------------------------------------
# Same two products as GEFS - wind speed and track, per ensemble member, four daily cycles
# (00/06/12/18 UTC) - but a different packaging. ECMWF splits control and perturbed forecasts
# across two "streams" instead of GEFS's single combined ensemble: `oper` is the lone control
# forecast, `enfo` carries the 50 perturbed members. Members are addressed by integer number
# (GRIB `number` key for wind, BUFR `ensembleMemberNumber` for track), not by GEFS-style string
# codes, so an int is the member id here. The shared 1..50 perturbed number is the join key
# between the two products for a given member. Only ~4 days of history sit in the live directory
#  at a time.
ECMWF_STREAM_CONTROL = "oper"
ECMWF_STREAM_PERTURBED = "enfo"

# 50 perturbed members, shared 1..50 numbering across the wind (GRIB2) and track (BUFR) products.
ECMWF_PERTURBED_MEMBER_COUNT = 50
ECMWF_PERTURBED_MEMBER_NUMBERS: list[int] = list(range(1, ECMWF_PERTURBED_MEMBER_COUNT + 1))

# Where the ensemble control lives differs by product:
#  - wind: a separate `oper` file (type `fc`), fully outside the perturbed `enfo` file (type `ef`)
#  - track: bundled INTO the perturbed `enfo` BUFR file as member number 51 (type `tf`)
# So the track product exposes 51 members while wind exposes 50 perturbed + 1 separate control.
ECMWF_TRACK_CONTROL_MEMBER_NUMBER = 51
ECMWF_ENSEMBLE_COUNT = ECMWF_PERTURBED_MEMBER_COUNT + 1  # 50 perturbed + 1 control

# Native ECMWF IFS ensemble wind cadence (the 0.25-degree wind steps we read). Same role as
# GEFS_NATIVE_LEAD_TIME_STEP_HOURS - extract_wind_speed() aggregates these native steps up whenever
# the alert config's temporal extent is coarser.
ECMWF_NATIVE_LEAD_TIME_STEP_HOURS = 3

# ECMWF BUFR cyclone-track fixes are reported on a 6-hourly `timePeriod` cadence (6, 12, 18, ...),
# independent of the wind cadence above - used only to derive each track fix's reported time
# interval (see extract_track.py).
ECMWF_TRACK_FIX_INTERVAL_HOURS = 6

# ECMWF BUFR encodes mean-sea-level pressure (pressureReducedToMeanSeaLevel) in pascals, unlike the
# hPa/mbar that ATCF (and GEFS's track) uses - divide by this to get hPa before comparing the two
# sources.
ECMWF_MSLP_PA_TO_HPA = 100.0

# ECMWF BUFR reports wind (windSpeedAt10M) in m/s, while ATCF (and TrackFix) carries max sustained
# wind in knots - multiply m/s by this to convert (1 m/s = 1.943844 knots).
METERS_PER_SECOND_TO_KNOTS = 1.943844
