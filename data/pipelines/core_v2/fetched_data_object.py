from dataclasses import dataclass
from typing import Any

@dataclass
class FetchedDataObject:
    """
    A class Basic object that holds fetched and parsed data, errors, and any needed classifiers/meta data.

    The members are not final.
    """
    name: str
    source: str
    data: Any
    error: str | None
    metadata: str