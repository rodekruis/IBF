import { extractPostgresErrorCode } from '@api-service/src/utils/extract-postgres-error-code.helper';

function makeError(meta: Record<string, unknown> | undefined) {
  return {
    code: 'P2010',
    message: 'Raw query failed',
    clientVersion: '7.0.0',
    name: 'PrismaClientKnownRequestError',
    meta,
  } as Parameters<typeof extractPostgresErrorCode>[0];
}

describe('extractPostgresErrorCode', () => {
  it('should extract originalCode from driver adapter error meta', () => {
    const error = makeError({
      driverAdapterError: {
        cause: { originalCode: '23505' },
      },
    });
    expect(extractPostgresErrorCode(error)).toBe('23505');
  });

  it('should return undefined when meta is undefined', () => {
    const error = makeError(undefined);
    expect(extractPostgresErrorCode(error)).toBeUndefined();
  });

  it('should return undefined when driverAdapterError is missing', () => {
    const error = makeError({});
    expect(extractPostgresErrorCode(error)).toBeUndefined();
  });

  it('should return undefined when cause is missing', () => {
    const error = makeError({ driverAdapterError: {} });
    expect(extractPostgresErrorCode(error)).toBeUndefined();
  });

  it('should return undefined when originalCode is missing', () => {
    const error = makeError({
      driverAdapterError: { cause: {} },
    });
    expect(extractPostgresErrorCode(error)).toBeUndefined();
  });
});
