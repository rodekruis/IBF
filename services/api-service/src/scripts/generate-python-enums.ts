import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  EnsembleMemberType,
  ForecastSource,
  HazardType,
  Layer,
  SeverityKey,
} from '@api-service/src/shared-enums';

type EnumObject = Record<string, string | number>;

// Add new API enums here and run manually to have them propagate into pipeline Python code.
const enumsToGenerate: { name: string; values: EnumObject }[] = [
  { name: 'EnsembleMemberType', values: EnsembleMemberType },
  { name: 'ForecastSource', values: ForecastSource },
  { name: 'HazardType', values: HazardType },
  { name: 'Layer', values: Layer },
  { name: 'SeverityKey', values: SeverityKey },
];

const SOURCE_PATH = 'services/api-service/src/shared-enums.ts';
const OUTPUT_PATH = resolve(
  __dirname,
  '../../../../data/pipelines/infra/data_types/enums.py',
);

const toUpperSnakeCase = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase();

const renderEnum = ({
  name,
  values,
}: {
  name: string;
  values: EnumObject;
}): string => {
  const members = Object.entries(values)
    .map(([memberName, value]) => {
      const pyName = toUpperSnakeCase(memberName);
      return `    ${pyName} = "${value}"`;
    })
    .join('\n');
  return `class ${name}(StrEnum):\n${members}\n`;
};

const header = `"""
AUTO-GENERATED code from ${SOURCE_PATH}

These are the enums shared between the API service and the pipeline code.
Run \`npm run generate:python\` (from the repo root) to regenerate.
"""

from enum import StrEnum
`;

const body = enumsToGenerate.map(renderEnum).join('\n\n');
const fileContents = `${header}\n\n${body}`;

writeFileSync(OUTPUT_PATH, fileContents);
console.log(`Wrote ${OUTPUT_PATH}`);
