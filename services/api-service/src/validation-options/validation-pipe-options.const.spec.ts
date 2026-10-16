import { BadRequestException, ValidationError } from '@nestjs/common';

import { ValidationPipeOptions } from '@api-service/src/validation-options/validation-pipe-options.const';

function buildValidationError(
  partial: Partial<ValidationError>,
): ValidationError {
  return { property: 'email', ...partial } as ValidationError;
}

describe('ValidationPipeOptions exceptionFactory', () => {
  it('should strip value and target from the BadRequestException body', () => {
    // Arrange
    const errors = [
      buildValidationError({
        value: 'mockpasword123',
        target: { email: 'not-an-email', password: 'mockpasword123' },
        constraints: { isEmail: 'email must be an email' },
      }),
    ];

    // Act
    let thrown: unknown;
    try {
      ValidationPipeOptions.exceptionFactory(errors);
    } catch (error) {
      thrown = error;
    }

    // Assert
    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = (thrown as BadRequestException).getResponse() as {
      message: unknown[];
    };
    expect(response.message).toEqual([
      { property: 'email', constraints: { isEmail: 'email must be an email' } },
    ]);
    expect(JSON.stringify(response)).not.toContain('mockpasword123');
  });
});
