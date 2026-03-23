from pipelines.legacy.core.module import Module
from pipelines.legacy.drought.load import DroughtLoad


class DroughtModule(Module):
    def __init__(self, load: DroughtLoad, **kwargs):
        super().__init__(data=load.data, load=load, **kwargs)
        self.load = load
        self.data = load.data
