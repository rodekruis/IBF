export function getNormalizedStringList(
  values?: string[],
): string[] | undefined {
  if (!values) {
    return undefined;
  }
  const normalizedValues = Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
  return normalizedValues.length > 0 ? normalizedValues : undefined;
}
