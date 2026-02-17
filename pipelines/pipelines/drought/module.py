from pipelines.core.module import Module
from pipelines.drought.data import DroughtDataSets


class DroughtModule(Module):
    def __init__(self, data: DroughtDataSets, **kwargs):
        super().__init__(data=data, **kwargs)
        self.data = data
