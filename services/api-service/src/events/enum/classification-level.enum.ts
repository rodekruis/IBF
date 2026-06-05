// Possible severityClass and probabilityClass values.
// 'single' is used when a dimension (severity or probability) has only one threshold level,
// meaning that dimension does not differentiate between alert classes.
// In practice, all current configs use either multi-sev + single-prob, or single-sev + multi-prob, or both single.
// Multi-sev + multi-prob is not used, and would in the current setup lead to counterintuitive results because probability is conditional on severity
// as probability is calculated as % of runs exceeding identified severity threshold
// which means: lower severity thrsehold is easier to exceed > higher probability > higher probability class > potentially higher alert class for less severe alert (depending on exact threshold configurations)
// TODO: resolve this computation problem
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
