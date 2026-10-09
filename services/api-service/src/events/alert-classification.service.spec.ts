import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { AlertClassificationInput } from '@api-service/src/events/alert-classification.service';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
import { FLOOD_CLASSIFICATION_BY_COUNTRY } from '@api-service/src/seed/seed-data/seed-alert-configs.const';
import {
  AlertClass,
  AlertClassificationLevel,
  HazardType,
} from '@api-service/src/shared-enums';
import {
  buildAlert,
  buildSeverityData,
} from '@api-service/test/helpers/alert.helper';

function toClassificationInput({
  alert,
  hazardType = HazardType.floods,
  issuedAt = new Date(),
}: {
  alert: ReturnType<typeof buildAlert>;
  hazardType?: HazardType;
  issuedAt?: Date;
}): AlertClassificationInput {
  return {
    countryCodeIso3: 'ETH',
    hazardType,
    issuedAt,
    severity: alert.severity,
  };
}

const {
  singleThreshold: single,
  low,
  medium: med,
  high,
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
  triggerAlertClass: AlertClass.high,
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
          toClassificationInput({ alert, hazardType: 'unknown' as HazardType }),
        ),
      ).rejects.toThrow(
        "No classification config found for hazard type 'unknown'",
      );
    });

    it('should pass countryCodeIso3 to getAlertConfigs', async () => {
      const alert = buildAlert();
      const input: AlertClassificationInput = {
        countryCodeIso3: 'UGA',
        hazardType: HazardType.floods,
        issuedAt: new Date(),
        severity: alert.severity,
      };

      await service.classifyAlert(input);

      expect(alertConfigsService.getAlertConfigs).toHaveBeenCalledWith({
        countryCodeIso3: 'UGA',
        hazardType: HazardType.floods,
      });
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
          toClassificationInput({ alert }),
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
          toClassificationInput({ alert }),
        );
        expect(result.alertClass).toBe(AlertClassificationLevel.medium);
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
          toClassificationInput({ alert }),
        );
        expect(result.alertClass).toBe(AlertClassificationLevel.high);
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
          toClassificationInput({ alert }),
        );
        expect(result.alertClass).toBe(AlertClassificationLevel.high);
        expect(result.startAt).toEqual(new Date('2026-04-01T00:00:00Z'));
        expect(result.endAt).toEqual(new Date('2026-04-05T00:00:00Z'));
        expect(result.reachesPeakAlertClassAt).toEqual(
          new Date('2026-04-03T00:00:00Z'),
        );
      });

      it('should exclude below-low-threshold intervals from startAt/endAt', async () => {
        // Simulates the pipeline's generic min-threshold (e.g. 1.5yr RP) being
        // more permissive than the country-specific low threshold: the first
        // interval clears the pipeline gate but classifies as null here.
        const alert = buildAlert({
          severity: [
            ...buildSeverityData({
              start: new Date('2026-04-01T00:00:00Z'),
              end: new Date('2026-04-02T00:00:00Z'),
              medianValue: 1.0,
              runValues: [1.0, 1.0, 1.0],
            }),
            ...buildSeverityData({
              start: new Date('2026-04-03T00:00:00Z'),
              end: new Date('2026-04-05T00:00:00Z'),
              medianValue: 25,
              runValues: [25, 25, 25],
            }),
            ...buildSeverityData({
              start: new Date('2026-04-06T00:00:00Z'),
              end: new Date('2026-04-07T00:00:00Z'),
              medianValue: 1.0,
              runValues: [1.0, 1.0, 1.0],
            }),
          ],
        });

        const result = await service.classifyAlert(
          toClassificationInput({ alert }),
        );
        expect(result.alertClass).toBe(AlertClassificationLevel.high);
        expect(result.startAt).toEqual(new Date('2026-04-03T00:00:00Z'));
        expect(result.endAt).toEqual(new Date('2026-04-05T00:00:00Z'));
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
            toClassificationInput({
              alert,
              hazardType: HazardType.floods,
              issuedAt: new Date('2026-03-30T00:00:00Z'),
            }),
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
            toClassificationInput({
              alert,
              hazardType: HazardType.floods,
              issuedAt: new Date('2026-03-30T00:00:00Z'),
            }),
          );
          expect(result.alertClass).toBe(AlertClassificationLevel.high);
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
            toClassificationInput({ alert }),
          );
          expect(result.alertClass).toBe(AlertClassificationLevel.medium);
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
          toClassificationInput({ alert, hazardType: HazardType.drought }),
        );
        expect(result.alertClass).toBe(AlertClassificationLevel.high);
        expect(result.trigger).toBe(false);
      });
    });
  });
});

