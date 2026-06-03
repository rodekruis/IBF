import { HazardType } from '@api-service/src/shared-enums';

export interface SeedAlertConfig {
  readonly countryCodeIso3: string;
  readonly hazardType: string;
  readonly spatialExtentName: string;
  readonly spatialExtentPlaceCodes: string[];
  readonly temporalExtents: Record<string, string[] | number[]>[];
  readonly severityClassLevels: { label: string; threshold: number }[];
  readonly probabilityClassLevels: { label: string; threshold: number }[];
  readonly alertClassMatrix: Record<string, Record<string, string>>;
  readonly alertClassOrder: string[];
  readonly triggerAlertClass: string | null;
  readonly triggerLeadTimeDuration: string | null;
}

// --- FLOODS: loaded dynamically from seed-data repo in seed-init.ts ---

export const FLOOD_LEAD_TIME_SPECTRUM = [
  '0-day',
  '1-day',
  '2-day',
  '3-day',
  '4-day',
  '5-day',
  '6-day',
  '7-day',
];

// TODO: move severity/probability thresholds out of alert-config into a country*hazardType-config
export const FLOOD_SEVERITY_CLASS_LEVELS = [
  { label: 'low', threshold: 1.5 },
  { label: 'med', threshold: 5 },
  { label: 'high', threshold: 20 },
];

export const FLOOD_PROBABILITY_CLASS_LEVELS = [
  { label: 'low', threshold: 0.5 },
  { label: 'med', threshold: 0.65 },
  { label: 'high', threshold: 0.85 },
];

export const FLOOD_ALERT_CLASS_MATRIX = {
  low: { low: 'low', med: 'low', high: 'med' },
  med: { low: 'low', med: 'med', high: 'high' },
  high: { low: 'med', med: 'high', high: 'high' },
};

export const FLOOD_ALERT_CLASS_ORDER = ['low', 'med', 'high'];

// --- DROUGHT: in-code config ---

const DROUGHT_SEVERITY_CLASS_LEVELS = [{ label: 'warning', threshold: 0.2 }];

const DROUGHT_PROBABILITY_CLASS_LEVELS = [{ label: 'any', threshold: 0 }];

const DROUGHT_ALERT_CLASS_MATRIX = {
  warning: { any: 'warning' },
};

const DROUGHT_ALERT_CLASS_ORDER = ['warning'];

function createDroughtAlertConfig(
  countryCodeIso3: string,
  regionName: string,
  placeCodes: string[],
  seasons: Record<string, number[]>[],
): SeedAlertConfig {
  return {
    countryCodeIso3,
    hazardType: HazardType.drought,
    spatialExtentName: regionName,
    spatialExtentPlaceCodes: placeCodes,
    temporalExtents: seasons,
    severityClassLevels: DROUGHT_SEVERITY_CLASS_LEVELS,
    probabilityClassLevels: DROUGHT_PROBABILITY_CLASS_LEVELS,
    alertClassMatrix: DROUGHT_ALERT_CLASS_MATRIX,
    alertClassOrder: DROUGHT_ALERT_CLASS_ORDER,
    triggerAlertClass: null,
    triggerLeadTimeDuration: null,
  };
}

// --- DROUGHT: ETH (from droughtSeasonRegions + droughtRegions) ---
// TODO: consider loading from seed-data repo as well

const ETH_DROUGHT_CONFIGS: SeedAlertConfig[] = [
  createDroughtAlertConfig(
    'ETH',
    'Belg',
    [
      'ET0104',
      'ET0106',
      'ET0107',
      'ET0303',
      'ET0304',
      'ET0305',
      'ET0310',
      'ET0406',
      'ET0407',
      'ET0408',
      'ET0409',
      'ET0410',
      'ET0415',
      'ET0417',
      'ET0701',
      'ET0702',
      'ET0703',
      'ET0705',
      'ET0706',
      'ET0707',
      'ET0710',
      'ET0713',
      'ET0714',
      'ET0715',
      'ET0717',
      'ET0720',
      'ET0721',
      'ET0722',
      'ET0723',
      'ET0724',
      'ET1301',
      'ET1600',
    ],
    [{ MAM: [2, 3, 4, 5] }, { JAS: [6, 7, 8, 9] }],
  ),
  createDroughtAlertConfig(
    'ETH',
    'Meher',
    [
      'ET0101',
      'ET0102',
      'ET0105',
      'ET0301',
      'ET0302',
      'ET0306',
      'ET0307',
      'ET0308',
      'ET0309',
      'ET0311',
      'ET0312',
      'ET0401',
      'ET0402',
      'ET0403',
      'ET0404',
      'ET0405',
      'ET0413',
      'ET0416',
      'ET0418',
      'ET0419',
      'ET0420',
      'ET0602',
      'ET0603',
      'ET0604',
      'ET0605',
      'ET0708',
      'ET0709',
      'ET0711',
      'ET0716',
      'ET0718',
      'ET0719',
      'ET1201',
      'ET1202',
      'ET1203',
      'ET1204',
      'ET1401',
    ],
    [{ JAS: [6, 7, 8, 9] }],
  ),
  createDroughtAlertConfig(
    'ETH',
    'Northern',
    [
      'ET0103',
      'ET0201',
      'ET0202',
      'ET0203',
      'ET0204',
      'ET0205',
      'ET0501',
      'ET1501',
      'ET1502',
    ],
    [{ MAM: [3, 4, 5] }, { JAS: [7, 8, 9] }],
  ),
  createDroughtAlertConfig(
    'ETH',
    'Southern',
    [
      'ET0411',
      'ET0412',
      'ET0414',
      'ET0421',
      'ET0502',
      'ET0503',
      'ET0504',
      'ET0505',
      'ET0506',
      'ET0507',
      'ET0508',
      'ET0509',
      'ET0510',
      'ET0511',
      'ET0712',
    ],
    [{ MAM: [3, 4, 5] }, { OND: [10, 11, 12] }],
  ),
];

