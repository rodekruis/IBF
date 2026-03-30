export interface ClassLevel {
  readonly label: string;
  readonly threshold: number;
}

export interface AlertClassificationConfig {
  readonly severityClassLevels: readonly ClassLevel[];
  readonly probabilityClassLevels: readonly ClassLevel[];
  readonly alertClassMatrix: Record<string, Record<string, string | null>>;
  readonly triggerAlertClass?: string;
  readonly triggerLeadTimeDuration?: string;
}
