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


# Exposure class and averaging-period convention
COUNTRY_CONFIGS: dict[CountryCodeIso3, CountryConfig] = {
    CountryCodeIso3.PHL: CountryConfig(
        exposure_class=ExposureClass.IN_LAND,  # TODO(data-scientist): confirm,
        sustained_wind_averaging_period=AveragingPeriod.TEN_MINUTE,  # PAGASA convention
    ),
    CountryCodeIso3.KNA: CountryConfig(
        exposure_class=ExposureClass.AT_SEA,  # small island, per domain owner
        sustained_wind_averaging_period=AveragingPeriod.ONE_MINUTE,  # NHC convention
    ),
    CountryCodeIso3.DMA: CountryConfig(
        exposure_class=ExposureClass.AT_SEA,  # small island, per domain owner
        sustained_wind_averaging_period=AveragingPeriod.ONE_MINUTE,  # NHC convention
    ),
    CountryCodeIso3.ATG: CountryConfig(
        exposure_class=ExposureClass.AT_SEA,  # small island, per domain owner
        sustained_wind_averaging_period=AveragingPeriod.ONE_MINUTE,  # NHC convention
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
