import { buildBasicGlofasStationGeoFeature } from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-alert-builders.helper';

describe('buildBasicGlofasStationGeoFeature', () => {
  const issuedAt = new Date('2026-08-25T12:00:00Z');
  const geoFeatureId = 'G0001';
  const maxDipAfterOnset = 0.03;

  it('should rise towards dischargeBeforeStart before onset and peak at medianDischarge the day after onset', () => {
    // Arrange
    const medianDischarge = 1000;
    const onset = { startDay: 3, dischargeBeforeStart: 800 };

    // Act
    const geoFeature = buildBasicGlofasStationGeoFeature({
      issuedAt,
      geoFeatureId,
      medianDischarge,
      onset,
    });

    // Assert
    const medians = geoFeature.attributes.waterDischarge.map(
      (entry) => entry.median,
    );
    expect(medians).toHaveLength(8);
    const preOnsetMedians = medians.slice(0, onset.startDay);
    const postOnsetMedians = medians.slice(onset.startDay);
    expect(preOnsetMedians).toEqual([...preOnsetMedians].sort((a, b) => a - b));
    expect(preOnsetMedians[preOnsetMedians.length - 1]).toBe(
      onset.dischargeBeforeStart,
    );
    expect(medians.indexOf(Math.max(...medians))).toBe(onset.startDay + 1);
    expect(Math.max(...medians)).toBe(medianDischarge);
    for (const median of postOnsetMedians) {
      expect(median).toBeGreaterThanOrEqual(
        medianDischarge * (1 - maxDipAfterOnset),
      );
    }
  });

  it('should add a forecast range around the median that widens with lead time', () => {
    // Act
    const geoFeature = buildBasicGlofasStationGeoFeature({
      issuedAt,
      geoFeatureId,
      medianDischarge: 1000,
    });

    // Assert
    const relativeWidths = geoFeature.attributes.waterDischarge.map(
      ({ median, low, high }) => {
        expect(low).toBeLessThan(median);
        expect(high).toBeGreaterThan(median);
        return (high - low) / median;
      },
    );
    for (let day = 1; day < relativeWidths.length; day++) {
      expect(relativeWidths[day]).toBeGreaterThan(relativeWidths[day - 1]);
    }
  });

  it('should keep overridden medians and ranges, and default only missing ranges', () => {
    // Arrange
    const waterDischarge = [
      { day: 0, median: 100, low: 90, high: 130 },
      { day: 1, median: 120 },
    ];

    // Act
    const geoFeature = buildBasicGlofasStationGeoFeature({
      issuedAt,
      geoFeatureId,
      waterDischarge,
    });

    // Assert
    const [firstEntry, secondEntry] = geoFeature.attributes.waterDischarge;
    expect(firstEntry).toMatchObject({ median: 100, low: 90, high: 130 });
    expect(secondEntry.median).toBe(120);
    expect(secondEntry.low).toBeLessThan(120);
    expect(secondEntry.high).toBeGreaterThan(120);
  });
});
