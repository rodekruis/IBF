import { WaterDischargeTimeSeriesEntryDto } from '@api-service/src/alerts/dto/exposure-geo-feature.dto';
import { buildEthiopiaFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/eth.mock-alerts';
import { EnsembleMemberType } from '@api-service/src/shared-enums';

describe('buildEthiopiaFloodAlerts', () => {
  // Tendaho is the hand-crafted line-chart event, with per-day severity variation matching its discharge
  it('should give Tendaho a peak discharge day with return period 5 and 9 out of 10 runs exceeding it', () => {
    // Arrange
    const issuedAt = new Date('2026-08-25T12:00:00Z');
    const lineChartReturnPeriod = 5;
    const exceedingRunCount = 9;

    // Act
    const alerts = buildEthiopiaFloodAlerts(issuedAt);

    // Assert
    const tendaho = alerts.find((alert) => alert.eventName === 'Tendaho');
    const waterDischarge = tendaho!.exposure.geoFeatures![0].attributes
      .waterDischarge as WaterDischargeTimeSeriesEntryDto[];
    const peakMedian = Math.max(...waterDischarge.map((entry) => entry.median));
    const peakEntry = waterDischarge.find(
      (entry) => entry.median === peakMedian,
    )!;
    const severityAtPeak = tendaho!.severity.filter(
      (entry) =>
        new Date(entry.timeInterval.start).toISOString() === peakEntry.start,
    );
    const medianSeverity = severityAtPeak.find(
      (entry) => entry.ensembleMemberType === EnsembleMemberType.median,
    );
    const runSeverities = severityAtPeak.filter(
      (entry) => entry.ensembleMemberType === EnsembleMemberType.run,
    );
    expect(medianSeverity?.severityValue).toBe(lineChartReturnPeriod);
    expect(
      runSeverities.filter(
        (entry) => entry.severityValue >= lineChartReturnPeriod,
      ),
    ).toHaveLength(exceedingRunCount);
  });
});
