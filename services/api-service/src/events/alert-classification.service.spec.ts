import { Test } from '@nestjs/testing';

import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import {
  buildAlert,
  buildSeverityData,
} from '@api-service/src/alerts/test-helpers/alert.builders';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';

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
      expect(() => service.classifyAlert(alert)).toThrow(
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
          severityData: buildSeverityData(
            '2026-04-01T00:00:00Z',
            '2026-04-02T00:00:00Z',
            50,
            [30, 40],
          ),
        });

        const result = service.classifyAlert(alert);
        expect(result.alertClass).toBeNull();
      });

      it('should return min alertClass for low severity with high probability', () => {
        // median=120 → severity 'low' (≥100), all runs exceed 100 → prob=1.0 → 'high'
        // matrix[low][high] = 'min'
        const alert = buildAlert({
          severityData: buildSeverityData(
            '2026-04-01T00:00:00Z',
            '2026-04-02T00:00:00Z',
            120,
            [150, 150, 150, 150, 150, 150, 150, 150, 150, 150],
          ),
        });

        const result = service.classifyAlert(alert);
        expect(result.alertClass).toBe('min');
      });

      it('should return max alertClass for high severity with high probability', () => {
        // median=500 → severity 'high' (≥400), all runs exceed 400 → prob=1.0 → 'high'
        // matrix[high][high] = 'max'
        const alert = buildAlert({
          severityData: buildSeverityData(
            '2026-04-01T00:00:00Z',
            '2026-04-02T00:00:00Z',
            500,
            [500, 500, 500, 500, 500, 500, 500, 500, 500, 500],
          ),
        });

        const result = service.classifyAlert(alert);
        expect(result.alertClass).toBe('max');
      });

      it('should pick highest alertClass across multiple lead times and compute correct dates', () => {
        // LT1: Apr 1–2, median=120, all runs=150 → 'min'
        // LT2: Apr 3–5, median=500, all runs=500 → 'max'
        const alert = buildAlert({
          severityData: [
            ...buildSeverityData(
              '2026-04-01T00:00:00Z',
              '2026-04-02T00:00:00Z',
              120,
              [150, 150, 150],
            ),
            ...buildSeverityData(
              '2026-04-03T00:00:00Z',
              '2026-04-05T00:00:00Z',
              500,
              [500, 500, 500],
            ),
          ],
        });

        const result = service.classifyAlert(alert);
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
            issuedAt: '2026-03-30T00:00:00Z',
            severityData: buildSeverityData(
              '2026-04-01T00:00:00Z',
              '2026-04-02T00:00:00Z',
              500,
              [500, 500, 500],
            ),
          });

          const result = service.classifyAlert(alert);
          expect(result.trigger).toBe(true);
        });

        it('should be false when peak exceeds trigger lead time duration', () => {
          // issuedAt = Mar 30, peak at Apr 10, deadline = Mar 30 + 7D = Apr 6
          // Apr 10 > Apr 6 → trigger false
          const alert = buildAlert({
            issuedAt: '2026-03-30T00:00:00Z',
            severityData: buildSeverityData(
              '2026-04-10T00:00:00Z',
              '2026-04-11T00:00:00Z',
              500,
              [500, 500, 500],
            ),
          });

          const result = service.classifyAlert(alert);
          expect(result.alertClass).toBe('max');
          expect(result.trigger).toBe(false);
        });

        it('should be false when alertClass is below trigger threshold', () => {
          // 'min' < 'max' → trigger false regardless of timing
          const alert = buildAlert({
            severityData: buildSeverityData(
              '2026-04-01T00:00:00Z',
              '2026-04-02T00:00:00Z',
              120,
              [150, 150, 150],
            ),
          });

          const result = service.classifyAlert(alert);
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
          severityData: buildSeverityData(
            '2026-04-01T00:00:00Z',
            '2026-07-01T00:00:00Z',
            0.3,
            [0.4],
          ),
        });

        const result = service.classifyAlert(alert);
        expect(result.alertClass).toBe('severe');
        expect(result.trigger).toBe(false);
      });
    });
  });
});
