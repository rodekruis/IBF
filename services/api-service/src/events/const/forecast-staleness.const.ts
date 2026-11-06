import { HazardType } from '@api-service/src/shared-enums';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const HOURS_PER_DAY = 24;

// Expected time between two forecasts of the same hazard type.
const FORECAST_INTERVAL_HOURS: Record<HazardType, number> = {
  [HazardType.floods]: HOURS_PER_DAY,
  // TODO: confirm once the compound floods pipeline runs on a schedule.
  [HazardType.compoundFloods]: HOURS_PER_DAY,
  [HazardType.tropicalCyclone]: 6,
  [HazardType.drought]: 31 * HOURS_PER_DAY,
};

// Tolerance on top of the forecast interval, covering day-to-day variation in data availability and processing time.
const FORECAST_INTERVAL_TOLERANCE_FACTOR = 1.1;

// A newer forecast is overdue once this much time has passed since a forecast was issued.
export function getForecastStaleAt({
  hazardType,
  issuedAt,
}: {
  hazardType: HazardType;
  issuedAt: Date;
}): Date {
  const staleAfterHours =
    FORECAST_INTERVAL_HOURS[hazardType] * FORECAST_INTERVAL_TOLERANCE_FACTOR;
  return new Date(issuedAt.getTime() + staleAfterHours * MILLISECONDS_PER_HOUR);
}
