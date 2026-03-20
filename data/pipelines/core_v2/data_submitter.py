
class DataSubmitter:
    """
    This class handles all data caching and submission to the IBF backend API.

    The disaster logic add data to this class multiple times. Once all disaster logic is done, the data is sent in one final call. All places to add data will have validation done.

🔹API:

alert id: country_hazard type_spatial id (to work out later)

    add_image_output(alert id, output data) 
note: might need string tag for the image
    add_text_output(alert id, a, b, c, d, …) 
note: might be dict or other format 

    <other add functions as needed> i.e. things like add_timeseries_data, add_admin-area-related_data, etc.
    send_all(config)  
note: if the send location depends on config, use that. If not, we can get the send loc from .env, or save locally

🔹Members:


    errors : dict <string of called function, error string>
=================
details 
===================
    Hazard-flow submits multiple parts of the data
        basic integrity checks done on the data
        Data formatted/transformed as needed (PNG, CSV ->JSON, etc)
    Hazard-flow does send()
        integrity checks done (such as check that all needed data was provided)
        files sent to location, depending on config, env, and/or override (such as write all to local setting)

    """


    def __init__(self, api_client):
        self.api_client = api_client

    def submit_data(self, data, metadata):
        """
        Submit data to the API. This is a placeholder function and should be implemented with the actual logic to submit data to the API.
        """
        return 0