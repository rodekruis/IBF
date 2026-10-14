import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ValidationError,
} from '@nestjs/common';

interface SanitizedValidationError {
  property: string;
  constraints?: Record<string, string>;
  children?: SanitizedValidationError[];
}

// Strip `value` and `target` before this is logged.
// These fields contain the submitted request body (e.g. passwords)
function sanitizeValidationError(error: ValidationError) {
  const sanitized: SanitizedValidationError = { property: error.property };
  if (error.constraints) {
    sanitized.constraints = error.constraints;
  }
  if (error.children?.length) {
    sanitized.children = error.children.map(sanitizeValidationError);
  }
  return sanitized;
}

export const ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: false,
  forbidUnknownValues: true,
  exceptionFactory: (errors: ValidationError[]) => {
    for (const error of errors) {
      if (error.constraints && error.constraints['unknownValue']) {
        throw new HttpException(
          sanitizeValidationError(error),
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
    throw new BadRequestException(errors.map(sanitizeValidationError));
  },
};
