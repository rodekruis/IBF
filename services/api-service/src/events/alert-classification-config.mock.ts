import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { AlertClassificationConfig } from '@api-service/src/events/interfaces/alert-classification-config';

// TODO: replace with alert-config DB table lookup per alertName/hazardType/country
export const MOCK_ALERT_CLASSIFICATION_CONFIGS: Record<
  string,
  AlertClassificationConfig
> = {
  [HazardType.floods]: {
    severityClassLevels: [
      { label: 'low', threshold: 100 },
      { label: 'mid', threshold: 200 },
      { label: 'high', threshold: 400 },
    ],
    probabilityClassLevels: [
      { label: 'low', threshold: 0.5 },
      { label: 'mid', threshold: 0.65 },
      { label: 'high', threshold: 0.85 },
    ],
    alertClassMatrix: {
      low: { low: null, mid: null, high: 'min' },
      mid: { low: null, mid: 'min', high: 'med' },
      high: { low: 'min', mid: 'med', high: 'max' },
    },
    triggerAlertClass: 'max',
    // ISO 8601 duration: P7D = 7 days, P3M = 3 months, etc.
    triggerLeadTimeDuration: 'P7D',
  },
  [HazardType.drought]: {
    severityClassLevels: [{ label: 'severe', threshold: 0.2 }],
    probabilityClassLevels: [{ label: 'any', threshold: 0 }],
    alertClassMatrix: {
      severe: { any: 'severe' },
    },
  },
};
