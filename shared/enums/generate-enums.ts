// Generate the Python pipeline enums file and the portal export enums file
// from the backend NestJS enum files, which are the source of truth.
//
// Run with:
//   node --experimental-strip-types shared/enums/generate-enums.ts
//   node --experimental-strip-types shared/enums/generate-enums.ts --check
//
// No third-party dependencies. Node 22.6+ supports `--experimental-strip-types`
// for running TypeScript files directly.
//
// The backend enum files are parsed as text (each member is a single line of
// the form `key = 'value',`) rather than imported, because Node's type-only
// stripping cannot execute files that declare `enum`. The trade-off is that
// the backend enum files must keep their simple one-member-per-line shape.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

const BACKEND_ENUM_DIR = resolve(
  REPO_ROOT,
  'services/api-service/src/alerts/enum',
);

const PYTHON_OUTPUT = resolve(
  REPO_ROOT,
  'data/pipelines/infra/data_types/enums.py',
);

const PORTAL_OUTPUT = resolve(
  REPO_ROOT,
  'shared/enums/generated/portal-enums.ts',
);

const BANNER_LINES = [
  'AUTO-GENERATED from services/api-service/src/alerts/enum/*.enum.ts -- DO NOT EDIT.',
  'Run `npm run gen:enums` (from the repo root) to regenerate.',
];

interface EnumMember {
  readonly key: string;
  readonly value: string;
}

interface EnumSpec {
  readonly name: string;
  readonly sourceFile: string;
  readonly members: readonly EnumMember[];
}

// Backend enum files to use as sources of truth, in the order they should
// appear in generated output.
const BACKEND_SOURCES: readonly { name: string; file: string }[] = [
  { name: 'HazardType', file: 'hazard-type.enum.ts' },
  { name: 'ForecastSource', file: 'forecast-source.enum.ts' },
  { name: 'Layer', file: 'layer.enum.ts' },
  { name: 'EnsembleMemberType', file: 'ensemble-member-type.enum.ts' },
];

const ENUM_HEADER = /export\s+enum\s+(\w+)\s*\{/;
const ENUM_MEMBER = /^\s*([A-Za-z_][\w]*)\s*=\s*'([^']*)'\s*,?\s*$/;

function parseBackendEnumFile(expectedName: string, filePath: string): EnumSpec {
  const text = readFileSync(filePath, 'utf8');
  const headerMatch = text.match(ENUM_HEADER);
  if (!headerMatch) {
    throw new Error(`No 'export enum' declaration found in ${filePath}`);
  }
  if (headerMatch[1] !== expectedName) {
    throw new Error(
      `Expected enum named '${expectedName}' in ${filePath}, found '${headerMatch[1]}'`,
    );
  }

  const afterHeader = text.slice(headerMatch.index! + headerMatch[0].length);
  const closeIndex = afterHeader.indexOf('}');
  if (closeIndex === -1) {
    throw new Error(`Missing closing '}' in enum body of ${filePath}`);
  }
  const body = afterHeader.slice(0, closeIndex);

  const members: EnumMember[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (line === '') {
      continue;
    }
    const memberMatch = line.match(ENUM_MEMBER);
    if (!memberMatch) {
      throw new Error(
        `Could not parse enum member line in ${filePath}: ${rawLine}`,
      );
    }
    members.push({ key: memberMatch[1], value: memberMatch[2] });
  }

  if (members.length === 0) {
    throw new Error(`Enum '${expectedName}' in ${filePath} has no members`);
  }

  return { name: expectedName, sourceFile: filePath, members };
}

function toPythonMemberName(value: string): string {
  // Existing convention: Python member name is the value upper-cased.
  // Values are expected to be either snake_case or all-caps acronyms.
  if (!/^[A-Za-z_][\w]*$/.test(value)) {
    throw new Error(
      `Cannot derive a Python identifier from value '${value}'. ` +
        `Use snake_case or an acronym.`,
    );
  }
  return value.toUpperCase();
}

function toPortalMemberName(backendKey: string): string {
  // Backend keys are lowerCamelCase; portal convention is PascalCase.
  return backendKey.charAt(0).toUpperCase() + backendKey.slice(1);
}

function pythonBanner(): string {
  return BANNER_LINES.map((line) => `# ${line}`).join('\n');
}

function tsBanner(): string {
  return BANNER_LINES.map((line) => `// ${line}`).join('\n');
}

function renderPython(specs: readonly EnumSpec[]): string {
  const blocks: string[] = [];
  for (const spec of specs) {
    const lines = [`class ${spec.name}(StrEnum):`];
    for (const member of spec.members) {
      lines.push(`    ${toPythonMemberName(member.value)} = "${member.value}"`);
    }
    blocks.push(lines.join('\n'));
  }

  return [
    pythonBanner(),
    '',
    '"""Shared enums consumed by the pipeline code.',
    '',
    'Do not edit by hand; regenerate via `npm run gen:enums` from the repo root.',
    '"""',
    '',
    'from enum import StrEnum',
    '',
    '',
    blocks.join('\n\n\n'),
    '',
  ].join('\n');
}

function renderPortal(specs: readonly EnumSpec[]): string {
  const blocks: string[] = [];
  for (const spec of specs) {
    const lines = [`export enum ${spec.name} {`];
    for (const member of spec.members) {
      lines.push(`  ${toPortalMemberName(member.key)} = '${member.value}',`);
    }
    lines.push('}');
    blocks.push(lines.join('\n'));
  }

  return [
    tsBanner(),
    '',
    '// Shared enums for the React portal. Copy this file into the portal',
    '// repository when values change.',
    '',
    blocks.join('\n\n'),
    '',
  ].join('\n');
}

interface PlannedOutput {
  readonly path: string;
  readonly content: string;
}

function plannedOutputs(specs: readonly EnumSpec[]): PlannedOutput[] {
  return [
    { path: PYTHON_OUTPUT, content: renderPython(specs) },
    { path: PORTAL_OUTPUT, content: renderPortal(specs) },
  ];
}

function readExisting(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function writeOutputs(outputs: readonly PlannedOutput[]): string[] {
  const written: string[] = [];
  for (const output of outputs) {
    if (readExisting(output.path) !== output.content) {
      mkdirSync(dirname(output.path), { recursive: true });
      writeFileSync(output.path, output.content);
      written.push(output.path);
    }
  }
  return written;
}

function checkOutputs(outputs: readonly PlannedOutput[]): string[] {
  return outputs
    .filter((output) => readExisting(output.path) !== output.content)
    .map((output) => output.path);
}

function relToRepo(path: string): string {
  return relative(REPO_ROOT, path);
}

function main(): number {
  const isCheck = process.argv.includes('--check');

  const specs = BACKEND_SOURCES.map((source) =>
    parseBackendEnumFile(source.name, resolve(BACKEND_ENUM_DIR, source.file)),
  );
  const outputs = plannedOutputs(specs);

  if (isCheck) {
    const drifted = checkOutputs(outputs);
    if (drifted.length > 0) {
      console.error('Generated enum files are out of date:');
      for (const path of drifted) {
        console.error(`  - ${relToRepo(path)}`);
      }
      console.error('Run `npm run gen:enums` and commit the changes.');
      return 1;
    }
    console.log('Generated enum files are up to date.');
    return 0;
  }

  const written = writeOutputs(outputs);
  if (written.length === 0) {
    console.log('No changes; all generated enum files are up to date.');
    return 0;
  }
  console.log('Wrote:');
  for (const path of written) {
    console.log(`  - ${relToRepo(path)}`);
  }
  return 0;
}

process.exit(main());
