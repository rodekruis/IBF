// TODO: load alert configs from a dynamic source instead of a hardcoded const.
// The source can differ per hazard-type (e.g. GloFAS stations for floods, climate regions for drought).
// This should be expanded soon for the pipeline to get meaningful data from this
export const SEED_ALERT_CONFIGS = [
  {
    countryCodeIso3: 'KEN',
    hazardType: 'floods',
    spatialExtentName: 'G5142',
    spatialExtentPlaceCodes: ['KE030'],
    // TODO: re-evaluate lead-time-spectrum values
    temporalExtents: [
      {
        'lead-time-spectrum': [
          '0-day',
          '1-day',
          '2-day',
          '3-day',
          '4-day',
          '5-day',
          '6-day',
          '7-day',
        ],
      },
    ],
    severityClassLevels: [
      { label: 'low', threshold: 100 },
      { label: 'med', threshold: 200 },
      { label: 'high', threshold: 400 },
    ],
    probabilityClassLevels: [
      { label: 'low', threshold: 0.5 },
      { label: 'med', threshold: 0.65 },
      { label: 'high', threshold: 0.85 },
    ],
    alertClassMatrix: {
      low: { low: 'low', med: 'low', high: 'med' },
      med: { low: 'low', med: 'med', high: 'high' },
      high: { low: 'med', med: 'high', high: 'high' },
    },
    alertClassOrder: ['low', 'med', 'high'],
    triggerAlertClass: 'high',
    triggerLeadTimeDuration: 'P7D',
  },
  {
    countryCodeIso3: 'ETH',
    hazardType: 'drought',
    spatialExtentName: 'Belg',
    spatialExtentPlaceCodes: ['ET04'],
    temporalExtents: [
      { MAM: ['Mar', 'Apr', 'May'] },
      { OND: ['Oct', 'Nov', 'Dec'] },
    ],
    severityClassLevels: [{ label: 'warning', threshold: 0.2 }],
    probabilityClassLevels: [{ label: 'any', threshold: 0 }],
    alertClassMatrix: {
      warning: { any: 'warning' },
    },
    alertClassOrder: ['warning'],
    triggerAlertClass: null,
    triggerLeadTimeDuration: null,
  },
  {
    countryCodeIso3: 'KEN',
    hazardType: 'drought',
    spatialExtentName: 'test-region',
    spatialExtentPlaceCodes: ['KE030'],
    temporalExtents: [
      { MAM: ['Mar', 'Apr', 'May'] },
      { OND: ['Oct', 'Nov', 'Dec'] },
    ],
    severityClassLevels: [{ label: 'warning', threshold: 0.2 }],
    probabilityClassLevels: [{ label: 'any', threshold: 0 }],
    alertClassMatrix: {
      warning: { any: 'warning' },
    },
    alertClassOrder: ['warning'],
    triggerAlertClass: null,
    triggerLeadTimeDuration: null,
  },
];
