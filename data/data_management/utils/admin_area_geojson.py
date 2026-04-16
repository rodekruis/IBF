"""
Uniform data structure for admin areas geojson.
There are many sources for admin areas, but they should be parsed to
fit this format for the DB uploader to be able to process them.
"""

from dataclasses import dataclass
from typing import Any


# Top level structure for the admin areas format
@dataclass
class AdminAreaFeatureCollection:
    type: str  # always "FeatureCollection" for geojson
    features: list[Feature]


# This holds the data for a single admin area.
# It's the second level structure in the admin area data.
@dataclass
class Feature:
    type: str  # always "Feature" for geojson
    geometry: Geometry
    properties: AdminAreaProperties


# Vector point data, along with the shape type
@dataclass
class Geometry:
    type: str  # e.g. "MultiPolygon", "Line", "Point", etc.
    coordinates: list[Any]


@dataclass
class AdminAreaProperties:
    """Properties for an admin area feature.
    Fields vary by admin level. Higher levels include parent references.
    """

    # Area Data
    POPULATION: int | None = None

    # Admin level 0
    ADM0_EN: str | None = None
    # write ISO_A2 to here for backward compatibility
    # we can remove this later
    ADM0_PCODE: str | None = None
    ADM0_ISO_A2: str | None = None
    ADM0_ISO_A3: str | None = None

    # Admin level 1
    ADM1_EN: str | None = None
    ADM1_PCODE: str | None = None

    # Admin level 2
    ADM2_EN: str | None = None
    ADM2_PCODE: str | None = None

    # Admin level 3
    ADM3_EN: str | None = None
    ADM3_PCODE: str | None = None
    ADM3_REF: str | None = None

    # Admin level 4
    ADM4_EN: str | None = None
    ADM4_PCODE: str | None = None
    ADM4_REF: str | None = None
