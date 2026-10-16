import { Injectable } from '@nestjs/common';
import { defaultClient, TelemetryClient } from 'applicationinsights';
import { SeverityLevel } from 'applicationinsights/out/Declarations/Contracts';

import { env } from '@api-service/src/env';

@Injectable()
export class AzureLogService {
  defaultClient: TelemetryClient;

  public constructor() {
    if (!!env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
      this.defaultClient = defaultClient;
    }
  }

  public logError({ error, alert }: { error: Error; alert: boolean }): void {
    if (!this.defaultClient) {
      throw error;
    }

    try {
      this.defaultClient.trackException({
        exception: error,
        severity: alert ? SeverityLevel.Critical : SeverityLevel.Error,
      });
    } catch (trackExceptionError) {
      console.error('An error occurred in logError:', trackExceptionError);
    }

    this.flushLogs();
  }

  private flushLogs(): void {
    try {
      this.defaultClient.flush();
    } catch (flushError) {
      console.error(
        'An error occurred in AzureLogService::flushLogs:',
        flushError,
      );
    }
  }
}
