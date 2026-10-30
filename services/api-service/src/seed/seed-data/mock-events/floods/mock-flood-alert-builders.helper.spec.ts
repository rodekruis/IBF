import {
  buildBasicGlofasStationGeoFeature,
  withDerivedFloodSeverity,
} from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-alert-builders.helper';
import { EnsembleMemberType } from '@api-service/src/shared-enums';

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

  it('should scale the default forecast range with rangeScale', () => {
    // Arrange
    const rangeScale = 0.5;

    // Act
    const [defaultRange, scaledRange] = [1, rangeScale].map(
      (scale) =>
        buildBasicGlofasStationGeoFeature({
          issuedAt,
          geoFeatureId,
          medianDischarge: 1000,
          rangeScale: scale,
        }).attributes.waterDischarge,
    );

    // Assert
    defaultRange.forEach((entry, day) => {
      expect(scaledRange[day].median).toBe(entry.median);
      expect(scaledRange[day].high - scaledRange[day].low).toBeCloseTo(
        (entry.high - entry.low) * rangeScale,
        1,
      );
    });
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

describe('withDerivedFloodSeverity', () => {
  const issuedAt = new Date('2026-08-25T12:00:00Z');
  const geoFeatureId = 'G0001';
  const stationThresholds = { 1.5: 100, 2: 200, 5: 300 };

  function buildAlert(
    waterDischarge: {
      day: number;
      median: number;
      low: number;
      high: number;
    }[],
  ) {
    return {
      eventName: 'Test event',
      centroid: { latitude: 0, longitude: 0 },
      stationThresholds,
      exposure: {
        adminAreas: [],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId,
            waterDischarge,
          }),
        ],
      },
    };
  }

  it('should derive median and run return periods consistent with the forecast range', () => {
    // Arrange
    const alert = buildAlert([
      { day: 0, median: 90, low: 80, high: 95 },
      { day: 1, median: 250, low: 210, high: 290 },
      { day: 2, median: 250, low: 150, high: 350 },
    ]);

    // Act
    const [{ severity }] = withDerivedFloodSeverity([alert]);

    // Assert
    const severityForDay = (day: number) => {
      const atDay = severity.filter(
        (entry) =>
          new Date(entry.timeInterval.start).getTime() ===
          new Date(
            alert.exposure.geoFeatures[0].attributes.waterDischarge[day].start,
          ).getTime(),
      );
      return {
        median: atDay.find(
          (entry) => entry.ensembleMemberType === EnsembleMemberType.median,
        )?.severityValue,
        runs: atDay
          .filter(
            (entry) => entry.ensembleMemberType === EnsembleMemberType.run,
          )
          .map((entry) => entry.severityValue),
      };
    };
    // Median below the lowest threshold: no severity, like the pipeline
    expect(severityForDay(0).median).toBeUndefined();
    // Whole range between the 2 and 5 year thresholds: all runs exceed 2 years
    expect(severityForDay(1)).toEqual({
      median: 2,
      runs: Array<number>(10).fill(2),
    });
    // Range dips below the 2 year threshold: 7 of 10 runs exceed 2 years
    const dayWithWideRange = severityForDay(2);
    expect(dayWithWideRange.median).toBe(2);
    expect(dayWithWideRange.runs.filter((run) => run >= 2)).toHaveLength(7);
  });
});
