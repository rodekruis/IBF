import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ValidationError,
} from '@nestjs/common';

export const ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: false,
  forbidUnknownValues: true,
  exceptionFactory: (errors: ValidationError[]) => {
    for (const e of errors) {
      if (e.constraints && e.constraints['unknownValue']) {
        console.log('e: ', e);
        throw new HttpException(e, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
    throw new BadRequestException(errors);
  },
};
