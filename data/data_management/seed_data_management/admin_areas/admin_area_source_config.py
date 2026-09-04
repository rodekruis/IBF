from enum import StrEnum


class AdminAreaSource(StrEnum):
    GADM = "gadm"
    HDX = "hdx"


ADMIN_AREA_SOURCES: dict[str, AdminAreaSource] = {
    "ETH": AdminAreaSource.HDX,
    "KEN": AdminAreaSource.GADM,  # HDX misses level 3, so use GADM instead
    "MWI": AdminAreaSource.HDX,
    "PHL": AdminAreaSource.HDX,
    "UGA": AdminAreaSource.HDX,
    "ZWE": AdminAreaSource.HDX,
    "SSD": AdminAreaSource.HDX,
    "ZMB": AdminAreaSource.HDX,
    "LSO": AdminAreaSource.HDX,
}

ADMIN_AREA_LEVELS: dict[str, list[int]] = {
    "ETH": [0, 1, 2, 3],
    "KEN": [0, 1, 2, 3],
    "MWI": [0, 1, 2, 3],
    "PHL": [0, 1, 2, 3],
    "UGA": [0, 1, 2, 3, 4],
    "ZWE": [0, 1, 2, 3],
    "SSD": [0, 1, 2, 3],
    "ZMB": [0, 1, 2, 3],
    "LSO": [0, 1, 2],
}

GADM_VERSION = "4.1"

HDX_DATASET_IDS: dict[str, str] = {
    "ETH": "cod-ab-eth",
    "KEN": "cod-ab-ken",
    "MWI": "cod-ab-mwi",
    "PHL": "cod-ab-phl",
    "UGA": "cod-ab-uga",
    "ZMB": "cod-ab-zmb",
    "LSO": "cod-ab-lso",
    "ZWE": "cod-ab-zwe",
    "SSD": "cod-ab-ssd",
}

COUNTRY_NAMES: dict[str, str] = {
    "ETH": "Ethiopia",
    "KEN": "Kenya",
    "MWI": "Malawi",
    "PHL": "Philippines",
    "UGA": "Uganda",
    "ZMB": "Zambia",
    "LSO": "Lesotho",
    "ZWE": "Zimbabwe",
    "SSD": "South Sudan",
}

# Synthetic parent PCODES are used to explicitly define parent administrative areas
# that are not provided by the upstream data source. This allows for the creation
# of higher-level administrative areas by aggregating child features when necessary.
SYNTHETIC_PARENT_PCODES: dict[str, dict[int, set[str]]] = {
    "SSD": {1: {"SS00"}},
}

PROCESSED_FILE_SIMPLIFICATION_THRESHOLD_BYTES = 95_000_000
GEOMETRY_SIMPLIFICATION_TOLERANCE = 0.0001


def get_countries_for_source(source: AdminAreaSource) -> dict[str, list[int]]:
    result: dict[str, list[int]] = {}
    for country, country_source in ADMIN_AREA_SOURCES.items():
        if country_source == source:
            result[country] = ADMIN_AREA_LEVELS[country]
    return result
