import { AlertClass } from '@api-service/src/events/enum/classification-level.enum';

export interface ClassificationResult {
  readonly alertClassPerTimeInterval: ReadonlyMap<string, AlertClass | null>;
  readonly alertClass: AlertClass | null;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reachesPeakAlertClassAt: Date;
  readonly trigger: boolean;
}
