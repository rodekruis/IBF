from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LocationPoint:
    code: str
    name: str
    lat: float
    lon: float
    id: str
