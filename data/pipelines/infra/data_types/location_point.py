from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LocationPoint:
    """
    A generic class used for point locations
    """

    name: str
    lat: float
    lon: float
    id: str
