// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,

  // Configuration/Feature-switches:
  defaultLocale: 'en-GB',
  envName: '', // To highlight the environment used
  locales: 'en-GB,nl', // Comma-separated string of enabled locales. Each should be available in: `./src/locale`

  // APIs
  url_api_service: 'http://localhost:4000/api',

  // Monitoring/Telemetry:
  applicationinsights_connection_string: '',
};
