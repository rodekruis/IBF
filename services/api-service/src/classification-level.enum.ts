// Possible severityClass and probabilityClass values
export enum AlertClassificationLevel {
  single = 'single',
  low = 'low',
  med = 'med',
  high = 'high',
}

// Possible alertClass values (derived from severityClass and probabilityClass according to ALERT_CLASS_MATRIX)
export enum AlertClass {
  low = 'low',
  med = 'med',
  high = 'high',
}
