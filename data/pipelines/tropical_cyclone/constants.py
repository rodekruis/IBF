"""
Constants for the tropical-cyclone hazard pipeline.

Data only (no functions) — see `determine_alerts.py` for the `wind_speed_to_category()`
lookup that consumes `WIND_CATEGORY_TABLES`. Tables are basin-pluggable.
"""

from __future__ import annotations
from enum import StrEnum
from shared.country_data import CountryCodeIso3


class Basin(StrEnum):
    """Ocean basin whose tropical-cyclone category scale governs a country."""

    ATLANTIC = "atlantic"
    WESTERN_PACIFIC = "western_pacific"


# Which basin's category scale applies to each country.
# TODO(data-scientist): Philippines study case only; extend as new countries are onboarded.
COUNTRY_BASIN: dict[CountryCodeIso3, Basin] = {
    CountryCodeIso3.PHL: Basin.WESTERN_PACIFIC,
}

# Sustained-wind conversion factor, per basin, applied to GEFS's instantaneous 10 m
# wind speed before comparing it against the category tables below. GEFS reports an
# instantaneous (analysis-time) wind field, not the 1-minute (Saffir-Simpson) or
# 10-minute (PAGASA) sustained wind the tables are defined against.
# Placeholder: 1.0 (no conversion) until we have a validated
# instantaneous-to-sustained factor per basin
# "instantaneous-wind caveat".
# TODO(data-scientist): replace with a validated factor per basin.
SUSTAINED_WIND_FACTOR: dict[Basin, float] = {
    Basin.ATLANTIC: 1.0,
    Basin.WESTERN_PACIFIC: 1.0,
}

# Saffir-Simpson Hurricane Wind Scale (NOAA/NHC), minimum 1-minute sustained wind
# speed per category, in m/s. Ascending (category label, min speed m/s).
# Source: https://www.nhc.noaa.gov/aboutsshws.php
SAFFIR_SIMPSON_TABLE: list[tuple[str, float]] = [
    ("CAT_1", 33.0),
    ("CAT_2", 43.0),
    ("CAT_3", 50.0),
    ("CAT_4", 58.0),
    ("CAT_5", 70.0),
]

# PAGASA Tropical Cyclone Categories, minimum 10-minute sustained wind speed per
# category, in m/s. Ascending (category label, min speed m/s).
# Source: https://www.pagasa.dost.gov.ph/information/tropical-cyclone-information
# TODO(data-scientist): only TYPHOON (the min-severity/Cat-1-equivalent boundary,
# ~33 m/s) has been cross-checked against the plan's min-severity gate; verify the
# other boundaries before they're relied on for anything beyond the alert gate.
PAGASA_TABLE: list[tuple[str, float]] = [
    ("TROPICAL_DEPRESSION", 11.0),
    ("TROPICAL_STORM", 17.0),
    ("SEVERE_TROPICAL_STORM", 25.0),
    ("TYPHOON", 33.0),
    ("SUPER_TYPHOON", 51.0),
]

# Basin-pluggable category tables, each ascending by min speed.
# `wind_speed_to_category()` (tropical_cyclone/determine_alerts.py) looks up the
# highest category whose min speed a wind speed exceeds.
WIND_CATEGORY_TABLES: dict[Basin, list[tuple[str, float]]] = {
    Basin.ATLANTIC: SAFFIR_SIMPSON_TABLE,
    Basin.WESTERN_PACIFIC: PAGASA_TABLE,
}

# The category label, per basin, that gates whether an alert is raised at all —
# below this category, no alert. The Philippines study case's
# min-severity boundary (~33 m/s) is the same value in both scales (Saffir-Simpson
# Cat 1 and PAGASA Typhoon) — this constant is still per-basin for when that stops
# being true.
MIN_SEVERITY_CATEGORY: dict[Basin, str] = {
    Basin.ATLANTIC: "CAT_1",
    Basin.WESTERN_PACIFIC: "TYPHOON",
}

# Minimum sustained wind speed (m/s) to raise an alert, per basin — derived from
# WIND_CATEGORY_TABLES + MIN_SEVERITY_CATEGORY so the two constants can't drift apart.
MIN_SEVERITY_MS: dict[Basin, float] = {
    basin: dict(table)[MIN_SEVERITY_CATEGORY[basin]]
    for basin, table in WIND_CATEGORY_TABLES.items()
}

# NOAA GEFS ensemble member count (31-member ensemble; see TROPICAL_CYCLONE_PLAN.md
# "Data source"). Used to validate GEFS input completeness before extracting wind speed.
GEFS_ENSEMBLE_COUNT = 31
