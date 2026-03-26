from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LocationPoint:
    name: str
    lat: float
    lon: float
    id: str
