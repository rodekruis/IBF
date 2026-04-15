export interface ClassificationResult {
  readonly alertClassPerTimeInterval: ReadonlyMap<string, string | null>;
  readonly alertClass: string | null;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reachesPeakAlertClassAt: Date;
  readonly trigger: boolean;
}
