from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class LocationPoint:
    """
    A generic class used for point locations
    """

    name: str
    lat: float
    lon: float
    id: str
    attributes: dict[str, object] = field(default_factory=dict)