// Uses the real ZMB seed config (single severity RP10, probability low/medium/high at 0.6/0.7/0.8).
// GloFAS delivers between 34 and 51 ensemble runs; probability is relative to the runs available.
describe('AlertClassificationService with ZMB flood config', () => {
  const zambiaFloodConfig: Partial<AlertConfigResponseDto> = {
    hazardType: HazardType.floods,
    ...FLOOD_CLASSIFICATION_BY_COUNTRY.ZMB,
  };
  const exceedingReturnPeriod = 20;
  const nonExceedingReturnPeriod = 5;
  const issuedAt = new Date('2026-04-01T00:00:00Z');

  let service: AlertClassificationService;

  beforeEach(() => {
    const alertConfigsService = new AlertConfigsService(null as never);
    jest
      .spyOn(alertConfigsService, 'getAlertConfigs')
      .mockResolvedValue([zambiaFloodConfig as AlertConfigResponseDto]);
    service = new AlertClassificationService(alertConfigsService);
  });

  function buildZambiaClassificationInput({
    exceedingRunCount,
    runCount,
  }: {
    exceedingRunCount: number;
    runCount: number;
  }): AlertClassificationInput {
    const runValues = [
      ...Array<number>(exceedingRunCount).fill(exceedingReturnPeriod),
      ...Array<number>(runCount - exceedingRunCount).fill(
        nonExceedingReturnPeriod,
      ),
    ];
    const sortedRunValues = [...runValues].sort((a, b) => a - b);
    const medianValue = sortedRunValues[Math.floor(runCount / 2)];

    return {
      countryCodeIso3: 'ZMB',
      hazardType: HazardType.floods,
      issuedAt,
      severity: buildSeverityData({
        start: new Date('2026-04-03T00:00:00Z'),
        end: new Date('2026-04-04T00:00:00Z'),
        medianValue,
        runValues,
      }),
    };
  }

  it.each([
    { exceedingRunCount: 25, runCount: 51, expectedAlertClass: null },
    { exceedingRunCount: 26, runCount: 51, expectedAlertClass: null },
    { exceedingRunCount: 30, runCount: 51, expectedAlertClass: null },
    { exceedingRunCount: 31, runCount: 51, expectedAlertClass: AlertClass.low },
    { exceedingRunCount: 35, runCount: 51, expectedAlertClass: AlertClass.low },
    {
      exceedingRunCount: 36,
      runCount: 51,
      expectedAlertClass: AlertClass.medium,
    },
    {
      exceedingRunCount: 40,
      runCount: 51,
      expectedAlertClass: AlertClass.medium,
    },
    {
      exceedingRunCount: 41,
      runCount: 51,
      expectedAlertClass: AlertClass.high,
    },
    {
      exceedingRunCount: 51,
      runCount: 51,
      expectedAlertClass: AlertClass.high,
    },
    { exceedingRunCount: 20, runCount: 34, expectedAlertClass: null },
    { exceedingRunCount: 21, runCount: 34, expectedAlertClass: AlertClass.low },
    { exceedingRunCount: 23, runCount: 34, expectedAlertClass: AlertClass.low },
    {
      exceedingRunCount: 24,
      runCount: 34,
      expectedAlertClass: AlertClass.medium,
    },
    {
      exceedingRunCount: 27,
      runCount: 34,
      expectedAlertClass: AlertClass.medium,
    },
    {
      exceedingRunCount: 28,
      runCount: 34,
      expectedAlertClass: AlertClass.high,
    },
  ])(
    'should return $expectedAlertClass alertClass when $exceedingRunCount/$runCount runs exceed RP10',
    async ({ exceedingRunCount, runCount, expectedAlertClass }) => {
      // Arrange
      const input = buildZambiaClassificationInput({
        exceedingRunCount,
        runCount,
      });

      // Act
      const result = await service.classifyAlert(input);

      // Assert
      expect(result.alertClass).toBe(expectedAlertClass);
    },
  );

  it.each([
    { exceedingRunCount: 36, runCount: 51, expectedTrigger: false },
    { exceedingRunCount: 41, runCount: 51, expectedTrigger: true },
  ])(
    'should return trigger $expectedTrigger when $exceedingRunCount/$runCount runs exceed RP10 within P7D',
    async ({ exceedingRunCount, runCount, expectedTrigger }) => {
      // Arrange
      const input = buildZambiaClassificationInput({
        exceedingRunCount,
        runCount,
      });

      // Act
      const result = await service.classifyAlert(input);

      // Assert
      expect(result.trigger).toBe(expectedTrigger);
    },
  );
});
