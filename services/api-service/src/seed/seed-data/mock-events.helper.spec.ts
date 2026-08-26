import {
  buildMockForecasts,
  MockConfigError,
  SUPPORTED_MOCK_COUNTRIES,
} from '@api-service/src/seed/seed-data/mock-events.helper';
import { HazardType } from '@api-service/src/shared-enums';

describe('buildMockForecasts', () => {
  const issuedAt = new Date('2026-08-25T12:00:00Z');

  it('should throw for unsupported country', () => {
    expect(() =>
      buildMockForecasts({ countryCodeIso3: 'XXX', issuedAt }),
    ).toThrow('No mock event configuration for country');
  });

  it('should return forecasts for all hazard types when no filter given', () => {
    const forecasts = buildMockForecasts({ countryCodeIso3: 'PHL', issuedAt });

    const hazardTypes = forecasts.map((f) => f.hazardType);
    expect(hazardTypes).toContain(HazardType.floods);
    expect(hazardTypes).toContain(HazardType.tropicalCyclone);
  });

  it('should filter by hazardTypes when provided', () => {
    const forecasts = buildMockForecasts({
      countryCodeIso3: 'PHL',
      issuedAt,
      hazardTypes: [HazardType.tropicalCyclone],
    });

    expect(forecasts).toHaveLength(1);
    expect(forecasts[0].hazardType).toBe(HazardType.tropicalCyclone);
    expect(forecasts[0].countryCodeIso3).toBe('PHL');
    expect(forecasts[0].alerts.length).toBeGreaterThan(0);
  });

  it('should throw MockConfigError when hazardType is not configured for country', () => {
    expect(() =>
      buildMockForecasts({
        countryCodeIso3: 'PHL',
        issuedAt,
        hazardTypes: [HazardType.drought],
      }),
    ).toThrow(MockConfigError);
  });

  it('should use alertsOverride when provided', () => {
    const forecasts = buildMockForecasts({
      countryCodeIso3: 'ETH',
      issuedAt,
      alertsOverride: [],
    });

    for (const forecast of forecasts) {
      expect(forecast.alerts).toEqual([]);
    }
  });

  it('should include all supported countries', () => {
    expect(SUPPORTED_MOCK_COUNTRIES.length).toBeGreaterThanOrEqual(7);

    for (const country of SUPPORTED_MOCK_COUNTRIES) {
      const forecasts = buildMockForecasts({
        countryCodeIso3: country,
        issuedAt,
      });
      expect(forecasts.length).toBeGreaterThan(0);
    }
  });
});
