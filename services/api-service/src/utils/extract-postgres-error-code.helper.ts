interface PrismaRawQueryError {
  readonly code: string;
  readonly meta?: Record<string, unknown>;
}

export function extractPostgresErrorCode(
  error: PrismaRawQueryError,
): string | undefined {
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { originalCode?: string } } }
    | undefined;
  return meta?.driverAdapterError?.cause?.originalCode;
}
