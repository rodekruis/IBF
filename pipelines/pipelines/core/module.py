from pipelines.core.data import DataSets
from pipelines.core.load import Load
from pipelines.core.secrets import Secrets
from pipelines.core.settings import Settings


class Module:
    """Base module"""

    def __init__(
        self,
        settings: Settings,
        secrets: Secrets,
        country: str,
        settings_to_check: list = [],
        secrets_to_check: list = [],
        data: DataSets = None,
    ):
        self.country = country
        self.settings_to_check = settings_to_check
        self.settings = self.check_settings(settings)
        if country not in [c["name"] for c in self.settings.get_setting("countries")]:
            raise ValueError(f"No config found for country {country}")
        self.secrets_to_check = secrets_to_check
        self.secrets = self.check_secrets(secrets)
        self.data = data
        self.load = Load(country=country, settings=settings, secrets=secrets)

    def check_settings(self, settings: Settings):
        """Check settings"""
        if not isinstance(settings, Settings):
            raise TypeError(f"invalid format of settings, use settings.Settings")
        settings.check_settings(self.settings_to_check)
        return settings

    def check_secrets(self, secrets: Secrets):
        """Check secrets for storage"""
        if not isinstance(secrets, Secrets):
            raise TypeError(f"invalid format of secrets, use secrets.Secrets")
        secrets.check_secrets(self.secrets_to_check)
        return secrets
