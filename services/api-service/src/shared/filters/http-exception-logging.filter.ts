import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request } from 'express';

// Catch and log every HttpException, and then pass them on to the
// Nest handler to let it write the response
@Catch(HttpException)
export class HttpExceptionLoggingFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(HttpExceptionLoggingFilter.name);

  public catch(exception: HttpException, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const status = exception.getStatus();
    const responseBody = exception.getResponse();

    const detail =
      typeof responseBody === 'string'
        ? responseBody
        : JSON.stringify(responseBody);
    const message = `${request.method} ${request.originalUrl} -> ${status}: ${detail}`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(message, exception.stack);
    } else {
      this.logger.warn(message);
    }

    // eslint-disable-next-line promise/valid-params -- Not a Promise; this is BaseExceptionFilter.catch()
    super.catch(exception, host);
  }
}