// --- DROUGHT: KEN ---

const KEN_DROUGHT_CONFIGS: SeedAlertConfig[] = [
  createDroughtAlertConfig(
    'KEN',
    'National',
    [],
    [{ MAM: [3, 4, 5] }, { OND: [10, 11, 12] }],
  ),
];

// --- DROUGHT: UGA ---

const UGA_DROUGHT_CONFIGS: SeedAlertConfig[] = [
  createDroughtAlertConfig(
    'UGA',
    'Karamoja',
    [
      'UG3066',
      'UG3070',
      'UG3074',
      'UG3077',
      'UG3082',
      'UG3097',
      'UG3064',
      'UG3069',
      'UG3075',
      'UG3080',
      'UG3086',
      'UG3088',
      'UG3089',
      'UG3090',
      'UG3065',
      'UG3072',
      'UG3078',
      'UG3085',
      'UG3093',
      'UG3099',
    ],
    [{ Karamoja: [4, 5, 6, 7, 8, 9, 10] }],
  ),
  createDroughtAlertConfig(
    'UGA',
    'Central',
    [
      'UG3092',
      'UG3094',
      'UG4101',
      'UG4105',
      'UG4107',
      'UG4108',
      'UG4119',
      'UG4126',
      'UG4127',
      'UG4129',
      'UG4131',
      'UG4135',
      'UG2028',
      'UG2035',
      'UG2036',
      'UG2037',
      'UG2048',
      'UG2059',
      'UG2063',
      'UG4102',
      'UG4106',
      'UG4111',
      'UG4112',
      'UG4117',
      'UG4118',
      'UG4120',
      'UG4125',
      'UG2030',
      'UG2031',
      'UG2038',
      'UG2039',
      'UG2040',
      'UG2043',
      'UG2044',
      'UG2051',
      'UG2053',
      'UG2055',
      'UG2057',
      'UG2029',
      'UG2033',
      'UG2034',
      'UG2045',
      'UG2050',
      'UG2052',
      'UG2054',
      'UG2056',
      'UG2061',
      'UG1008',
      'UG4109',
      'UG4114',
      'UG4121',
      'UG4130',
      'UG4132',
      'UG4133',
      'UG3067',
      'UG3068',
      'UG3071',
      'UG3073',
      'UG3079',
      'UG3081',
      'UG3083',
      'UG3095',
      'UG3096',
      'UG1001',
      'UG1004',
      'UG1009',
      'UG1010',
      'UG1011',
      'UG1012',
      'UG1014',
      'UG1018',
      'UG1020',
      'UG1021',
      'UG1022',
      'UG1023',
      'UG1026',
      'UG1002',
      'UG1003',
      'UG1005',
      'UG1006',
      'UG1007',
      'UG1013',
      'UG1015',
      'UG1016',
      'UG1017',
      'UG1019',
      'UG1024',
      'UG1025',
      'UG2027',
      'UG2032',
      'UG2041',
      'UG2046',
      'UG2047',
      'UG2049',
      'UG2058',
      'UG2060',
      'UG2062',
      'UG4103',
      'UG4104',
      'UG4110',
      'UG4113',
      'UG4115',
      'UG4123',
      'UG4124',
      'UG4128',
      'UG3091',
      'UG3098',
      'UG3100',
    ],
    [{ MAM: [3, 4, 5] }, { OND: [9, 10, 11] }],
  ),
];

// --- DROUGHT: ZMB ---

const ZMB_DROUGHT_CONFIGS: SeedAlertConfig[] = [
  createDroughtAlertConfig(
    'ZMB',
    'National',
    [],
    [{ OND: [10, 11, 12, 1, 2, 3] }],
  ),
];

// --- DROUGHT: ZWE ---

const ZWE_DROUGHT_CONFIGS: SeedAlertConfig[] = [
  createDroughtAlertConfig('ZWE', 'National', [], [{ MAM: [4, 5, 6, 7, 8] }]),
];

// --- DROUGHT: LSO ---

const LSO_DROUGHT_CONFIGS: SeedAlertConfig[] = [
  createDroughtAlertConfig(
    'LSO',
    'National',
    [],
    [{ Drought: [10, 11, 12, 1, 2, 3] }],
  ),
];

export const SEED_DROUGHT_ALERT_CONFIGS: SeedAlertConfig[] = [
  ...ETH_DROUGHT_CONFIGS,
  ...KEN_DROUGHT_CONFIGS,
  ...UGA_DROUGHT_CONFIGS,
  ...ZMB_DROUGHT_CONFIGS,
  ...ZWE_DROUGHT_CONFIGS,
  ...LSO_DROUGHT_CONFIGS,
];
