#!/usr/bin/env node

/**
 * See the "Deployment"-section of the interfaces/README.md-file for more information.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';

import { shouldBeEnabled } from './_env.utils.mjs';

// Set up specifics
const sourcePath = './staticwebapp.config.base.json';
const targetPath = './staticwebapp.config.json';

let swaConfig = JSON.parse(readFileSync(sourcePath, 'utf8'));

// Check source/base
if (!existsSync(sourcePath) || !swaConfig) {
  console.error(`Source-file not found or readable: ${sourcePath}`);
  process.exit(1);
}

if (!swaConfig.globalHeaders) {
  swaConfig.globalHeaders = {};
}

// NOTE: All values in each array are written as template-strings, as the use of single-quotes around some values (i.e. 'self') is mandatory and will affect the working of the HTTP-Header.
let contentSecurityPolicy = new Map([
  ['connect-src', [`'self'`]],
  ['default-src', [`'self'`]],
  ['frame-ancestors', [`'self'`]],
  ['frame-src', [`blob:`, `'self'`]],
  ['img-src', [`data:`, `'self'`]],
  ['object-src', [`'none'`]],
  ['script-src', [`'self'`]],
  ['style-src', [`'self'`, `'unsafe-inline'`]],
]);

// Required: Set API-origin
if (process.env.NG_URL_API_SERVICE) {
  console.info('✅ Set API-origin of the api-service');

  const apiUrl = new URL(process.env.NG_URL_API_SERVICE);

  let connectSrc = contentSecurityPolicy.get('connect-src') ?? [];
  contentSecurityPolicy.set('connect-src', [...connectSrc, apiUrl.origin]);
}

// Optional: Application-Insights logging
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  console.info('✅ Allow logging to Application Insights');

  let connectSrc = contentSecurityPolicy.get('connect-src') ?? [];
  contentSecurityPolicy.set('connect-src', [
    ...connectSrc,
    'https://*.in.applicationinsights.azure.com',
    'https://westeurope.livediagnostics.monitor.azure.com',
  ]);
}

/////////////////////////////////////////////////////////////////////////////

// Construct the Content-Security-Policy header-value
const contentSecurityPolicyValue = Array.from(contentSecurityPolicy)
  .map((directive) => {
    const directiveKey = directive[0];
    const values = directive[1];
    return `${directiveKey} ${values.join(' ')}`;
  })
  .join(' ; ');

// Set the Content-Security-Policy header-value
if (shouldBeEnabled(process.env.DEBUG)) {
  console.log(`Content-Security-Policy: "${contentSecurityPolicyValue}"`);
}
swaConfig.globalHeaders['Content-Security-Policy'] = contentSecurityPolicyValue;

// Write result
const swaConfigFile = JSON.stringify(swaConfig, null, 2);
writeFileSync(targetPath, swaConfigFile);
console.info(`✅ Deployment configuration written at: ${targetPath}`);
console.log(swaConfigFile);
