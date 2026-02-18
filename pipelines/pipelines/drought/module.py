from pipelines.core.module import Module
from pipelines.drought.data import DroughtDataSets
from pipelines.drought.load import DroughtLoad


class DroughtModule(Module):
    def __init__(self, data: DroughtDataSets, load: DroughtLoad, **kwargs):
        super().__init__(data=data, load=load, **kwargs)
        self.data = data
        self.load = load
