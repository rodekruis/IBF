#!/usr/bin/env node

/**
 * See the "Deployment"-section of the interfaces/README.md-file for more information.
 */

import { doesNotMatch, match, ok } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const swaConfig = JSON.parse(
  readFileSync('./staticwebapp.config.json', 'utf8'),
);

const csp = swaConfig.globalHeaders['Content-Security-Policy'];

test('Deployment-configuration contains a Content-Security-Policy', () => {
  ok(swaConfig.globalHeaders, 'Contains configuration for global HTTP Headers');
  ok(
    swaConfig.globalHeaders['Content-Security-Policy'],
    'Contains configuration of a Content-Security-Policy',
  );
});

test('Deployment-configuration contains the defaults of the Content-Security-Policy', () => {
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

test('Content-Security-Policy configuration whether to allow tracking with ApplicationInsights', () => {
  const connectSrcCondition =
    /connect-src[^;]* https:\/\/\*\.in\.applicationinsights\.azure\.com/;

  if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    match(csp, connectSrcCondition);
  } else {
    doesNotMatch(csp, connectSrcCondition);
  }
});
