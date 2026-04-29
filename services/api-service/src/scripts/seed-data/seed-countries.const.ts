export interface SeedCountry {
  readonly countryCodeIso3: string;
  readonly countryCodeIso2: string;
  readonly countryName: string;
  readonly deepestAdminLevel: number;
}

// TODO: consider loading IBF countries from a dynamic source instead of a hardcoded const
export const SEED_COUNTRIES: SeedCountry[] = [
  {
    countryCodeIso3: 'ETH',
    countryCodeIso2: 'ET',
    countryName: 'Ethiopia',
    deepestAdminLevel: 3,
  },
  {
    countryCodeIso3: 'KEN',
    countryCodeIso2: 'KE',
    countryName: 'Kenya',
    deepestAdminLevel: 3,
  },
  {
    countryCodeIso3: 'MWI',
    countryCodeIso2: 'MW',
    countryName: 'Malawi',
    deepestAdminLevel: 3,
  },
  {
    countryCodeIso3: 'PHL',
    countryCodeIso2: 'PH',
    countryName: 'Philippines',
    deepestAdminLevel: 3,
  },
  {
    countryCodeIso3: 'ZMB',
    countryCodeIso2: 'ZM',
    countryName: 'Zambia',
    deepestAdminLevel: 3,
  },
  {
    countryCodeIso3: 'UGA',
    countryCodeIso2: 'UG',
    countryName: 'Uganda',
    deepestAdminLevel: 4,
  },
  {
    countryCodeIso3: 'LSO',
    countryCodeIso2: 'LS',
    countryName: 'Lesotho',
    deepestAdminLevel: 2,
  },
  {
    countryCodeIso3: 'ZWE',
    countryCodeIso2: 'ZW',
    countryName: 'Zimbabwe',
    deepestAdminLevel: 3,
  },
  {
    countryCodeIso3: 'SSD',
    countryCodeIso2: 'SS',
    countryName: 'South Sudan',
    deepestAdminLevel: 3,
  },
];
