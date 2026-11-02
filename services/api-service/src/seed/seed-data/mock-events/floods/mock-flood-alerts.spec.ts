import { differenceInCalendarDays } from 'date-fns';

import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
import {
  buildMockForecasts,
  getMockCountriesForHazards,
} from '@api-service/src/seed/seed-data/mock-events/mock-events.helper';
import { FLOOD_CLASSIFICATION_BY_COUNTRY } from '@api-service/src/seed/seed-data/seed-alert-configs.const';
import { AlertClass, HazardType } from '@api-service/src/shared-enums';

interface ExpectedClassification {
  alertClass: AlertClass;
  trigger: boolean;
  // Alert class per lead-time day; null for days with severity below the country's lowest threshold
  alertClassPerDay: Record<number, AlertClass | null>;
}

const { low, medium, high } = AlertClass;

// Mock flood severity is derived from the forecast range (see withDerivedFloodSeverity), so tweaking that range
// or an event's rangeScale can silently change its alert class or alert days. This pins them per mock event.
const EXPECTED_CLASSIFICATION_PER_EVENT: Record<
  string,
  ExpectedClassification
> = {
  'Mitano (84267)': {
    alertClass: low,
    trigger: false,
    alertClassPerDay: {
      1: low,
      2: low,
      3: low,
      4: low,
      5: low,
      6: low,
      7: low,
    },
  },
  'Mpologoma at Budumba (82217)': {
    alertClass: medium,
    trigger: false,
    alertClassPerDay: { 3: medium, 4: medium, 5: medium, 6: medium, 7: medium },
  },
  'Mayanja (83218)': {
    alertClass: high,
    trigger: true,
    alertClassPerDay: {
      0: high,
      1: high,
      2: high,
      3: medium,
      4: medium,
      5: medium,
      6: low,
    },
  },
  'Manafwa at Butaleja (82212)': {
    alertClass: high,
    trigger: false,
    alertClassPerDay: { 6: high, 7: high },
  },
  'ATHI MUNYU (3DA02)': {
    alertClass: high,
    trigger: true,
    alertClassPerDay: {
      1: high,
      2: high,
      3: high,
      4: high,
      5: high,
      6: high,
      7: high,
    },
  },
  Adaitu: {
    alertClass: low,
    trigger: false,
    alertClassPerDay: { 4: low, 5: low, 6: low, 7: low },
  },
  Tendaho: {
    alertClass: medium,
    trigger: false,
    alertClassPerDay: {
      1: null,
      2: low,
      3: low,
      4: medium,
      5: medium,
      6: medium,
      7: low,
    },
  },
  G1904: {
    alertClass: high,
    trigger: true,
    alertClassPerDay: {
      0: high,
      1: high,
      2: high,
      3: high,
      4: high,
      5: high,
      6: high,
      7: high,
    },
  },
  KelongwaSchool60334550: {
    alertClass: low,
    trigger: false,
    alertClassPerDay: { 4: low, 5: low, 6: low, 7: low },
  },
  Senanga60370001: {
    alertClass: medium,
    trigger: false,
    alertClassPerDay: { 2: medium, 3: medium, 4: low, 5: low, 6: low, 7: low },
  },
  ItezhiTezhi: {
    alertClass: high,
    trigger: true,
    alertClassPerDay: {
      0: high,
      1: high,
      2: high,
      3: medium,
      4: medium,
      5: medium,
      6: low,
      7: low,
    },
  },
  G5100: {
    alertClass: high,
    trigger: true,
    alertClassPerDay: { 3: high, 4: high, 5: high, 6: high, 7: high },
  },
  Chikwawa: {
    alertClass: high,
    trigger: true,
    alertClassPerDay: { 2: high, 3: high, 4: high, 5: high, 6: high, 7: high },
  },
  Nabua: {
    alertClass: high,
    trigger: true,
    alertClassPerDay: { 2: high, 3: high, 4: high, 5: high, 6: high, 7: high },
  },
};

describe('mock flood alerts classified with the seeded alert configs', () => {
  const issuedAt = new Date('2026-08-25T12:00:00Z');
  const mockFloodAlerts = getMockCountriesForHazards([
    HazardType.floods,
  ]).flatMap((countryCodeIso3) =>
    buildMockForecasts({
      countryCodeIso3,
      issuedAt,
      hazardTypes: [HazardType.floods],
    })[0].alerts.map((alert) => ({ countryCodeIso3, alert })),
  );

  it('should have an expected classification for every mock flood event', () => {
    // Arrange
    const eventNames = mockFloodAlerts.map(({ alert }) => alert.eventName);

    // Act & Assert
    expect(eventNames.sort()).toEqual(
      Object.keys(EXPECTED_CLASSIFICATION_PER_EVENT).sort(),
    );
  });

  it.each(
    mockFloodAlerts.map(({ countryCodeIso3, alert }) => [
      `${countryCodeIso3} ${alert.eventName}`,
      countryCodeIso3,
      alert,
    ]),
  )(
    'should keep the expected alert class and alert days for %s',
    async (_, countryCodeIso3, alert) => {
      // Arrange
      const alertConfigsService = new AlertConfigsService(null as never);
      jest.spyOn(alertConfigsService, 'getAlertConfigs').mockResolvedValue([
        {
          hazardType: HazardType.floods,
          ...FLOOD_CLASSIFICATION_BY_COUNTRY[countryCodeIso3],
        } as AlertConfigResponseDto,
      ]);
      const service = new AlertClassificationService(alertConfigsService);

      // Act
      const result = await service.classifyAlert({
        countryCodeIso3,
        hazardType: HazardType.floods,
        issuedAt,
        severity: alert.severity,
      });

      // Assert
      const alertClassPerDay = Object.fromEntries(
        [...result.alertClassPerTimeInterval.entries()].map(
          ([start, alertClass]) => [
            differenceInCalendarDays(new Date(start), issuedAt),
            alertClass,
          ],
        ),
      );
      expect({
        alertClass: result.alertClass,
        trigger: result.trigger,
        alertClassPerDay,
      }).toEqual(EXPECTED_CLASSIFICATION_PER_EVENT[alert.eventName]);
    },
  );
});
