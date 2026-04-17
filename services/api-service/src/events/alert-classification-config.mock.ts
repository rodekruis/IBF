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
    alertClassOrder: ['low', 'med', 'high'], // TODO: this is needed to fix the order, but it feels overkill. Re-evaluate later.
    triggerAlertClass: 'high',
    triggerLeadTimeDuration: 'P7D', // ISO 8601 duration: P7D = 7 days, P3M = 3 months, etc.
  },
  [HazardType.drought]: {
    severityClassLevels: [{ label: 'warning', threshold: 0.2 }], // TODO: currently we assume the direction to always be 'higher than'. This may not hold for drougth/all hazard types.
    probabilityClassLevels: [{ label: 'any', threshold: 0 }], // the 0-threshold implies there is no real check on probability for drought alerts in this mock config, and that any probability value would lead to the same alert class as long as the severity threshold is met
    alertClassMatrix: {
      warning: { any: 'warning' },
    },
    alertClassOrder: ['warning'],
  },
};
