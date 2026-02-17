from pipelines.core.module import Module
from pipelines.riverflood.data import RiverFloodDataSets


class RiverFloodModule(Module):
    def __init__(self, data: RiverFloodDataSets, **kwargs):
        super().__init__(data=data, **kwargs)
        self.data = data
