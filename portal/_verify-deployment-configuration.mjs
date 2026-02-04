#!/usr/bin/env node

/**
 * See the "Deployment"-section of the interfaces/README.md-file for more information.
 */

import { doesNotMatch, match, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs } from 'node:util';

import { parseMatomoConnectionString } from './_matomo.utils.mjs';

const config = parseArgs({
  options: {
    url: {
      short: 'u',
      type: 'string',
    },
  },
});
const url = config.values.url;

if (!url || !url.startsWith('https')) {
  console.error('Invalid URL argument.');
  console.info(
    'Provide a valid URL as argument using: ` --url=https://example.org` or ` -u https://example.org`',
  );
  process.exit(1);
}

console.info('Verifying deployment configuration for URL:', url);
const response = await fetch(url);

const csp = response.headers.get('Content-Security-Policy') ?? '';
console.info('Content-Security-Policy in use:', csp);

test('Response-Headers contain a Content-Security-Policy', () => {
  ok(csp, 'Contain a Content-Security-Policy');
});

test('Content-Security-Policy contains defaults', () => {
  const defaults = [
    `default-src 'self'`,
    `connect-src 'self'`,
    `img-src data: 'self'`,
    `object-src 'none'`,
    `style-src 'self' 'unsafe-inline'`,
  ];

  defaults.forEach((defaultDirective) =>
    match(csp, new RegExp(defaultDirective)),
  );
});

test('Content-Security-Policy set for tracking with ApplicationInsights', () => {
  const connectSrcCondition =
    /connect-src[^;]* https:\/\/\*\.in\.applicationinsights\.azure\.com/;

  if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    match(csp, connectSrcCondition);
  } else {
    doesNotMatch(csp, connectSrcCondition);
  }
});

test(
  'Content-Security-Policy set for tracking with Matomo',
  { skip: !process.env.MATOMO_CONNECTION_STRING },
  () => {
    const matomoConnectionInfo = parseMatomoConnectionString(
      process.env.MATOMO_CONNECTION_STRING,
    );

    const matomoApiOrigin = new URL(matomoConnectionInfo.api).origin;
    const connectSrcCondition = new RegExp(
      `connect-src[^;]* ${matomoApiOrigin}`,
    );
    match(csp, connectSrcCondition);

    const matomoSdkOrigin = new URL(matomoConnectionInfo.sdk).origin;
    const scriptSrcCondition = new RegExp(`script-src[^;]* ${matomoSdkOrigin}`);
    match(csp, scriptSrcCondition);
  },
);
