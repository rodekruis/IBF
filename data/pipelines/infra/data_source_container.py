from __future__ import annotations

from dataclasses import dataclass, field

from pipelines.infra.data_source_types import DataSource, DataType


@dataclass
class DataSourceContainer:
    name: str
    dataType: DataType
    dataLocation: DataSource
    data: object | None = None
    error: str | None = None
    metadata: dict[str, str | int | float | bool] = field(default_factory=dict)
