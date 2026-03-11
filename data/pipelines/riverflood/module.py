from pipelines.core.module import Module
from pipelines.riverflood.load import RiverFloodLoad


class RiverFloodModule(Module):
    def __init__(self, load: RiverFloodLoad, **kwargs):
        super().__init__(data=load.data, load=load, **kwargs)
        self.load = load
        self.data = load.data
