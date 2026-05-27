import { HazardType } from '@api-service/src/alerts/enum/shared-enums';

export interface SeedCountry {
  readonly countryCodeIso3: string;
  readonly countryCodeIso2: string;
  readonly countryName: string;
  readonly deepestAdminLevel: number;
  readonly hazardTypes: HazardType[];
}

// TODO: consider loading IBF countries from a dynamic source instead of a hardcoded const
export const SEED_COUNTRIES: SeedCountry[] = [
  {
    countryCodeIso3: 'ETH',
    countryCodeIso2: 'ET',
    countryName: 'Ethiopia',
    deepestAdminLevel: 3,
    hazardTypes: [HazardType.floods, HazardType.drought],
  },
  {
    countryCodeIso3: 'KEN',
    countryCodeIso2: 'KE',
    countryName: 'Kenya',
    deepestAdminLevel: 3,
    hazardTypes: [HazardType.floods, HazardType.drought],
  },
  {
    countryCodeIso3: 'MWI',
    countryCodeIso2: 'MW',
    countryName: 'Malawi',
    deepestAdminLevel: 3,
    hazardTypes: [HazardType.floods],
  },
  {
    countryCodeIso3: 'PHL',
    countryCodeIso2: 'PH',
    countryName: 'Philippines',
    deepestAdminLevel: 3,
    hazardTypes: [HazardType.floods],
  },
  {
    countryCodeIso3: 'ZMB',
    countryCodeIso2: 'ZM',
    countryName: 'Zambia',
    deepestAdminLevel: 3,
    hazardTypes: [HazardType.floods, HazardType.drought],
  },
  {
    countryCodeIso3: 'UGA',
    countryCodeIso2: 'UG',
    countryName: 'Uganda',
    deepestAdminLevel: 4,
    hazardTypes: [HazardType.floods, HazardType.drought],
  },
  {
    countryCodeIso3: 'LSO',
    countryCodeIso2: 'LS',
    countryName: 'Lesotho',
    deepestAdminLevel: 2,
    hazardTypes: [HazardType.drought],
  },
  {
    countryCodeIso3: 'ZWE',
    countryCodeIso2: 'ZW',
    countryName: 'Zimbabwe',
    deepestAdminLevel: 3,
    hazardTypes: [HazardType.drought],
  },
  {
    countryCodeIso3: 'SSD',
    countryCodeIso2: 'SS',
    countryName: 'South Sudan',
    deepestAdminLevel: 3,
    hazardTypes: [HazardType.floods],
  },
];
