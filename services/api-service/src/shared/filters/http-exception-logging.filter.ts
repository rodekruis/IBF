import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Catch and log response body of every HttpException
@Catch(HttpException)
export class HttpExceptionLoggingFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionLoggingFilter.name);

  public catch(exception: HttpException, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
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

    // Mirrors Nest's default HttpException response shape
    const body =
      typeof responseBody === 'string'
        ? { statusCode: status, message: responseBody }
        : responseBody;
    response.status(status).json(body);
  }
}
