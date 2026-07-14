/* eslint-disable n/no-process-env -- This module is the single, centralized place where environment variables are read for the e2e package. */
import { config } from 'dotenv';
import path from 'node:path';

// Load the api-service environment (shared docker .env) so the e2e package can
// reach the running api-service and authorize the database reset.
config({ path: path.resolve(__dirname, '../services/.env') });

export const env = {
  // URL of the running frontend that Playwright points at.
  BASE_URL: process.env.BASE_URL ?? 'http://localhost:5173',
  // External URL of the running api-service (used to seed mock data).
  API_SERVICE_URL:
    process.env.EXTERNAL_API_SERVICE_URL ?? 'http://localhost:4000',
  // Secret required by the api-service `/reset` endpoint.
  RESET_SECRET: process.env.RESET_SECRET ?? '',
  // When set (e.g. in CI), Playwright fails if `test.only` is left in the code.
  CI: Boolean(process.env.CI),
};
/* eslint-enable n/no-process-env -- Re-enable after the centralized env reads above. */
