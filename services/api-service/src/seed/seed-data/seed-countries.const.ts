import { HazardType } from '@api-service/src/shared-enums';

interface AdminLevelLabel {
  readonly singular: string;
  readonly plural: string;
}

export interface SeedCountry {
  readonly countryCodeIso3: string;
  readonly countryCodeIso2: string;
  readonly countryName: string;
  readonly deepestAdminLevel: number;
  readonly adminLevelLabels: Record<string, AdminLevelLabel>;
  readonly hazardTypes: HazardType[];
}

// TODO: consider loading IBF countries from a dynamic source instead of a hardcoded const
export const SEED_COUNTRIES: SeedCountry[] = [
  {
    countryCodeIso3: 'ETH',
    countryCodeIso2: 'ET',
    countryName: 'Ethiopia',
    deepestAdminLevel: 3,
    adminLevelLabels: {
      '1': { singular: 'Region', plural: 'Regions' },
      '2': { singular: 'Zone', plural: 'Zones' },
      '3': { singular: 'Woreda', plural: 'Woredas' },
    },
    hazardTypes: [HazardType.floods, HazardType.drought],
  },
  {
    countryCodeIso3: 'KEN',
    countryCodeIso2: 'KE',
    countryName: 'Kenya',
    deepestAdminLevel: 3,
    adminLevelLabels: {
      '1': { singular: 'County', plural: 'Counties' },
      '2': { singular: 'Subcounty', plural: 'Subcounties' },
      '3': { singular: 'Ward', plural: 'Wards' },
    },
    hazardTypes: [HazardType.floods, HazardType.drought],
  },
  {
    countryCodeIso3: 'MWI',
    countryCodeIso2: 'MW',
    countryName: 'Malawi',
    deepestAdminLevel: 3,
    adminLevelLabels: {
      '1': { singular: 'Region', plural: 'Regions' },
      '2': { singular: 'District', plural: 'Districts' },
      '3': {
        singular: 'Traditional Authority',
        plural: 'Traditional Authorities',
      },
    },
    hazardTypes: [HazardType.floods],
  },
  {
    countryCodeIso3: 'PHL',
    countryCodeIso2: 'PH',
    countryName: 'Philippines',
    deepestAdminLevel: 3,
    adminLevelLabels: {
      '1': { singular: 'Region', plural: 'Regions' },
      '2': { singular: 'Province', plural: 'Provinces' },
      '3': { singular: 'Municipality', plural: 'Municipalities' },
      '4': { singular: 'Barangay', plural: 'Barangays' },
    },
    hazardTypes: [HazardType.floods, HazardType.tropicalCyclone],
  },
  {
    countryCodeIso3: 'ZMB',
    countryCodeIso2: 'ZM',
    countryName: 'Zambia',
    deepestAdminLevel: 4,
    adminLevelLabels: {
      '1': { singular: 'Province', plural: 'Provinces' },
      '2': { singular: 'District', plural: 'Districts' },
      '3': { singular: 'Constituency', plural: 'Constituencies' },
      '4': { singular: 'Ward', plural: 'Wards' },
    },
    hazardTypes: [HazardType.floods, HazardType.drought],
  },
  {
    countryCodeIso3: 'UGA',
    countryCodeIso2: 'UG',
    countryName: 'Uganda',
    deepestAdminLevel: 4,
    adminLevelLabels: {
      '1': { singular: 'Region', plural: 'Regions' },
      '2': { singular: 'District', plural: 'Districts' },
      '3': { singular: 'County', plural: 'Counties' },
      '4': { singular: 'Sub-County', plural: 'Sub-Counties' },
    },
    hazardTypes: [HazardType.floods, HazardType.drought],
  },
  {
    countryCodeIso3: 'LSO',
    countryCodeIso2: 'LS',
    countryName: 'Lesotho',
    deepestAdminLevel: 2,
    adminLevelLabels: {
      '1': { singular: 'District', plural: 'Districts' },
      '2': { singular: 'Constituency', plural: 'Constituencies' },
      '3': { singular: 'Community council', plural: 'Community councils' },
    },
    hazardTypes: [HazardType.drought],
  },
  {
    countryCodeIso3: 'ZWE',
    countryCodeIso2: 'ZW',
    countryName: 'Zimbabwe',
    deepestAdminLevel: 3,
    adminLevelLabels: {
      '1': { singular: 'Province', plural: 'Provinces' },
      '2': { singular: 'District', plural: 'Districts' },
      '3': { singular: 'Ward', plural: 'Wards' },
    },
    hazardTypes: [HazardType.drought],
  },
  {
    countryCodeIso3: 'SSD',
    countryCodeIso2: 'SS',
    countryName: 'South Sudan',
    deepestAdminLevel: 3,
    adminLevelLabels: {
      '1': { singular: 'State', plural: 'States' },
      '2': { singular: 'County', plural: 'Counties' },
      '3': { singular: 'Payam', plural: 'Payams' },
    },
    hazardTypes: [HazardType.floods],
  },
];
