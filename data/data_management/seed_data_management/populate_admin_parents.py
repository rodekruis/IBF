"""
This adds the missing admin parent codes on the admin data imported from IBF v1
This can't be calculated easily, since countries don't follow a standard.
For instance, here are 4 codes, all for admin 3:

"AO01002004"
"BF130002"
"CF1111"
"KM111"

The naming of these will follow the values from the UGA data (which already had this).
    "features": [
        {
        "type": "Feature",
        "properties": {
            "ADM4_EN": "Abako",
            "ADM4_PCODE": "UG30670101",
            "ADM3_EN": "Moroto",
            "ADM3_PCODE": "UG306701",
            "ADM2_EN": "Alebtong",
            "ADM2_PCODE": "UG3067",
            "ADM1_EN": "Northern",
            "ADM1_PCODE": "UG3",
            "ADM0_EN": "Uganda",
            "ADM0_PCODE": "UG",
        }

This script does the following:
- Look at all files in the dir, make a list of the country names, and print them.
- Foreach country, open all existing admin boundary files (1,2,3, and sometimes 4) in a list.
- Apply parent code and name children (all depths) that starts with the parent code.
  - If the parent code is invalid (empty, missing), print an error.
  - If a child already has a parent code, make sure it matches. If not, print an error.
- Repeat for parent levels (adm1, adm2, and adm3 (if adm4 exists))
- Save the files over the old ones.

Once all are done, go back and open all admin files for a country.
- Check adm3 and adm4 files.
- Print if any data is missing. Print any errors
   - It should have the PCODE and name (_EN) for the current adm level, and all parents.
   - The higher admin levels (0,1,2) PCODE string shuld be a subset of the lower levels.
"""

from pathlib import Path

from shared.data_helpers import get_seed_data_repo_path

BASE_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_REPO_DIR) / "admin-areas"
OUTPUT_DIR = Path(BASE_REPO_DIR) / "admin-areas-output"
