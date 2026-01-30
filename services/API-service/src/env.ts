import { createEnv } from '@t3-oss/env-core';
import { withoutTrailingSlash } from 'ufo';
import { z } from 'zod/v4';

// See: https://env.t3.gg/docs/core
export const env = createEnv({
  // eslint-disable-next-line n/no-process-env -- We need to give access to the actual values (at least once)
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,

  /**
   * See explanations for each variable in `services/.env.example`
   * This file follows the same order/structure.
   *
   * Guidelines:
   * - Use as many _specific_ requirements as possible, like `.min(8)`, `.email()`, `.url()`, etc.
   *   See, for built-in possibilities: https://zod.dev/api
   *
   * - Use `.optional()` if the service should be able to start-up without any value set.
   *
   * - Use `.default(value)` ONLY if there is a safe, generic value available that can be used in production.
   *
   * - If a valid/unique value IS required for the service to start-up,
   *   or MUST be set to run all (API/E2E-)tests,
   *   _only then_ commit a hard-coded (development/test-only) value in `.env.example`, do not use `.default()`.
   *
   */
  server: {
    // Environment/Instance specifics
    ENV_NAME: z.string().optional(),
    ENV_ICON: z.url().or(z.string().startsWith('data:')).optional(),
    NODE_ENV: z.enum(['test', 'production', 'development']),
    GLOBAL_IBF_VERSION: z.string().optional(),

    // API set up
    PORT_API_SERVICE: z.coerce.number().default(8080),

    EXTERNAL_API_SERVICE_URL: z
      .url()
      .pipe(z.transform((url) => withoutTrailingSlash(url))),

    GENERIC_THROTTLING_LIMIT: z.coerce.number().optional().default(3_000),
    GENERIC_THROTTLING_TTL: z.coerce.number().optional().default(60),
    HIGH_THROTTLING_LIMIT: z.coerce.number().optional().default(30),
    HIGH_THROTTLING_TTL: z.coerce.number().optional().default(60),

    // Database
    POSTGRES_HOST: z.string().default('ibf-db'),
    POSTGRES_PORT: z.coerce.number().default(5432),
    POSTGRES_USER: z.string(),
    POSTGRES_PASSWORD: z.string(),
    POSTGRES_DBNAME: z.string(),

    // Data management
    RESET_SECRET: z.string().min(8),
    SECRETS_API_SERVICE_SECRET: z.string().min(8),

    // Default User-accounts
    USERCONFIG_API_SERVICE_EMAIL_ADMIN: z.email(),
    USERCONFIG_API_SERVICE_PASSWORD_ADMIN: z.string(),

    // Third-party: Azure ApplicationInsights
    APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),

    // Interface(s) configuration
    REDIRECT_PORTAL_URL_HOST: z
      .url()
      .pipe(z.transform((url) => withoutTrailingSlash(url))),

    // Third-party: Twilio
    MOCK_TWILIO: z.stringbool().default(false),
    TWILIO_SID: z.string().startsWith('AC'),
    TWILIO_AUTHTOKEN: z.string(),
    TWILIO_WHATSAPP_NUMBER: z.string().min(10).regex(/\d+/),
    TWILIO_MESSAGING_SID: z.string().startsWith('MG'),
  },

  createFinalSchema: (shape) =>
    z.object(shape).transform((env) => {
      return env;
    }),

  // We don't use client-side ENV-variables in the same way as in the services
  clientPrefix: '',
  client: {},
});
