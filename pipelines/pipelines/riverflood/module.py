from pipelines.core.module import Module
from pipelines.riverflood.data import RiverFloodDataSets
from pipelines.riverflood.load import RiverFloodLoad


class RiverFloodModule(Module):
    def __init__(self, data: RiverFloodDataSets, load: RiverFloodLoad, **kwargs):
        super().__init__(data=data, load=load, **kwargs)
        self.data = data
        self.load = load
