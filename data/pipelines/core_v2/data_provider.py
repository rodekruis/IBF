
from core_v2.fetched_data_object import FetchedDataObject


class DataProvider:
    """
    This class fetches all data listed in the config file, parses it, and provides it to the hazard logic.
        This is the class that fetches all data, from a source indicated in the config file.

    It will parse the data if the data is in a format that needs parsing.
"""

    loaded_data : dict[str, FetchedDataObject]
    config : dict # TODO

    def try_load_data(self, config_name, config_type) -> bool:
        """
        Fetch all data from the sources indicated in the config file

        Flow:
        Try to load config.
        For each source
            create a DataSource
            try to load the data
            if parsable, try to parse it (if config indicates this as JSON, XML, etc.)
            add the data or none to the DataSource
            add an error or none as well
        """
        return True