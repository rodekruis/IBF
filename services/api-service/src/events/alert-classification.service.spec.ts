import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { AlertClassificationInput } from '@api-service/src/events/alert-classification.service';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
import { AlertClassificationConfigsService } from '@api-service/src/events/alert-classification-configs.service';
import { AlertClassificationConfig } from '@api-service/src/events/interfaces/alert-classification-config';
import {
  buildAlert,
  buildSeverityData,
} from '@api-service/test/helpers/alert.helper';

function toClassificationInput(
  alert: ReturnType<typeof buildAlert>,
  hazardType: HazardType = HazardType.floods,
  issuedAt: Date = new Date(),
): AlertClassificationInput {
  return {
    hazardType,
    issuedAt,
    severity: alert.severity,
  };
}

// These unit-tests should use specific fixed test config, and not the general mock-config, which will eventually be replaced by a configurable database table.
const testFloodConfig: AlertClassificationConfig = {
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
    low: { low: null, med: null, high: 'low' },
    med: { low: null, med: 'low', high: 'med' },
    high: { low: 'low', med: 'med', high: 'high' },
  },
  alertClassOrder: ['low', 'med', 'high'],
  triggerAlertClass: 'high',
  triggerLeadTimeDuration: 'P7D',
};

const testDroughtConfig: AlertClassificationConfig = {
  severityClassLevels: [{ label: 'warning', threshold: 0.2 }],
  probabilityClassLevels: [{ label: 'any', threshold: 0 }],
  alertClassMatrix: {
    warning: { any: 'warning' },
  },
  alertClassOrder: ['warning'],
};

describe('AlertClassificationService', () => {
  let service: AlertClassificationService;
  let alertClassificationConfigsService: AlertClassificationConfigsService;

  beforeEach(() => {
    const configsByHazardType: Record<string, AlertClassificationConfig> = {
      [HazardType.floods]: testFloodConfig,
      [HazardType.drought]: testDroughtConfig,
    };

    alertClassificationConfigsService = new AlertClassificationConfigsService();
    jest
      .spyOn(alertClassificationConfigsService, 'getByHazardType')
      .mockImplementation(
        (hazardType: string): AlertClassificationConfig | undefined =>
          configsByHazardType[hazardType],
      );
    service = new AlertClassificationService(alertClassificationConfigsService);
  });

  describe('classifyAlert', () => {
    it('should throw when no config exists for hazard type', () => {
      const alert = buildAlert();
      expect(() =>
        service.classifyAlert(
          toClassificationInput(alert, 'unknown' as HazardType),
        ),
      ).toThrow("No classification config found for hazard type 'unknown'");
    });

    describe('floods', () => {
      it('should return null alertClass when severity is below all thresholds', () => {
        const alert = buildAlert({
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-04-02T00:00:00Z'),
            medianValue: 50,
            runValues: [30, 40],
          }),
        });

        const result = service.classifyAlert(toClassificationInput(alert));
        expect(result.alertClass).toBeNull();
      });

      it('should return low alertClass for low severity with high probability', () => {
        const alert = buildAlert({
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-04-02T00:00:00Z'),
            medianValue: 120,
            runValues: [150, 150, 150, 150, 150, 150, 150, 150, 150, 150],
          }),
        });

        const result = service.classifyAlert(toClassificationInput(alert));
        expect(result.alertClass).toBe('low');
      });

      it('should return high alertClass for high severity with high probability', () => {
        // median=500 → severity 'high' (≥400), all runs exceed 400 → prob=1.0 → 'high'
        // matrix[high][high] = 'high'
        const alert = buildAlert({
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-04-02T00:00:00Z'),
            medianValue: 500,
            runValues: [500, 500, 500, 500, 500, 500, 500, 500, 500, 500],
          }),
        });

        const result = service.classifyAlert(toClassificationInput(alert));
        expect(result.alertClass).toBe('high');
      });

      it('should pick highest alertClass across multiple lead times and compute correct dates', () => {
        // LT1: Apr 1–2, median=120, all runs=150 → 'low'
        // LT2: Apr 3–5, median=500, all runs=500 → 'high'
        const alert = buildAlert({
          severity: [
            ...buildSeverityData({
              start: new Date('2026-04-01T00:00:00Z'),
              end: new Date('2026-04-02T00:00:00Z'),
              medianValue: 120,
              runValues: [150, 150, 150],
            }),
            ...buildSeverityData({
              start: new Date('2026-04-03T00:00:00Z'),
              end: new Date('2026-04-05T00:00:00Z'),
              medianValue: 500,
              runValues: [500, 500, 500],
            }),
          ],
        });

        const result = service.classifyAlert(toClassificationInput(alert));
        expect(result.alertClass).toBe('high');
        expect(result.startAt).toEqual(new Date('2026-04-01T00:00:00Z'));
        expect(result.endAt).toEqual(new Date('2026-04-05T00:00:00Z'));
        expect(result.reachesPeakAlertClassAt).toEqual(
          new Date('2026-04-03T00:00:00Z'),
        );
      });

      describe('trigger', () => {
        it('should be true when high alertClass peaks within lead time duration', () => {
          const alert = buildAlert({
            severity: buildSeverityData({
              start: new Date('2026-04-01T00:00:00Z'),
              end: new Date('2026-04-02T00:00:00Z'),
              medianValue: 500,
              runValues: [500, 500, 500],
            }),
          });

          const result = service.classifyAlert(
            toClassificationInput(
              alert,
              HazardType.floods,
              new Date('2026-03-30T00:00:00Z'),
            ),
          );
          expect(result.trigger).toBe(true);
        });

        it('should be false when peak exceeds trigger lead time duration', () => {
          const alert = buildAlert({
            severity: buildSeverityData({
              start: new Date('2026-04-10T00:00:00Z'),
              end: new Date('2026-04-11T00:00:00Z'),
              medianValue: 500,
              runValues: [500, 500, 500],
            }),
          });

          const result = service.classifyAlert(
            toClassificationInput(
              alert,
              HazardType.floods,
              new Date('2026-03-30T00:00:00Z'),
            ),
          );
          expect(result.alertClass).toBe('high');
          expect(result.trigger).toBe(false);
        });

        it('should be false when alertClass is below trigger threshold', () => {
          const alert = buildAlert({
            severity: buildSeverityData({
              start: new Date('2026-04-01T00:00:00Z'),
              end: new Date('2026-04-02T00:00:00Z'),
              medianValue: 120,
              runValues: [150, 150, 150],
            }),
          });

          const result = service.classifyAlert(toClassificationInput(alert));
          expect(result.alertClass).toBe('low');
          expect(result.trigger).toBe(false);
        });
      });
    });

    describe('drought', () => {
      it('should classify as warning with no trigger', () => {
        const alert = buildAlert({
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-07-01T00:00:00Z'),
            medianValue: 0.3,
            runValues: [0.4],
          }),
        });

        const result = service.classifyAlert(
          toClassificationInput(alert, HazardType.drought),
        );
        expect(result.alertClass).toBe('warning');
        expect(result.trigger).toBe(false);
      });
    });

    it('should classify using default config lookup for known hazard type', () => {
      const defaultService = new AlertClassificationService(
        new AlertClassificationConfigsService(),
      );
      const result = defaultService.classifyAlert(
        toClassificationInput(buildAlert()),
      );
      expect(result.alertClass).not.toBeNull();
    });
  });
});
