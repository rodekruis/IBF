#!/usr/bin/env node

/**
 * See the README.md-file in `./src/logout/` for more information.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';

// Set up specifics
const sourcePath = `./src/logout/`;
const targetPath = `./www/logout/`;

// Create target
if (!existsSync(targetPath)) {
  mkdirSync(targetPath, {
    recursive: true,
  });
}

// Set current API-URL from "NG_URL_API_SERVICE"
const logoutJs = readFileSync(`${sourcePath}logout.js`, 'utf8');
const updatedLogoutJs = logoutJs.replace(
  /NG_URL_API_SERVICE/g,
  process.env.NG_URL_API_SERVICE ?? '',
);
writeFileSync(`${targetPath}logout.js`, updatedLogoutJs);
console.info(`Logout API set at: ${process.env.NG_URL_API_SERVICE}`);

// Copy HTML
copyFileSync(`${sourcePath}index.html`, `${targetPath}index.html`);

console.info(`Manual Logout generated at: ${targetPath}`);
