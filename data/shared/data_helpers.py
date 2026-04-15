"""
Helper files and functions for data scripts
"""

import os
from pathlib import Path

from dotenv import load_dotenv

"""
A limited list of countries to fetch data for (if we are not already grabbing global data).
"""
target_countries_iso_a3 = {
    # Note : this list is limited for dev work so we don't slow ourselves down with too much data.
    # Add more as needed.
    "ETH",
    "KEN",
    "MWI",
    "PHL",
    "ZMB",
    # Temporarily added to fetch new population data for all v1 countries
    # "UGA",
    # "LSO",
    # "ZWE",
    # "SSD",
}

"""
ISO-3 codes for countries present in both the WorldPop and GADM datasets.
This includes all generally recognized countries.
For purposes of IBF and GO, this should contain all in-scope countries,
as well as some that are not.
Sources:
- https://data.worldpop.org/GIS/Population/Global_2015_2030/R2024A/2024/
- https://geodata.ucdavis.edu/gadm/gadm4.1/json/

Differences between WorldPop and GADM country code lists:

Only in WorldPop (9):
  CPT - Clipperton Island (In other set with different code)
  HKG - Hong Kong
  MAC - Macau
  XDI - Diego Garcia
  XIB - Bajo Nuevo Bank
  XIK - Serranilla Bank
  XKX - Kosovo (In other set with different code)
  XMA - Macao (alt code)
  XSI - Scarborough Shoal

Only in GADM (8):
  ATA - Antarctica
  XAD - Akrotiri and Dhekelia
  XCA - Caspian Sea
  XCL - Clipperton Island (In other set with different code)
  XKO - Kosovo (In other set with different code)
  XPI - Paracel Islands
  XSP - Spratly Islands
  ZNC - Bonin Islands (Japan)
"""
all_countries_iso_a3 = {
    "ABW",
    "AFG",
    "AGO",
    "AIA",
    "ALA",
    "ALB",
    "AND",
    "ARE",
    "ARG",
    "ARM",
    "ASM",
    "ATF",
    "ATG",
    "AUS",
    "AUT",
    "AZE",
    "BDI",
    "BEL",
    "BEN",
    "BES",
    "BFA",
    "BGD",
    "BGR",
    "BHR",
    "BHS",
    "BIH",
    "BLM",
    "BLR",
    "BLZ",
    "BMU",
    "BOL",
    "BRA",
    "BRB",
    "BRN",
    "BTN",
    "BVT",
    "BWA",
    "CAF",
    "CAN",
    "CCK",
    "CHE",
    "CHL",
    "CHN",
    "CIV",
    "CMR",
    "COD",
    "COG",
    "COK",
    "COL",
    "COM",
    "CPV",
    "CRI",
    "CUB",
    "CUW",
    "CXR",
    "CYM",
    "CYP",
    "CZE",
    "DEU",
    "DJI",
    "DMA",
    "DNK",
    "DOM",
    "DZA",
    "ECU",
    "EGY",
    "ERI",
    "ESH",
    "ESP",
    "EST",
    "ETH",
    "FIN",
    "FJI",
    "FLK",
    "FRA",
    "FRO",
    "FSM",
    "GAB",
    "GBR",
    "GEO",
    "GGY",
    "GHA",
    "GIB",
    "GIN",
    "GLP",
    "GMB",
    "GNB",
    "GNQ",
    "GRC",
    "GRD",
    "GRL",
    "GTM",
    "GUF",
    "GUM",
    "GUY",
    "HMD",
    "HND",
    "HRV",
    "HTI",
    "HUN",
    "IDN",
    "IMN",
    "IND",
    "IOT",
    "IRL",
    "IRN",
    "IRQ",
    "ISL",
    "ISR",
    "ITA",
    "JAM",
    "JEY",
    "JOR",
    "JPN",
    "KAZ",
    "KEN",
    "KGZ",
    "KHM",
    "KIR",
    "KNA",
    "KOR",
    "KWT",
    "LAO",
    "LBN",
    "LBR",
    "LBY",
    "LCA",
    "LIE",
    "LKA",
    "LSO",
    "LTU",
    "LUX",
    "LVA",
    "MAF",
    "MAR",
    "MCO",
    "MDA",
    "MDG",
    "MDV",
    "MEX",
    "MHL",
    "MKD",
    "MLI",
    "MLT",
    "MMR",
    "MNE",
    "MNG",
    "MNP",
    "MOZ",
    "MRT",
    "MSR",
    "MTQ",
    "MUS",
    "MWI",
    "MYS",
    "MYT",
    "NAM",
    "NCL",
    "NER",
    "NFK",
    "NGA",
    "NIC",
    "NIU",
    "NLD",
    "NOR",
    "NPL",
    "NRU",
    "NZL",
    "OMN",
    "PAK",
    "PAN",
    "PCN",
    "PER",
    "PHL",
    "PLW",
    "PNG",
    "POL",
    "PRI",
    "PRK",
    "PRT",
    "PRY",
    "PSE",
    "PYF",
    "QAT",
    "REU",
    "ROU",
    "RUS",
    "RWA",
    "SAU",
    "SDN",
    "SEN",
    "SGP",
    "SGS",
    "SHN",
    "SJM",
    "SLB",
    "SLE",
    "SLV",
    "SMR",
    "SOM",
    "SPM",
    "SRB",
    "SSD",
    "STP",
    "SUR",
    "SVK",
    "SVN",
    "SWE",
    "SWZ",
    "SXM",
    "SYC",
    "SYR",
    "TCA",
    "TCD",
    "TGO",
    "THA",
    "TJK",
    "TKL",
    "TKM",
    "TLS",
    "TON",
    "TTO",
    "TUN",
    "TUR",
    "TUV",
    "TWN",
    "TZA",
    "UGA",
    "UKR",
    "UMI",
    "URY",
    "USA",
    "UZB",
    "VAT",
    "VCT",
    "VEN",
    "VGB",
    "VIR",
    "VNM",
    "VUT",
    "WLF",
    "WSM",
    "YEM",
    "ZAF",
    "ZMB",
    "ZWE",
}


"""
Get the root dir of the local IBF-seed-data repo so files can be written there.
This looks for the SEED_DATA_REPO_ROOT var in the /data/.env dir
"""


def get_seed_data_repo_path():
    env_path = Path(__file__).parent / "../.env"
    load_dotenv(env_path)

    seed_data_repo_root = os.environ.get("SEED_DATA_REPO_ROOT")

    if not seed_data_repo_root:
        raise RuntimeError(
            "SEED_DATA_REPO_ROOT is not set. See the readme for more info"
        )

    resolved_path = (env_path.parent / seed_data_repo_root).resolve()

    if not resolved_path.exists() or not resolved_path.is_dir():
        raise RuntimeError(f"Could not resolve seed data repo path: {resolved_path}")

    print(f"Seed data repo path used as: {resolved_path}")
    return resolved_path
