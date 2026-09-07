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

# - For adm1 and adm2 we apply additional simplification here using mapshaper, thereby preserving shared borders (unlike pg_featureserv can)
# - adm0 is simplified by pg_featureserv for frontend requests, so not simplified here
# - adm3 areas are relatively small, and need their detail at the zoom levels
# - we simplify based an 90th-percentile thresholds, to focus only on edge cases, while leaving isolated outliers be.
# - for adm2 we use a sharper threshold, and less aggressive simplification then for adm1, because the detail is needed
MAPSHAPER_SIMPLIFICATION_P90_THRESHOLDS_BYTES: dict[int, int] = {
    1: 500_000,
    2: 250_000,
}
MAPSHAPER_SIMPLIFICATION_PERCENTAGES: dict[int, str] = {
    1: "25%",
    2: "50%",
}


def get_countries_for_source(source: AdminAreaSource) -> dict[str, list[int]]:
    result: dict[str, list[int]] = {}
    for country, country_source in ADMIN_AREA_SOURCES.items():
        if country_source == source:
            result[country] = ADMIN_AREA_LEVELS[country]
    return result
