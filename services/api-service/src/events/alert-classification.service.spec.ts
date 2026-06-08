import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { AlertClassificationInput } from '@api-service/src/events/alert-classification.service';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
import {
  AlertClass,
  AlertClassificationLevel,
  HazardType,
} from '@api-service/src/shared-enums';
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

const {
  singleThreshold: single,
  Low: low,
  Med: med,
  High: high,
} = AlertClassificationLevel;

// Severity thresholds: low >= 1.5, med >= 5, high >= 20 (return period)
// Probability thresholds: low >= 50%, med >= 65%, high >= 85% (fraction of runs exceeding severity threshold)
// Trigger: alertClass must be 'high' and peak must be within 7 days of issuedAt
const testFloodConfig: Partial<AlertConfigResponseDto> = {
  hazardType: HazardType.floods,
  severityClassLevels: [
    { label: low, threshold: 1.5 },
    { label: med, threshold: 5 },
    { label: high, threshold: 20 },
  ],
  probabilityClassLevels: [
    { label: low, threshold: 0.5 },
    { label: med, threshold: 0.65 },
    { label: high, threshold: 0.85 },
  ],
  triggerAlertClass: AlertClass.High,
  triggerLeadTimeDuration: 'P7D',
};

const testDroughtConfig: Partial<AlertConfigResponseDto> = {
  hazardType: HazardType.drought,
  severityClassLevels: [{ label: single, threshold: 0.2 }],
  probabilityClassLevels: [{ label: single, threshold: 0 }],
};

describe('AlertClassificationService', () => {
  let service: AlertClassificationService;
  let alertConfigsService: AlertConfigsService;

  beforeEach(() => {
    const configsByHazardType: Record<string, AlertConfigResponseDto> = {
      [HazardType.floods]: testFloodConfig as AlertConfigResponseDto,
      [HazardType.drought]: testDroughtConfig as AlertConfigResponseDto,
    };

    alertConfigsService = new AlertConfigsService(null as never);

    jest
      .spyOn(alertConfigsService, 'getAlertConfigs')
      .mockImplementation(({ hazardType }) =>
        Promise.resolve(
          hazardType && configsByHazardType[hazardType]
            ? [configsByHazardType[hazardType]]
            : [],
        ),
      );
    service = new AlertClassificationService(alertConfigsService);
  });

  describe('classifyAlert', () => {
    it('should throw when no config exists for hazard type', async () => {
      const alert = buildAlert();
      await expect(
        service.classifyAlert(
          toClassificationInput(alert, 'unknown' as HazardType),
        ),
      ).rejects.toThrow(
        "No classification config found for hazard type 'unknown'",
      );
    });

    describe('floods', () => {
      it('should return null alertClass when severity is below all thresholds', async () => {
        const alert = buildAlert({
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-04-02T00:00:00Z'),
            medianValue: 1.0,
            runValues: [0.5, 1.0],
          }),
        });

        const result = await service.classifyAlert(
          toClassificationInput(alert),
        );
        expect(result.alertClass).toBeNull();
      });

      it('should return med alertClass for low severity with high probability', async () => {
        const alert = buildAlert({
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-04-02T00:00:00Z'),
            medianValue: 2,
            runValues: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
          }),
        });

        const result = await service.classifyAlert(
          toClassificationInput(alert),
        );
        expect(result.alertClass).toBe(AlertClassificationLevel.Med);
      });

      it('should return high alertClass for high severity with high probability', async () => {
        const alert = buildAlert({
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-04-02T00:00:00Z'),
            medianValue: 25,
            runValues: [25, 25, 25, 25, 25, 25, 25, 25, 25, 25],
          }),
        });

        const result = await service.classifyAlert(
          toClassificationInput(alert),
        );
        expect(result.alertClass).toBe(AlertClassificationLevel.High);
      });

      it('should pick highest alertClass across multiple lead times and compute correct dates', async () => {
        // LT1: Apr 1–2, median=2, all runs=2 → 'low'
        // LT2: Apr 3–5, median=25, all runs=25 → 'high'
        const alert = buildAlert({
          severity: [
            ...buildSeverityData({
              start: new Date('2026-04-01T00:00:00Z'),
              end: new Date('2026-04-02T00:00:00Z'),
              medianValue: 2,
              runValues: [2, 2, 2],
            }),
            ...buildSeverityData({
              start: new Date('2026-04-03T00:00:00Z'),
              end: new Date('2026-04-05T00:00:00Z'),
              medianValue: 25,
              runValues: [25, 25, 25],
            }),
          ],
        });

        const result = await service.classifyAlert(
          toClassificationInput(alert),
        );
        expect(result.alertClass).toBe(AlertClassificationLevel.High);
        expect(result.startAt).toEqual(new Date('2026-04-01T00:00:00Z'));
        expect(result.endAt).toEqual(new Date('2026-04-05T00:00:00Z'));
        expect(result.reachesPeakAlertClassAt).toEqual(
          new Date('2026-04-03T00:00:00Z'),
        );
      });

      describe('trigger', () => {
        it('should be true when high alertClass peaks within lead time duration', async () => {
          const alert = buildAlert({
            severity: buildSeverityData({
              start: new Date('2026-04-01T00:00:00Z'),
              end: new Date('2026-04-02T00:00:00Z'),
              medianValue: 25,
              runValues: [25, 25, 25],
            }),
          });

          const result = await service.classifyAlert(
            toClassificationInput(
              alert,
              HazardType.floods,
              new Date('2026-03-30T00:00:00Z'),
            ),
          );
          expect(result.trigger).toBe(true);
        });

        it('should be false when peak exceeds trigger lead time duration', async () => {
          const alert = buildAlert({
            severity: buildSeverityData({
              start: new Date('2026-04-10T00:00:00Z'),
              end: new Date('2026-04-11T00:00:00Z'),
              medianValue: 25,
              runValues: [25, 25, 25],
            }),
          });

          const result = await service.classifyAlert(
            toClassificationInput(
              alert,
              HazardType.floods,
              new Date('2026-03-30T00:00:00Z'),
            ),
          );
          expect(result.alertClass).toBe(AlertClassificationLevel.High);
          expect(result.trigger).toBe(false);
        });

        it('should be false when alertClass is below trigger threshold', async () => {
          const alert = buildAlert({
            severity: buildSeverityData({
              start: new Date('2026-04-01T00:00:00Z'),
              end: new Date('2026-04-02T00:00:00Z'),
              medianValue: 2,
              runValues: [2, 2, 2],
            }),
          });

          const result = await service.classifyAlert(
            toClassificationInput(alert),
          );
          expect(result.alertClass).toBe(AlertClassificationLevel.Med);
          expect(result.trigger).toBe(false);
        });
      });
    });

    describe('drought', () => {
      it('should classify as high with no trigger', async () => {
        const alert = buildAlert({
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-07-01T00:00:00Z'),
            medianValue: 0.3,
            runValues: [0.4],
          }),
        });

        const result = await service.classifyAlert(
          toClassificationInput(alert, HazardType.drought),
        );
        expect(result.alertClass).toBe(AlertClassificationLevel.High);
        expect(result.trigger).toBe(false);
      });
    });
  });
});
