import { Test } from '@nestjs/testing';

import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { AlertClassificationInput } from '@api-service/src/events/alert-classification.service';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
// TODO this helper is now shared across unit & integration tests. Organize better.
import {
  buildAlert,
  buildSeverityData,
} from '@api-service/test/helpers/alert.helper';

function toClassificationInput(
  alert: ReturnType<typeof buildAlert>,
): AlertClassificationInput {
  return {
    hazardType: alert.hazardTypes[0],
    issuedAt: new Date(alert.issuedAt),
    severity: alert.severity,
  };
}

describe('AlertClassificationService', () => {
  let service: AlertClassificationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AlertClassificationService],
    }).compile();

    service = module.get(AlertClassificationService);
  });

  describe('classifyAlert', () => {
    it('should throw when no config exists for hazard type', () => {
      const alert = buildAlert({
        hazardTypes: ['unknown' as HazardType],
      });
      expect(() => service.classifyAlert(toClassificationInput(alert))).toThrow(
        "No classification config found for hazard type 'unknown'",
      );
    });

    // Floods mock config:
    //   severity: low=100, mid=200, high=400
    //   probability: low=0.5, mid=0.65, high=0.85
    //   matrix: low/high→min, mid/mid→min, mid/high→med, high/low→min, high/mid→med, high/high→max
    //   triggerAlertClass: 'max', triggerLeadTimeDuration: 'P7D'
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

      it('should return min alertClass for low severity with high probability', () => {
        // median=120 → severity 'low' (≥100), all runs exceed 100 → prob=1.0 → 'high'
        // matrix[low][high] = 'min'
        const alert = buildAlert({
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-04-02T00:00:00Z'),
            medianValue: 120,
            runValues: [150, 150, 150, 150, 150, 150, 150, 150, 150, 150],
          }),
        });

        const result = service.classifyAlert(toClassificationInput(alert));
        expect(result.alertClass).toBe('min');
      });

      it('should return max alertClass for high severity with high probability', () => {
        // median=500 → severity 'high' (≥400), all runs exceed 400 → prob=1.0 → 'high'
        // matrix[high][high] = 'max'
        const alert = buildAlert({
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-04-02T00:00:00Z'),
            medianValue: 500,
            runValues: [500, 500, 500, 500, 500, 500, 500, 500, 500, 500],
          }),
        });

        const result = service.classifyAlert(toClassificationInput(alert));
        expect(result.alertClass).toBe('max');
      });

      it('should pick highest alertClass across multiple lead times and compute correct dates', () => {
        // LT1: Apr 1–2, median=120, all runs=150 → 'min'
        // LT2: Apr 3–5, median=500, all runs=500 → 'max'
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
        expect(result.alertClass).toBe('max');
        expect(result.startAt).toEqual(new Date('2026-04-01T00:00:00Z'));
        expect(result.endAt).toEqual(new Date('2026-04-05T00:00:00Z'));
        expect(result.reachesPeakAlertClassAt).toEqual(
          new Date('2026-04-03T00:00:00Z'),
        );
      });

      describe('trigger', () => {
        it('should be true when max alertClass peaks within lead time duration', () => {
          // issuedAt = Mar 30, peak at Apr 1, deadline = Mar 30 + 7D = Apr 6
          // Apr 1 <= Apr 6 → trigger true
          const alert = buildAlert({
            issuedAt: new Date('2026-03-30T00:00:00Z'),
            severity: buildSeverityData({
              start: new Date('2026-04-01T00:00:00Z'),
              end: new Date('2026-04-02T00:00:00Z'),
              medianValue: 500,
              runValues: [500, 500, 500],
            }),
          });

          const result = service.classifyAlert(toClassificationInput(alert));
          expect(result.trigger).toBe(true);
        });

        it('should be false when peak exceeds trigger lead time duration', () => {
          // issuedAt = Mar 30, peak at Apr 10, deadline = Mar 30 + 7D = Apr 6
          // Apr 10 > Apr 6 → trigger false
          const alert = buildAlert({
            issuedAt: new Date('2026-03-30T00:00:00Z'),
            severity: buildSeverityData({
              start: new Date('2026-04-10T00:00:00Z'),
              end: new Date('2026-04-11T00:00:00Z'),
              medianValue: 500,
              runValues: [500, 500, 500],
            }),
          });

          const result = service.classifyAlert(toClassificationInput(alert));
          expect(result.alertClass).toBe('max');
          expect(result.trigger).toBe(false);
        });

        it('should be false when alertClass is below trigger threshold', () => {
          // 'min' < 'max' → trigger false regardless of timing
          const alert = buildAlert({
            severity: buildSeverityData({
              start: new Date('2026-04-01T00:00:00Z'),
              end: new Date('2026-04-02T00:00:00Z'),
              medianValue: 120,
              runValues: [150, 150, 150],
            }),
          });

          const result = service.classifyAlert(toClassificationInput(alert));
          expect(result.alertClass).toBe('min');
          expect(result.trigger).toBe(false);
        });
      });
    });

    // Drought mock config:
    //   severity: severe=0.2, probability: any=0
    //   matrix: severe/any → 'severe'
    //   no triggerAlertClass → trigger always false
    describe('drought', () => {
      it('should classify as severe with no trigger', () => {
        const alert = buildAlert({
          hazardTypes: [HazardType.drought],
          severity: buildSeverityData({
            start: new Date('2026-04-01T00:00:00Z'),
            end: new Date('2026-07-01T00:00:00Z'),
            medianValue: 0.3,
            runValues: [0.4],
          }),
        });

        const result = service.classifyAlert(toClassificationInput(alert));
        expect(result.alertClass).toBe('severe');
        expect(result.trigger).toBe(false);
      });
    });
  });
});
